import { button as b } from '../utils/keyboards.js';
import { paginate } from '../utils/pagination.js';
import { escapeHtml as e } from '../utils/html-escape.js';
export function registerAlerts(app) {
  app.views.alerts = ctx => app.render(ctx, app.t(ctx, "<b>Expiry & Cost Alerts</b>\nSimpan promo sebagai favorit untuk memantau kedaluwarsa, syarat, dan billing publik. Risiko biaya dicantumkan pada alert tanggal.\nPemakaian benefit dan tagihan akun: UNKNOWN. Tidak ada integrasi akun cloud.\nAtur zona waktu, hari pengingat, dan frekuensi di Settings.", "<b>Expiry & Cost Alerts</b>\nSave favorites to track expiry, terms, and public billing information. Date alerts include potential costs.\nActual account usage and bills: UNKNOWN. No cloud account integration.\nSet timezone, notice days, and frequency in Settings."), [[b('Notifications', 'nav:notifications'), b('Settings', 'nav:settings')]]);
  const show = async (ctx, page = 0) => {
    const items = paginate(app.services.store.snapshot().notifications.filter(item => item.userId === app.uid(ctx) && !item.dismissed).reverse(), page, 3);
    await app.render(ctx, '<b>Notifications</b>\n' + (items.items.map(item => `${e(item.text)}\nStatus: ${item.sentAt ? 'SENT' : item.snoozedUntil ? 'SNOOZED' : 'PENDING'}`).join('\n\n') || app.t(ctx, "Belum ada notifikasi.", "No notifications yet.")), [...items.items.map(item => [b(`Snooze ${item.id.slice(0, 6)}`, `notice:snooze:${item.id}`), b('Dismiss', `notice:dismiss:${item.id}`)]), [b('‹ Previous', `notices:${Math.max(0, items.page - 1)}`), b('Next ›', `notices:${Math.min(items.totalPages - 1, items.page + 1)}`)]]);
  };
  app.views.notifications = ctx => show(ctx);
  app.route(/^notices:(\d{1,5})$/, (ctx, match) => show(ctx, Number(match[1])));
  app.route(/^notice:(snooze|dismiss):([a-f0-9]{16})$/, async (ctx, match) => { await app.services.notifications.act(app.uid(ctx), match[2], match[1]); await show(ctx); });
}
