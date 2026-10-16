import { afterEach, describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import fs from 'node:fs/promises';
import { setup, offer, USER, OWNER, logger } from './helpers.js';
import { PromoService } from '../src/services/promo-service.js';
import { AlertService } from '../src/services/alert-service.js';
import { NotificationService } from '../src/services/notification-service.js';
import { MockProvider } from '../src/providers/mock-provider.js';
import { BaseProvider } from '../src/providers/base-provider.js';
import { BackupService } from '../src/services/backup-service.js';
import { TicketService } from '../src/services/ticket-service.js';
import { ReferralService } from '../src/services/referral-service.js';
import { ExportService, csvCell, validateImport } from '../src/services/export-service.js';
import { awardXp } from '../src/services/achievement-service.js';
import { AiService, OpenAiAdapter } from '../src/services/ai-service.js';
import { compareOffers } from '../src/services/comparison-service.js';
const resources = []; afterEach(async () => { vi.useRealTimers(); await Promise.all(resources.splice(0).map(item => item.close())); });
async function fixture() { const item = await setup(); resources.push(item); return item; }
describe('layanan domain', () => {
  it('deduplikasi URL, mempertahankan ID, isolasi provider gagal, filter lokal', async () => {
    const { store } = await fixture(); const source = new MockProvider([offer()]); const broken = new MockProvider(); broken.searchOffers = vi.fn().mockRejectedValue(new Error('offline'));
    const promo = new PromoService(store, [source, broken], logger());
    expect(await promo.scan()).toContain('ERROR'); const first = store.snapshot().offers[0];
    source.offers = [offer({ name: 'Updated fixture' })]; await promo.scan(); expect(store.snapshot().offers).toHaveLength(1); expect(store.snapshot().offers[0].id).toBe(first.id);
    expect(promo.search('fixture', { category: 'cloud', region: 'Indonesia', benefit: 'credit' })).toHaveLength(1);
    expect(promo.search('fixture', { category: 'ai' })).toHaveLength(0);
    await promo.searchFor(USER, 'fixture'); expect(store.snapshot().searchHistory).toHaveLength(1);
  });
  it('provider kosong jujur dan semua kegagalan dapat di-retry', async () => {
    const { store } = await fixture(); const promo = new PromoService(store, [new BaseProvider('aws')], logger()); expect(await promo.scan()).toContain('NOT CONFIGURED'); expect(store.snapshot().offers).toHaveLength(0);
    const broken = new MockProvider(); broken.searchOffers = vi.fn().mockRejectedValue(new Error('offline')); promo.providers = [broken]; await expect(promo.scan()).rejects.toThrow();
  });
  it('feed menolak host asing dan menurunkan kepastian data lama', async () => {
    const fixtureOffer = offer({ provider: 'aws', checkedAt: '2020-01-01T00:00:00.000Z' });
    const provider = new BaseProvider('aws', { id: 'aws', endpoint: 'https://example.com/feed', allowedHosts: ['example.com'], permissionConfirmed: true }, vi.fn().mockResolvedValue([fixtureOffer]));
    expect((await provider.searchOffers())[0]).toMatchObject({ status: 'UNVERIFIED', benefitValue: null });
    provider.nextAllowedAt = 0; provider.request.mockResolvedValue([{ ...fixtureOffer, source: 'https://evil.example.net/path' }]); await expect(provider.searchOffers()).rejects.toThrow();
  });
  it('alert expiry idempoten, cooldown, snooze, dismiss dan kepemilikan', async () => {
    const { store } = await fixture(); const value = offer(); await store.transaction(db => { db.offers.push(value); });
    const promo = new PromoService(store, [], logger()); await promo.toggleFavorite(USER, value.id);
    const alerts = new AlertService(store); await alerts.check(); await alerts.check(); expect(store.snapshot().notifications).toHaveLength(1);
    const send = vi.fn(); const notifications = new NotificationService(store, send); await notifications.deliver(); await notifications.deliver(); expect(send).toHaveBeenCalledTimes(1);
    const item = store.snapshot().notifications[0]; expect(item.text).toContain('bukan penggunaan akun');
    await expect(notifications.act(OWNER, item.id, 'dismiss')).rejects.toThrow();
    await notifications.act(USER, item.id, 'snooze'); await notifications.deliver(); expect(send).toHaveBeenCalledTimes(1);
    await notifications.act(USER, item.id, 'dismiss'); expect(store.snapshot().notifications[0].dismissed).toBe(true);
  });
  it('tiket terikat user/ID, balasan admin, status, batas aktif dan spam', async () => {
    const { store } = await fixture(); const tickets = new TicketService(store, OWNER);
    const ticket = await tickets.create(USER, 'bug', 'HIGH', 'Menu tidak dapat dibuka');
    await expect(tickets.create(USER, 'bug', 'NORMAL', 'Lagi')).rejects.toThrow('menit');
    await expect(tickets.reply('99999', ticket.id, 'Akses palsu')).rejects.toThrow();
    await tickets.reply(OWNER, ticket.id, 'Silakan coba lagi'); expect(store.snapshot().tickets[0].status).toBe('WAITING_USER');
    await tickets.reply(USER, ticket.id, 'Sudah bisa'); await tickets.setStatus(OWNER, ticket.id, 'RESOLVED'); await tickets.setStatus(USER, ticket.id, 'CLOSED');
    await expect(tickets.reply(USER, ticket.id, 'terlambat')).rejects.toThrow('ditutup'); expect(store.snapshot().tickets[0].replies).toHaveLength(3);
  });
  it('referral menolak self/reuse dan reward ditunda sampai hari berikutnya', async () => {
    const { store, users } = await fixture(); const referral = new ReferralService(store);
    await expect(referral.apply(USER, users.get(USER).referralCode)).rejects.toThrow();
    await referral.apply(USER, users.get(OWNER).referralCode); await expect(referral.apply(USER, users.get(OWNER).referralCode)).rejects.toThrow();
    expect(await referral.qualify(USER)).toBe(false);
    await store.transaction(db => { db.users.find(user => user.telegramId === USER).activityDays.push('2000-01-01'); });
    expect(await referral.qualify(USER)).toBe(true); expect(await referral.qualify(USER)).toBe(false);
  });
  it('XP idempoten walaupun favorit dibatalkan, membatasi reward', async () => {
    const { store } = await fixture(); await store.transaction(db => { for (let index = 0; index < 20; index++) awardXp(db, USER, 'search', String(index)); awardXp(db, USER, 'search', '0'); });
    const user = store.snapshot().users.find(user => user.telegramId === USER); expect(user.xpHistory.filter(item => item.activity === 'search')).toHaveLength(5);
    expect(store.snapshot().userAchievements.filter(item => item.userId === USER && item.achievementId === 'first-search')).toHaveLength(1);
  });
  it('ekspor milik sendiri, CSV injection, impor strict dan ukuran', async () => {
    const { store } = await fixture(); const exports = new ExportService(store);
    expect(csvCell('  =HYPERLINK("evil")')).toBe('"\'  =HYPERLINK(""evil"")"'); expect(csvCell('a,b')).toBe('"a,b"');
    expect(exports.create(USER, 'profile').source.toString()).not.toContain(OWNER);
    await expect(Promise.resolve().then(() => validateImport(Buffer.from('{"token":"secret"}')))).rejects.toThrow();
    expect(() => validateImport(Buffer.alloc(32 * 1024 * 1024 + 1))).toThrow();
    expect(() => exports.create(USER, '../../password')).toThrow();
  });
  it('backup, restore, import: owner, path traversal, validation, pre-restore backup', async () => {
    const { store, directory } = await fixture(); const backup = new BackupService(store, path.join(directory, 'backups'), OWNER);
    const first = await backup.create(OWNER); await expect(backup.restore(first.id, USER)).rejects.toThrow(); await expect(backup.read('../../secret', OWNER)).rejects.toThrow();
    await store.transaction(db => { db.settings.maintenance = true; }); await backup.restore(first.id, OWNER);
    expect(store.snapshot().settings.maintenance).toBe(false); expect(store.snapshot().backups).toHaveLength(2);
    expect(store.snapshot().auditLogs.at(-1).action).toBe('backup.restore');
    const before = store.snapshot(); await expect(backup.import(Buffer.from('{}'), OWNER)).rejects.toThrow(); expect(store.snapshot()).toEqual(before);
    expect((await fs.readdir(path.join(directory, 'backups'))).filter(file => file.endsWith('.json'))).toHaveLength(2);
  });
  it('AI fallback, injection/secret rejection, usage bound and official request contract', async () => {
    const { store } = await fixture(); const promo = new PromoService(store, [], logger()); const ai = new AiService(promo, { parseIntent: vi.fn().mockRejectedValue(new Error('down')) });
    expect((await ai.search(USER, 'cloud')).mode).toContain('KEYWORD');
    await expect(ai.search(USER, 'password=abcdef')).rejects.toThrow();
    for (let index = 0; index < 4; index++) await ai.search(USER, 'cloud'); await expect(ai.search(USER, 'cloud')).rejects.toThrow('5 permintaan');
    const request = vi.fn().mockResolvedValue({ output: [{ content: [{ type: 'output_text', text: '{"keywords":"cloud","category":"cloud"}' }] }] });
    const adapter = new OpenAiAdapter({ AI_API_KEY: 'fixture', AI_MODEL: 'fixture-model', REQUEST_TIMEOUT_MS: 1000 }, request);
    expect(await adapter.parseIntent('cloud')).toEqual({ keywords: 'cloud', category: 'cloud' }); const body = JSON.parse(request.mock.calls[0][1].body); expect(body.store).toBe(false); expect(body.max_output_tokens).toBe(200);
  });
  it('comparison tidak menyamakan nilai mata uang, menampilkan UNKNOWN', () => {
    const text = compareOffers([offer({ benefitValue: null, currency: null }), offer({ currency: 'EUR' })]); expect(text).toContain('UNKNOWN'); expect(text).toContain('Tidak ada konversi'); expect(text).toContain('EUR');
  });
});
it('proxy references persist without credential values and enforce owner access', async () => {
  const { ProxyService } = await import('../src/services/proxy-service.js'); const { store, directory } = await fixture();
  const filename = path.join(directory, 'proxies.json'); const proxy = new ProxyService(store, OWNER, [], {}, filename);
  const config = { id: 'qa', urlEnv: 'NOVA_PROXY_QA_URL', probeUrl: 'https://example.com/health.json', allowedHosts: ['example.com'], permissionConfirmed: true };
  await expect(proxy.add(USER, config)).rejects.toThrow(); await proxy.add(OWNER, config); expect(proxy.list()).toHaveLength(1);
  expect(await fs.readFile(filename, 'utf8')).toContain('NOVA_PROXY_QA_URL'); await proxy.toggle(OWNER, 'qa', false); expect(proxy.list()[0].status).toBe('DISABLED');
  await expect(proxy.test(OWNER, 'qa')).rejects.toThrow('tidak aktif'); await proxy.remove(OWNER, 'qa'); expect(proxy.list()).toHaveLength(0);
});
