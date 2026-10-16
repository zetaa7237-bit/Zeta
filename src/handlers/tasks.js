import { button as b } from '../utils/keyboards.js';
import { paginate } from '../utils/pagination.js';
import { escapeHtml as e } from '../utils/html-escape.js';
export function registerTasks(app) {
  const show = async (ctx, page = 0) => {
    const slice = paginate(app.services.store.snapshot().tasks.filter(item => item.userId === app.uid(ctx)).reverse(), page);
    await app.render(ctx, '<b>My Tasks</b>\n' + (slice.items.map(item => `${e(item.id)} · ${e(item.type)} · ${item.status}\n${app.t(ctx, 'Percobaan', 'Attempts')}: ${item.attempts} · ${e(item.result ?? item.error ?? app.t(ctx, 'Menunggu', 'Waiting'))}`).join('\n\n') || app.t(ctx, "Belum ada tugas.", "No tasks yet.")), [...slice.items.filter(item => item.status === 'PENDING').map(item => [b(`Cancel ${item.id.slice(0, 6)}`, `task:cancel:${item.id}`)]), [b('‹ Previous', `tasks:${Math.max(0, slice.page - 1)}`), b('Next ›', `tasks:${Math.min(slice.totalPages - 1, slice.page + 1)}`), b('Refresh', `tasks:${slice.page}`)]]);
  };
  app.views.tasks = ctx => show(ctx);
  app.route(/^tasks:(\d{1,5})$/, (ctx, match) => show(ctx, Number(match[1])));
  app.route(/^task:cancel:([a-f0-9]{16})$/, (ctx, match) => app.confirm(ctx, app.t(ctx, "Batalkan tugas PENDING?", "Cancel this PENDING task?"), async () => { await app.services.scheduler.cancel(match[1], app.uid(ctx), app.config.OWNER_ID); await show(ctx); }));
}
