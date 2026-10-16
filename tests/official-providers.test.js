import fs from 'node:fs/promises';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { MockAgent } from 'undici';
import { createProviders } from '../src/providers/index.js';
import { OfficialPageProvider, pageText } from '../src/providers/official-page-provider.js';
import { officialSources } from '../src/providers/official-sources.js';
import { fetchText } from '../src/utils/http.js';
import { PromoService } from '../src/services/promo-service.js';
import { BotApplication } from '../src/bot.js';
import { loadConfig } from '../src/config.js';
import { startPeriodic } from '../src/services/index.js';
import { setup, logger, context, OWNER, token } from './helpers.js';

const resources = [];
afterEach(async () => { vi.useRealTimers(); for (const resource of resources.splice(0)) await resource.close(); });
const robots = 'User-agent: *\nAllow: /\n';
function provider(name = 'aws', html = '<main>Get up to $200 in credits for new customers. Receive up to $200 USD free credits. That’s up to $200 over 6 months. You won’t be charged unless you convert to a Paid plan.</main>') {
  let time = Date.now();
  const request = vi.fn(async url => url.endsWith('/robots.txt') ? robots : html);
  const item = new OfficialPageProvider(name, officialSources[name], { request, clock: () => time });
  return { item, request, advance: () => { time += 3600001; } };
}
it('default providers need no credentials; custom feeds override only their own category', async () => {
  const providers = await createProviders(); expect(providers).toHaveLength(4); expect(providers.every(item => item.isConfigured())).toBe(true);
  expect((await createProviders('', { builtinEnabled: false })).every(item => !item.isConfigured())).toBe(true);
  const resource = await setup(); resources.push(resource);
  const filename = path.join(resource.directory, 'providers.json');
  await fs.writeFile(filename, JSON.stringify([{ id: 'aws', endpoint: 'https://example.com/feed', allowedHosts: ['example.com'], permissionConfirmed: true }]));
  const overrides = await createProviders(filename);
  expect((await overrides[0].healthCheck()).source).toBe('https://example.com/feed');
  expect(overrides[1]).toBeInstanceOf(OfficialPageProvider);
});
it('parses only visible HTML and verifies credit maximum with explicit USD evidence', async () => {
  const { item, request } = provider();
  const [offer] = await item.searchOffers();
  expect(offer).toMatchObject({ status: 'VERIFIED', benefitValue: 200, currency: 'USD', duration: '6 months', benefitType: 'credit (maksimum bersyarat)', expiresAt: null, regions: [] });
  expect(offer.source).toBe(officialSources.aws.url); expect(offer.checkedAt).toBeTruthy();
  expect(request.mock.calls[1][1]).toMatchObject({ allowedHosts: ['aws.amazon.com'], maxBytes: 3145728 });
  expect(pageText('<script>fake</script><div hidden>hidden</div><p>A &amp; B</p><p>C</p>')).toBe('A & B C');
  await expect(item.searchOffers()).rejects.toHaveProperty('retryAfterMs'); expect(request).toHaveBeenCalledTimes(2);
});
it('content changes downgrade facts; HTML instructions/scripts never become offer evidence', async () => {
  const { item } = provider('aws', '<main>Access denied</main><script>Get up to $200 in credits for new customers</script>');
  expect((await item.searchOffers())[0]).toMatchObject({ status: 'UNKNOWN', benefitValue: null, currency: null });
  expect((await item.healthCheck()).status).toBe('CONTENT_CHANGED');
  const { item: cloud } = provider('cloud', '<p>New customers get $500 in free credit to try Google Cloud products and build apps.</p>');
  const [offer] = await cloud.searchOffers();
  expect(offer.eligibility).toContain('$500'); expect(offer.benefitValue).toBeNull(); expect(offer.currency).toBeNull();
});
it('Netflix official denial is UNAVAILABLE, never a premium claim or signup automation', async () => {
  const { item } = provider('entertainment', '<article>Netflix does not offer free trials</article>');
  const [offer] = await item.searchOffers(); expect(offer).toMatchObject({ status: 'UNAVAILABLE', registrationUrl: null, benefitValue: null });
});
it('robots denial and unreadable policy prevent fetching the offer page', async () => {
  const { item, request } = provider(); request.mockResolvedValue('User-agent: *\nDisallow: /free/\n');
  await expect(item.searchOffers()).rejects.toThrow('melarang'); expect(request).toHaveBeenCalledTimes(1); expect(item.health).toBe('BLOCKED');
  const { item: invalid, request: invalidRequest } = provider(); invalidRequest.mockResolvedValue('<html>captcha</html>');
  await expect(invalid.searchOffers()).rejects.toThrow('Robots'); expect(invalidRequest).toHaveBeenCalledTimes(1);
});
it('HTTP timeout/retry delay and same-host allowlist propagate; cache robots between checks', async () => {
  const { item, request, advance } = provider();
  await item.searchOffers(); advance();
  request.mockImplementation(async () => { throw Object.assign(new Error('HTTP 429'), { retryAfterMs: 7200000 }); });
  await expect(item.searchOffers()).rejects.toMatchObject({ retryAfterMs: 7200000 });
  expect(request.mock.calls.filter(([url]) => url.endsWith('/robots.txt'))).toHaveLength(1); expect(item.health).toBe('ERROR');
  const controller = new AbortController(); controller.abort();
  const { item: aborted } = provider(); await expect(aborted.searchOffers('', {}, controller.signal)).rejects.toThrow();
});
it('secure text transport rejects redirects, response overflow, and private host input', async () => {
  const agent = new MockAgent(); agent.disableNetConnect(); resources.push(agent);
  const pool = agent.get('https://example.com');
  pool.intercept({ path: '/redirect' }).reply(302, '', { headers: { location: 'http://127.0.0.1/' } });
  await expect(fetchText('https://example.com/redirect', { allowedHosts: ['example.com'], dispatcher: agent })).rejects.toThrow();
  pool.intercept({ path: '/large' }).reply(200, '12345');
  await expect(fetchText('https://example.com/large', { allowedHosts: ['example.com'], dispatcher: agent, maxBytes: 4 })).rejects.toThrow('besar');
  await expect(fetchText('https://127.0.0.1/', { allowedHosts: ['127.0.0.1'], dispatcher: agent })).rejects.toThrow();
});
it('scan persists real-contract records, deduplicates refresh, and downgrades stale data on source failure', async () => {
  const resource = await setup(); resources.push(resource);
  const { item, advance, request } = provider(); const logs = logger();
  const promo = new PromoService(resource.store, [item], logs);
  await promo.scan(); const first = resource.store.snapshot().offers[0];
  advance(); await promo.scan(); expect(resource.store.snapshot().offers).toHaveLength(1); expect(resource.store.snapshot().offers[0].id).toBe(first.id);
  advance(); request.mockRejectedValue(new Error('offline'));
  await expect(promo.scan()).rejects.toThrow('Seluruh');
  expect(resource.store.snapshot().offers[0]).toMatchObject({ status: 'UNVERIFIED', benefitValue: null, currency: null });
});
it('radar shows automatic sources and every displayed callback resolves', async () => {
  const resource = await setup(); resources.push(resource); const ctx = context(OWNER);
  const providers = await createProviders();
  const app = new BotApplication(loadConfig({ BOT_TOKEN: token(), OWNER_ID: OWNER }), { ...resource, providers });
  await app.navigate(ctx, 'radar');
  const message = ctx.messages.at(-1); expect(message.text).toContain('Pemeriksaan otomatis'); expect(message.text).not.toContain('NOT CONFIGURED: owner');
  for (const row of message.options.reply_markup.inline_keyboard) for (const button of row) if (button.callback_data) expect(app.routes.some(route => route.pattern.test(button.callback_data))).toBe(true);
  await app.dispatch(ctx, 'nav:radar');
});

it('scheduler automatically scans newly added sources once even when previous interval has not elapsed', async () => {
  const resource = await setup(); resources.push(resource);
  await resource.store.transaction(db => { db.settings.lastScanAt = new Date().toISOString(); });
  const enqueue = vi.fn().mockResolvedValue({});
  const services = { store: resource.store, providers: await createProviders(), scheduler: { health: () => ({ running: true }), enqueue }, logger: logger() };
  vi.useFakeTimers();
  const stop = startPeriodic(services, { OWNER_ID: OWNER, BACKUP_ENABLED: false });
  try {
    await vi.advanceTimersByTimeAsync(0);
    expect(enqueue.mock.calls.filter(([type]) => type === 'scan')).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(60000);
    expect(enqueue.mock.calls.filter(([type]) => type === 'scan')).toHaveLength(1);
  } finally { await stop(); }
});
