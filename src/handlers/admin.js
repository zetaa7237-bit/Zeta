import { z } from 'zod';
import { button as b } from '../utils/keyboards.js';
import { escapeHtml as e } from '../utils/html-escape.js';
import { paginate } from '../utils/pagination.js';
import { audit } from '../services/user-service.js';
import { cleanInput } from '../utils/security.js';
export const adminCommands = ['admin', 'stats', 'health', 'backup', 'restore', 'broadcast', 'users', 'offers', 'jobs', 'tickets', 'providers', 'maintenance', 'import', 'dbexport', 'categories', 'interval', 'xp', 'referrals', 'audit', 'proxies'];
export function registerAdmin(app) {
  const stats = () => {
    const db = app.services.store.snapshot(); const scheduler = app.services.scheduler.health();
    return `<b>Admin Dashboard</b>\nUsers: ${db.users.length} · Aktif 24h: ${db.users.filter(user => Date.now() - Date.parse(user.lastActiveAt) < 86400000).length}\nOffers: ${db.offers.length} · VERIFIED: ${db.offers.filter(item => item.status === 'VERIFIED').length} · EXPIRED: ${db.offers.filter(item => item.status === 'EXPIRED').length}\nNotifications sent: ${db.notifications.filter(item => item.sentAt).length}\nJobs RUNNING: ${db.tasks.filter(item => item.status === 'RUNNING').length} · FAILED: ${db.tasks.filter(item => item.status === 'FAILED').length}\nScheduler: ${scheduler.running ? 'RUNNING' : 'PAUSED'} · tick: ${e(scheduler.lastTickAt)}\nDatabase: VALID · single process\nStorage: ${app.config.PERSISTENT_STORAGE ? 'Dinyatakan persistent oleh operator' : 'EPHEMERAL / belum dikonfirmasi'}\nBackup terakhir: ${e(db.settings.lastBackupAt)}\nMaintenance: ${db.settings.maintenance}\nError job terakhir: ${e(db.tasks.filter(item => item.error).at(-1)?.error ?? '—')}\nProvider: ${app.services.providers.map(provider => `${provider.getName()}:${provider.isConfigured() ? provider.health : 'NOT CONFIGURED'}`).join(', ')}`;
  };
  app.views.admin = ctx => { app.assertOwner(ctx); return app.render(ctx, stats(), [[b('Backup', 'admin:backup'), b('Restore', 'admin:restore')], [b('Users', 'admin:users'), b('Offers', 'admin:offers'), b('Jobs', 'admin:jobs')], [b('Tickets', 'admin:tickets'), b('Providers', 'admin:providers')], [b('Broadcast', 'admin:broadcast'), b('Maintenance', 'admin:maintenance')], [b('Categories', 'admin:categories'), b('Interval', 'admin:interval'), b('XP', 'admin:xp')], [b('Referral', 'admin:referrals'), b('Audit', 'admin:audit'), b('Proxy', 'admin:proxies')], [b('Export DB', 'admin:dbexport'), b('Import DB', 'admin:import'), b('Refresh', 'admin:health')]]); };
  const list = async (ctx, kind, page = 0) => {
    app.assertOwner(ctx); const db = app.services.store.snapshot(); const slice = paginate([...db[kind]].reverse(), page);
    const rows = kind === 'tickets' ? slice.items.map(item => [b(`${item.id.slice(0, 8)} ${item.status}`, `ticket:view:${item.id}`)]) : [];
    const summary = item => kind === 'users' ? `${item.telegramId} · XP ${item.xp} · ${item.lastActiveAt}` : kind === 'offers' ? `${item.name} · ${item.status}` : kind === 'tasks' ? `${item.id} · ${item.type} · ${item.status} · ${item.error ?? ''}` : kind === 'auditLogs' ? `${item.at} · ${item.action} · ${item.target ?? ''}` : `${item.id} · ${item.status}`;
    await app.render(ctx, `<b>${e(kind)}</b> ${slice.page + 1}/${slice.totalPages}\n${slice.items.map(item => e(summary(item))).join('\n') || 'Kosong'}`, [...rows, [b('‹ Previous', `adminpage:${kind}:${Math.max(0, slice.page - 1)}`), b('Next ›', `adminpage:${kind}:${Math.min(slice.totalPages - 1, slice.page + 1)}`)]]);
  };
  const actions = {
    admin: ctx => app.views.admin(ctx), stats: ctx => app.render(ctx, stats()), health: ctx => app.render(ctx, stats()),
    users: ctx => list(ctx, 'users'), offers: ctx => list(ctx, 'offers'), jobs: ctx => list(ctx, 'tasks'), tickets: ctx => list(ctx, 'tickets'), audit: ctx => list(ctx, 'auditLogs'),
    backup: async ctx => { const backup = await app.services.backup.create(app.uid(ctx)); await app.render(ctx, `Backup tervalidasi dibuat: ${backup.id}\nUkuran: ${backup.bytes} byte. Backup lokal tidak melindungi dari kehilangan disk.`, [[b('Download', `backup:download:${backup.id}`)]]); },
    restore: async (ctx, arg) => {
      if (arg) return previewRestore(ctx, arg);
      const backups = app.services.store.snapshot().backups.slice(-10).reverse();
      await app.render(ctx, '<b>Restore backup</b>\nPilih backup, validasi dilakukan sebelum konfirmasi.', backups.map(item => [b(`${item.createdAt} · ${item.id.slice(0, 6)}`, `backup:restore:${item.id}`)]));
    },
    broadcast: async (ctx, arg) => arg ? previewBroadcast(ctx, arg) : app.ask(ctx, 'broadcast', 'Kirim teks broadcast maksimal 1000 karakter. Preview dan konfirmasi sebelum dikirim; maksimal 500 penerima per broadcast dan satu per jam.'),
    providers: async ctx => { const disabled = app.services.store.snapshot().settings.disabledProviders; await app.render(ctx, '<b>Providers</b>\nKonfigurasi feed melalui file lokal dan PROVIDER_CONFIG_PATH. Sumber harus diizinkan. Tombol mengaktifkan/menonaktifkan provider terkonfigurasi.', app.services.providers.map(provider => [b(`${provider.getName()} · ${!provider.isConfigured() ? 'NOT CONFIGURED' : disabled.includes(provider.getName()) ? 'OFF' : 'ON'}`, `provider:toggle:${provider.getName()}`)])); },
    maintenance: ctx => app.confirm(ctx, 'Ubah status maintenance?', async () => { await app.services.store.transaction(db => { db.settings.maintenance = !db.settings.maintenance; audit(db, app.uid(ctx), 'maintenance.toggle'); }); await app.views.admin(ctx); }),
    import: ctx => app.ask(ctx, 'import', 'Kirim dokumen JSON backup maksimal 32 MB. File akan divalidasi lalu meminta konfirmasi. Nama/path unggahan tidak digunakan.'),
    dbexport: async ctx => { await app.services.store.transaction(db => audit(db, app.uid(ctx), 'database.export')); await ctx.replyWithDocument({ source: Buffer.from(JSON.stringify(app.services.store.snapshot(), null, 2)), filename: 'nova-database.json' }); },
    categories: ctx => app.ask(ctx, 'admin_categories', `Kategori aktif: ${app.services.store.snapshot().categories.join(', ')}. Kirim subset kategori dipisahkan koma.`),
    interval: ctx => app.ask(ctx, 'admin_interval', 'Kirim interval scan 1–10080 menit.'),
    xp: ctx => app.ask(ctx, 'admin_xp', 'Format: TelegramID | XP tambahan (1–100). Aksi dicatat dan maksimal 5 penyesuaian per hari per penerima.'),
    referrals: ctx => app.render(ctx, `<b>Referral</b>\nStatus: ${app.services.store.snapshot().settings.referralsEnabled}\nTotal: ${app.services.store.snapshot().referrals.length}\nFlagged: ${app.services.store.snapshot().referrals.filter(item => item.flagged).length}`, [[b('Toggle referral', 'adminref:toggle')]]),
    proxies: ctx => app.render(ctx, '<b>Proxy Manager</b>\nKonfigurasi tambahan/penghapusan: file PROXY_CONFIG_PATH, URL rahasia dari environment. Hanya tes konektivitas endpoint yang disetujui; tidak dipakai pencarian.', [[b('Add proxy reference', 'proxy:add')], ...app.services.proxy.list().flatMap(item => [[b(`${item.id} ${item.status} ${item.latencyMs ?? '?'}ms`, `proxy:test:${item.id}`)], [b('Enable', `proxy:enable:${item.id}`), b('Disable', `proxy:disable:${item.id}`), b('Remove', `proxy:remove:${item.id}`)]])]),
  };
  async function previewRestore(ctx, backupId) {
    const data = await app.services.backup.read(backupId, app.uid(ctx));
    return app.confirm(ctx, `Restore ${backupId}? ${data.users.length} pengguna, ${data.offers.length} promo. Database aktif diganti; backup pengaman dibuat. Job lama dibatalkan dan notifikasi lama di-dismiss.`, async () => { await app.withSchedulerPaused(() => app.services.backup.restore(backupId, app.uid(ctx))); await ctx.reply('Restore selesai.'); });
  }
  async function previewBroadcast(ctx, input) {
    app.assertOwner(ctx);
    const text = cleanInput(input, 1000);
    return app.confirm(ctx, `Preview broadcast:\n${e(text)}\nHanya pengguna dengan notifikasi ON; maksimal 500.`, async () => {
      const db = app.services.store.snapshot();
      if (db.tasks.some(item => item.type === 'broadcast' && Date.now() - Date.parse(item.createdAt) < 3600000)) throw new Error('Broadcast dibatasi satu per jam.');
      const recipients = db.users.filter(item => item.preferences.notifications);
      if (recipients.length > 500) throw new Error('Lebih dari 500 penerima; batasi cakupan sebelum broadcast.');
      const task = await app.services.scheduler.enqueue('broadcast', app.uid(ctx), 'broadcast', { text, cursor: null });
      await app.services.store.transaction(draft => audit(draft, app.uid(ctx), 'broadcast.enqueue', task.id)); await ctx.reply(`Broadcast diantrekan: ${task.id}`);
    });
  }
  app.adminAction = async (ctx, name, arg) => { app.assertOwner(ctx); return actions[name](ctx, arg); };
  app.route(/^admin:(admin|stats|health|backup|restore|broadcast|users|offers|jobs|tickets|providers|maintenance|import|dbexport|categories|interval|xp|referrals|audit|proxies)$/, (ctx, match) => app.adminAction(ctx, match[1]), true);
  app.route(/^adminpage:(users|offers|tasks|tickets|auditLogs):(\d{1,5})$/, (ctx, match) => list(ctx, match[1], Number(match[2])), true);
  app.route(/^backup:restore:([a-f0-9]{16})$/, (ctx, match) => previewRestore(ctx, match[1]), true);
  app.route(/^backup:download:([a-f0-9]{16})$/, async (ctx, match) => { const data = await app.services.backup.read(match[1], app.uid(ctx)); await ctx.replyWithDocument({ source: Buffer.from(JSON.stringify(data, null, 2)), filename: `backup-${match[1]}.json` }); }, true);
  app.route(/^provider:toggle:(aws|cloud|software|entertainment)$/, async (ctx, match) => {
    if (!app.services.providers.find(provider => provider.getName() === match[1])?.isConfigured()) return ctx.reply('NOT CONFIGURED: tambahkan feed resmi ke PROVIDER_CONFIG_PATH.');
    await app.services.store.transaction(db => { const disabled = db.settings.disabledProviders; db.settings.disabledProviders = disabled.includes(match[1]) ? disabled.filter(item => item !== match[1]) : [...disabled, match[1]]; audit(db, app.uid(ctx), 'provider.toggle', match[1]); }); await actions.providers(ctx);
  }, true);
  app.route(/^adminref:toggle$/, ctx => app.confirm(ctx, 'Ubah status referral?', async () => { await app.services.store.transaction(db => { db.settings.referralsEnabled = !db.settings.referralsEnabled; audit(db, app.uid(ctx), 'referral.toggle'); }); await actions.referrals(ctx); }), true);
  app.route(/^proxy:add$/, ctx => app.ask(ctx, 'proxy_add', 'Format: id | NAMA_ENV_URL | https://host-resmi/probe-json | host-resmi. Dengan mengonfirmasi, Anda menyatakan izin tes konektivitas sumber. URL proxy/kredensial hanya di environment Render.'), true);
  app.route(/^proxy:remove:([a-z0-9_-]{1,24})$/, (ctx, match) => app.confirm(ctx, `Hapus referensi proxy ${match[1]}?`, async () => { app.assertOwner(ctx); await app.services.proxy.remove(app.uid(ctx), match[1]); await actions.proxies(ctx); }), true);
  app.flows.proxy_add = async (ctx, text) => {
    app.assertOwner(ctx); const [id, urlEnv, probeUrl, host] = text.split('|').map(item => item.trim());
    const config = { id, urlEnv, probeUrl, allowedHosts: [host], permissionConfirmed: true };
    await app.confirm(ctx, `Tambahkan referensi proxy ${e(id)} untuk ${e(host)}? Anda harus memiliki izin sumber.`, async () => { app.assertOwner(ctx); await app.services.proxy.add(app.uid(ctx), config); await actions.proxies(ctx); });
  };
  app.route(/^proxy:(test|enable|disable):([a-z0-9_-]{1,24})$/, async (ctx, match) => { if (match[1] === 'test') await app.services.proxy.test(app.uid(ctx), match[2]); else await app.services.proxy.toggle(app.uid(ctx), match[2], match[1] === 'enable'); await actions.proxies(ctx); }, true);
  app.flows.broadcast = previewBroadcast;
  app.flows.admin_categories = async (ctx, text) => { app.assertOwner(ctx); const values = [...new Set(text.split(',').map(item => item.trim()))]; await app.services.store.transaction(db => { db.categories = values; audit(db, app.uid(ctx), 'categories.update'); }); await ctx.reply('Kategori diperbarui.'); };
  app.flows.admin_interval = async (ctx, text) => { app.assertOwner(ctx); await app.services.store.transaction(db => { db.settings.scanIntervalMinutes = Number(text); audit(db, app.uid(ctx), 'interval.update'); }); await ctx.reply('Interval diperbarui.'); };
  app.flows.admin_xp = async (ctx, text) => {
    app.assertOwner(ctx); const [target, raw] = text.split('|').map(value => value.trim()); const amount = z.coerce.number().int().min(1).max(100).parse(raw);
    await app.confirm(ctx, `Tambahkan ${amount} XP ke ${e(target)}?`, async () => {
      await app.services.store.transaction(db => { const user = db.users.find(item => item.telegramId === target); if (!user) throw new Error('Pengguna tidak ditemukan.');
        const day = new Date().toISOString().slice(0, 10); const count = db.auditLogs.filter(item => item.action === 'xp.adjust' && item.target === target && item.at.startsWith(day)).length;
        if (count >= 5 || user.xpHistory.length >= 1000) throw new Error('Batas penyesuaian tercapai.');
        user.xp += amount; user.xpHistory.push({ key: `admin:${day}:${count}`, activity: 'admin', amount, at: new Date().toISOString() }); audit(db, app.uid(ctx), 'xp.adjust', target);
      }); await ctx.reply('XP diperbarui.');
    });
  };
}
