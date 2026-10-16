import { Telegraf } from 'telegraf';
import { limitTelegramRequests } from './utils/telegram-timeout.js';
import { chooseLanguage } from './utils/i18n.js';
import { id, cleanInput } from './utils/security.js';
import { render, button } from './utils/keyboards.js';
import { isOwner, requireOwner } from './middleware/authorization.js';
import { RateLimiter } from './middleware/rate-limit.js';
import { handleError } from './middleware/error-handler.js';
import { validateImport } from './services/export-service.js';
import { readLimited } from './utils/http.js';
import { showHome, showHelp } from './handlers/main-menu.js';
import { start } from './handlers/start.js';
import { registerRadar } from './handlers/promo-radar.js';
import { registerAi } from './handlers/ai-assistant.js';
import { registerCloud } from './handlers/cloud-credit.js';
import { registerComparison } from './handlers/promo-comparison.js';
import { registerAlerts } from './handlers/expiry-alerts.js';
import { registerFavorites } from './handlers/favorites.js';
import { registerHistory } from './handlers/history.js';
import { registerProfile } from './handlers/profile.js';
import { registerSettings } from './handlers/settings.js';
import { registerReferral } from './handlers/referral.js';
import { registerAchievements } from './handlers/achievements.js';
import { registerTasks } from './handlers/tasks.js';
import { registerTickets } from './handlers/tickets.js';
import { registerExport } from './handlers/export.js';
import { registerAdmin, adminCommands } from './handlers/admin.js';
export class BotApplication {
  constructor(config, services) {
    this.config = config; this.services = services; this.sessions = new Map(); this.routes = []; this.views = {}; this.flows = {}; this.render = render;
    this.views.home = ctx => showHome(ctx, this); this.views.help = ctx => showHelp(ctx, this);
    for (const register of [registerRadar, registerAi, registerCloud, registerComparison, registerAlerts, registerFavorites, registerHistory, registerProfile, registerSettings, registerReferral, registerAchievements, registerTasks, registerTickets, registerExport, registerAdmin]) register(this);
    this.route(/^nav:([a-z]+)$/, (ctx, match) => this.navigate(ctx, match[1]));
    this.route(/^confirm:([a-f0-9]{16})$/, async (ctx, match) => {
      const confirmation = this.session(ctx).confirmation; delete this.session(ctx).confirmation;
      if (!confirmation || confirmation.id !== match[1] || confirmation.expires < Date.now()) throw new Error('Konfirmasi kedaluwarsa.');
      if (confirmation.ownerOnly) this.assertOwner(ctx);
      await confirmation.action();
    });
  }
  uid(ctx) { return String(ctx.from.id); }
  owner(ctx) { return isOwner(this.uid(ctx), this.config); }
  assertOwner(ctx) { requireOwner(this.uid(ctx), this.config); }
  t(ctx, indonesian, english) { return chooseLanguage(this.user(ctx)?.preferences.language, indonesian, english); }
  user(ctx) { return this.services.users.get(this.uid(ctx)); }
  session(ctx) {
    for (const [key, value] of this.sessions) if (value.expires < Date.now()) this.sessions.delete(key);
    const key = this.uid(ctx);
    if (!this.sessions.has(key)) { if (this.sessions.size >= 10000) throw new Error('Sesi penuh.'); this.sessions.set(key, { stack: [], expires: Date.now() + 1800000 }); }
    return this.sessions.get(key);
  }
  route(pattern, handler, ownerOnly = false) { this.routes.push({ pattern, handler, ownerOnly }); }
  async dispatch(ctx, data) {
    if (typeof data !== 'string' || !/^[a-zA-Z0-9:_-]{1,64}$/.test(data)) throw new Error('Callback tidak valid.');
    for (const route of this.routes) { const match = route.pattern.exec(data); if (match) { if (route.ownerOnly) this.assertOwner(ctx); return route.handler(ctx, match); } }
    throw new Error('Callback tidak dikenal.');
  }
  async navigate(ctx, destination) {
    const session = this.session(ctx); delete session.flow;
    if (destination === 'cancel') { delete session.confirmation; destination = 'home'; }
    else if (destination === 'back') { session.stack.pop(); destination = session.stack.pop() ?? 'home'; }
    if (!this.views[destination]) throw new Error('Menu tidak dikenal.');
    if (destination === 'admin') this.assertOwner(ctx);
    if (session.stack.at(-1) !== destination) session.stack.push(destination);
    session.stack = session.stack.slice(-20); await this.views[destination](ctx);
  }
  async ask(ctx, flow, prompt) { this.session(ctx).flow = flow; await this.render(ctx, prompt); }
  async confirm(ctx, text, action) { const confirmation = { id: id(), action, expires: Date.now() + 120000, ownerOnly: this.owner(ctx) }; this.session(ctx).confirmation = confirmation; await this.render(ctx, text, [[button('Confirm', `confirm:${confirmation.id}`)]]); }
  async text(ctx) {
    const session = this.session(ctx); const flow = session.flow;
    if (!flow || !this.flows[flow]) return this.render(ctx, 'Pilih menu terlebih dahulu / Choose a menu first.');
    const text = cleanInput(ctx.message.text, 1800);
    await this.flows[flow](ctx, text); delete session.flow;
  }
  async withSchedulerPaused(action) { await this.services.scheduler.pause(); try { return await action(); } finally { this.services.scheduler.start(); } }
  async document(ctx) {
    this.assertOwner(ctx);
    if (this.session(ctx).flow !== 'import') throw new Error('Gunakan /import dahulu.');
    const file = ctx.message.document;
    if (!file.file_size || file.file_size > 32 * 1024 * 1024) throw new Error('Ukuran file tidak valid.');
    const link = await ctx.telegram.getFileLink(file.file_id);
    if (link.protocol !== 'https:' || link.hostname !== 'api.telegram.org') throw new Error('Host file Telegram tidak valid.');
    const response = await fetch(link, { signal: AbortSignal.timeout(15000), redirect: 'error' });
    if (!response.ok) throw new Error('Unduhan gagal.');
    const buffer = Buffer.from(await readLimited(response, 32 * 1024 * 1024)); validateImport(buffer); delete this.session(ctx).flow;
    await this.confirm(ctx, 'Impor tervalidasi. Ganti database aktif? Backup pengaman akan dibuat.', async () => { await this.withSchedulerPaused(() => this.services.backup.import(buffer, this.uid(ctx))); await ctx.reply('Impor selesai.'); });
  }
}
export function createBot(config, services, options = {}) {
  const bot = new Telegraf(config.BOT_TOKEN, { handlerTimeout: 120000, telegram: { apiRoot: options.apiRoot ?? 'https://api.telegram.org' } });
  limitTelegramRequests(bot.telegram, config.REQUEST_TIMEOUT_MS);
  const app = new BotApplication(config, services); const limiter = new RateLimiter(); let queue = Promise.resolve();
  // Serialisasi update melindungi konfirmasi, sesi, dan restore dari balapan antar-update.
  bot.use((ctx, next) => { const operation = queue.then(async () => {
    if (!ctx.from || ctx.chat?.type !== 'private') return;
    limitTelegramRequests(ctx.telegram, config.REQUEST_TIMEOUT_MS);
    if (ctx.callbackQuery) await ctx.answerCbQuery().catch(() => {});
    if (!limiter.allow(app.uid(ctx))) return ctx.reply('Terlalu banyak permintaan. Coba lagi dalam satu menit.');
    if (services.store.snapshot().settings.maintenance && !app.owner(ctx)) return ctx.reply('Bot sedang dalam maintenance.');
    await services.users.ensure(ctx.from); ctx.state.language = app.user(ctx).preferences.language; await services.referral.qualify(app.uid(ctx)); return next();
  }); queue = operation.catch(() => {}); return operation; });
  bot.start(ctx => start(ctx, app)); bot.command('cancel', ctx => app.navigate(ctx, 'cancel'));
  bot.command('forget', ctx => app.dispatch(ctx, 'ai:clear'));
  bot.command('search', ctx => app.flows.search(ctx, ctx.message.text.replace(/^\/search(?:@\w+)?\s*/, '')));
  bot.command('privacy', ctx => app.render(ctx, '<b>Privasi</b>\nDisimpan: ID Telegram, username opsional, preferensi, riwayat pencarian, favorit, tiket, aktivitas/XP/referral. Tidak ada kredensial akun.\nRiwayat, notifikasi, job selesai, dan audit: 90 hari. Tiket CLOSED: 90 hari. Backup: maksimal 30 hari, 20 file, 128 MB. Profil/favorit/XP: sampai dihapus.\nKonteks AI: kategori di memori 30 menit. Jika AI aktif, hanya permintaan pencarian dikirim ke API resmi dengan store=false; kebijakan penyedia tetap berlaku.\nPenghapusan profil melalui Settings tidak menghapus salinan backup yang masih dalam retensi. Owner bertanggung jawab atas ekspor eksternal.'));
  for (const command of adminCommands) bot.command(command, ctx => app.adminAction(ctx, command, ctx.message.text.replace(/^\/\w+(?:@\w+)?\s*/, '').trim()));
  bot.on('callback_query', ctx => app.dispatch(ctx, ctx.callbackQuery.data));
  bot.on('document', ctx => app.document(ctx)); bot.on('text', ctx => app.text(ctx));
  bot.catch((error, ctx) => handleError(error, ctx, services.logger));
  return { bot, app, drain: () => queue };
}
