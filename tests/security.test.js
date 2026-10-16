import { expect, it, vi } from 'vitest';
import { loadConfig } from '../src/config.js';
import { isPublicAddress, fetchJson } from '../src/utils/http.js';
import { escapeHtml } from '../src/utils/html-escape.js';
import { splitHtml, render } from '../src/utils/keyboards.js';
import { RateLimiter } from '../src/middleware/rate-limit.js';
import { requireOwner } from '../src/middleware/authorization.js';
import { handleError } from '../src/middleware/error-handler.js';
import { createLogger } from '../src/utils/logger.js';
import { context, logger, token, OWNER, USER } from './helpers.js';
it('configuration bounds, booleans, optional AI and secrets never in errors', () => {
  const config = loadConfig({ BOT_TOKEN: token(), OWNER_ID: OWNER, BACKUP_ENABLED: 'false' }); expect(config.BACKUP_ENABLED).toBe(false); expect(config.AI_PROVIDER).toBe('none'); expect(config.REFERRAL_ENABLED).toBe(true); expect(config.XP_ENABLED).toBe(true); expect(config.PERSISTENT_STORAGE).toBe(false);
  expect(() => loadConfig({ BOT_TOKEN: 'very-private' })).toThrow('BOT_TOKEN, OWNER_ID');
  try { loadConfig({ BOT_TOKEN: 'very-private' }); } catch (error) { expect(error.message).not.toContain('very-private'); }
  expect(() => loadConfig({ BOT_TOKEN: token(), OWNER_ID: OWNER, MAX_CONCURRENT_CHECKS: '500' })).toThrow();
  expect(() => loadConfig({ BOT_TOKEN: token(), OWNER_ID: OWNER, AI_PROVIDER: 'openai' })).toThrow('AI_PROVIDER');
});
it.each(['127.0.0.1', '10.1.1.1', '169.254.169.254', '192.168.1.1', '::1', '::ffff:127.0.0.1', 'fc00::1', 'fe80::1', '224.0.0.1', '0.0.0.0'])('rejects SSRF address %s', address => { expect(isPublicAddress(address)).toBe(false); });
it('SSRF exact host, credentials and IP URLs blocked before request', async () => {
  expect(isPublicAddress('8.8.8.8')).toBe(true);
  await expect(fetchJson('https://127.0.0.1/a', { allowedHosts: ['127.0.0.1'] })).rejects.toThrow();
  await expect(fetchJson('https://example.com.evil.test/a', { allowedHosts: ['example.com'] })).rejects.toThrow();
  await expect(fetchJson('https://user:pass@example.com/a', { allowedHosts: ['example.com'] })).rejects.toThrow();
});
it('owner authority strict and rate limit window bounded', () => {
  expect(() => requireOwner(USER, { OWNER_ID: OWNER })).toThrow(); expect(() => requireOwner(OWNER, { OWNER_ID: OWNER })).not.toThrow();
  const limiter = new RateLimiter({ limit: 2, windowMs: 100 }); expect(limiter.allow(USER, 0)).toBe(true); expect(limiter.allow(USER, 1)).toBe(true); expect(limiter.allow(USER, 2)).toBe(false); expect(limiter.allow(USER, 101)).toBe(true);
});
it('HTML escaping, long entity-safe split, message edit fallback', async () => {
  expect(escapeHtml('<b>&"\'')).toBe('&lt;b&gt;&amp;&quot;&#39;');
  const chunks = splitHtml(`<b>${escapeHtml('&'.repeat(3000))}</b>`); expect(chunks.length).toBeGreaterThan(1); expect(chunks.every(chunk => chunk.length <= 3500 && chunk.startsWith('<b>') && chunk.endsWith('</b>'))).toBe(true);
  const ctx = context(); ctx.callbackQuery = { message: {} }; ctx.editMessageText.mockRejectedValue(new Error('cannot edit')); await render(ctx, 'text'); expect(ctx.reply).toHaveBeenCalled();
});
it('global errors only expose sanitized code and correlation reference', async () => {
  const ctx = context(); const logs = logger(); await handleError(new Error('password=secret'), ctx, logs); expect(ctx.messages[0].text).not.toContain('secret'); expect(ctx.messages[0].text).toContain('Referensi');
  const log = createLogger({ LOG_LEVEL: 'silent' }); expect(() => log.error({ err: new Error('secret') }, 'test')).not.toThrow();
});
it('source URLs cannot persist credentials in query parameters', async () => {
  await expect(fetchJson('https://example.com/feed?api_key=private', { allowedHosts: ['example.com'] })).rejects.toThrow();
});
