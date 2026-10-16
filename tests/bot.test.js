import { afterEach, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { BotApplication, createBot } from '../src/bot.js';
import { createServices } from '../src/services/index.js';
import { loadConfig } from '../src/config.js';
import { menuEntries } from '../src/handlers/main-menu.js';
import { adminCommands } from '../src/handlers/admin.js';
import { offer, context, token, OWNER, USER } from './helpers.js';
const resources = []; afterEach(async () => { for (const close of resources.splice(0)) await close(); });
async function fixture() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'nova-bot-'));
  const config = loadConfig({ BOT_TOKEN: token(), OWNER_ID: OWNER, NODE_ENV: 'test', LOG_LEVEL: 'silent', DATABASE_PATH: path.join(directory, 'db.json'), BACKUP_PATH: path.join(directory, 'backups'), BACKUP_ENABLED: 'false' });
  const services = await createServices(config, vi.fn()); const app = new BotApplication(config, services);
  await services.users.ensure({ id: Number(OWNER) }); await services.users.ensure({ id: Number(USER) });
  resources.push(async () => { await services.scheduler.stop(); await services.store.close(); await fs.rm(directory, { recursive: true, force: true }); });
  return { app, config, services };
}
it('all 17 menus render and every displayed callback has exactly one route', async () => {
  const { app, services } = await fixture(); const ctx = context(OWNER); const values = [offer(), offer({ officialUrl: 'https://example.com/second', dedupHash: 'b'.repeat(64) })]; await services.store.transaction(db => { db.offers.push(...values); });
  for (const destination of ['home', ...menuEntries.map(([key]) => key), 'admin']) await app.navigate(ctx, destination);
  for (const value of values) await app.dispatch(ctx, `offer:${value.id}`);
  await app.dispatch(ctx, 'ticket:new'); ctx.message.text = 'bug | NORMAL | fixture bug'; await app.text(ctx);
  await app.dispatch(ctx, `ticket:view:${services.store.snapshot().tickets[0].id}`);
  await app.adminAction(ctx, 'backup'); await app.adminAction(ctx, 'restore'); await app.dispatch(ctx, 'history:clear');
  for (const message of ctx.messages) for (const row of message.options?.reply_markup?.inline_keyboard ?? []) for (const button of row) {
    expect(Buffer.byteLength(button.callback_data)).toBeLessThanOrEqual(64);
    expect(app.routes.filter(route => route.pattern.test(button.callback_data)), button.callback_data).toHaveLength(1);
  }
});
it('every admin command denies non-owner and stale/foreign confirmations fail', async () => {
  const { app } = await fixture(); const ctx = context(USER);
  for (const command of adminCommands) await expect(app.adminAction(ctx, command)).rejects.toThrow('owner');
  await expect(app.dispatch(ctx, 'nav:admin')).rejects.toThrow(); await expect(app.dispatch(ctx, 'provider:toggle:aws')).rejects.toThrow();
  for (const data of ['../etc', 'a'.repeat(65), 'not:registered', 'offer:123', undefined]) await expect(app.dispatch(ctx, data)).rejects.toThrow();
  const owner = context(OWNER); const action = vi.fn(); await app.confirm(owner, 'confirm', action); const confirmation = app.session(owner).confirmation.id;
  await expect(app.dispatch(ctx, `confirm:${confirmation}`)).rejects.toThrow(); await app.dispatch(owner, `confirm:${confirmation}`); expect(action).toHaveBeenCalledTimes(1);
  await expect(app.dispatch(owner, `confirm:${confirmation}`)).rejects.toThrow();
});
it('user flows search, favorites, comparison, settings, history and deletion persist', async () => {
  const { app, services } = await fixture(); const ctx = context(); const first = offer(); const second = offer({ dedupHash: 'c'.repeat(64), officialUrl: 'https://example.com/b' });
  await services.store.transaction(db => db.offers.push(first, second));
  await app.dispatch(ctx, 'radar:search'); ctx.message.text = 'sintetis | category=cloud'; await app.text(ctx); expect(services.store.snapshot().searchHistory).toHaveLength(1);
  await app.dispatch(ctx, `favorite:${first.id}`); expect(services.store.snapshot().favorites).toHaveLength(1);
  await app.dispatch(ctx, `compare:add:${first.id}`); await app.dispatch(ctx, `compare:add:${second.id}`); await app.dispatch(ctx, 'compare:run'); expect(ctx.messages.at(-1).text).toContain('Perbandingan');
  await app.dispatch(ctx, 'settings:timezone'); ctx.message.text = 'Europe/London'; await app.text(ctx); expect(services.users.get(USER).preferences.timezone).toBe('Europe/London');
  await app.dispatch(ctx, 'settings:language:en'); expect(services.users.get(USER).preferences.language).toBe('en');
  await app.navigate(ctx, 'profile'); expect(ctx.messages.at(-1).text).toContain('Joined:');
  await app.dispatch(ctx, `offer:${first.id}`); expect(ctx.messages.at(-1).text).toContain('Eligibility:');
  await app.dispatch(ctx, 'export:favorites'); expect(ctx.replyWithDocument).toHaveBeenCalled();
  await app.dispatch(ctx, 'settings:delete'); await app.dispatch(ctx, `confirm:${app.session(ctx).confirmation.id}`); expect(services.users.get(USER)).toBeUndefined(); expect(services.store.snapshot().favorites).toHaveLength(0);
});
it('Telegraf update pipeline invokes real commands and blocks forged admin callback', async () => {
  const { services, config } = await fixture(); const { bot } = createBot(config, services); bot.botInfo = { id: 123456, is_bot: true, username: 'nova_fixture_bot', first_name: 'Nova' };
  const calls = []; // Mock pada boundary Telegram, handler dan middleware asli tetap dijalankan.
  const api = vi.spyOn(Object.getPrototypeOf(bot.telegram), 'callApi').mockImplementation(async (method, payload) => { calls.push({ method, payload }); return true; });
  try {
    const message = text => ({ update_id: Date.now(), message: { message_id: 1, date: 1, from: { id: Number(USER), is_bot: false, first_name: 'Fixture' }, chat: { id: Number(USER), type: 'private' }, text, entities: [{ offset: 0, length: text.split(' ')[0].length, type: 'bot_command' }] } });
    await bot.handleUpdate(message('/start')); await bot.handleUpdate(message('/search cloud')); await bot.handleUpdate(message('/admin'));
    expect(calls.some(call => call.method === 'sendMessage' && call.payload.text.includes('NOVA HUNTER'))).toBe(true);
    expect(calls.some(call => call.method === 'sendMessage' && call.payload.text.includes('Admin Dashboard'))).toBe(false);
    expect(services.store.snapshot().searchHistory).toHaveLength(1);
    await bot.handleUpdate({ update_id: 2, callback_query: { id: 'query', from: { id: Number(USER), is_bot: false, first_name: 'Fixture' }, data: 'admin:maintenance', chat_instance: 'fixture', message: { message_id: 2, date: 1, chat: { id: Number(USER), type: 'private' } } } });
    expect(services.store.snapshot().settings.maintenance).toBe(false);
  } finally { api.mockRestore(); }
});
it('owner commands all execute, broadcast preview requires confirmation and bounded jobs', async () => {
  const { app, services } = await fixture(); const ctx = context(OWNER);
  for (const command of adminCommands) await app.adminAction(ctx, command);
  await app.adminAction(ctx, 'broadcast', 'Pesan pengujian'); expect(services.store.snapshot().tasks.filter(task => task.type === 'broadcast')).toHaveLength(0);
  await app.dispatch(ctx, `confirm:${app.session(ctx).confirmation.id}`);
  await services.scheduler.tick(); expect(services.store.snapshot().tasks.find(task => task.type === 'broadcast').status).toBe('COMPLETED');
  await app.adminAction(ctx, 'broadcast', 'Pesan kedua'); await expect(app.dispatch(ctx, `confirm:${app.session(ctx).confirmation.id}`)).rejects.toThrow('satu per jam');
});
