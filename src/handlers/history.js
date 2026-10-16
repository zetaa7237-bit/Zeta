import { button as b } from '../utils/keyboards.js';
import { paginate } from '../utils/pagination.js';
import { escapeHtml as e } from '../utils/html-escape.js';
export function registerHistory(app) {
  const show = async (ctx, page = 0) => {
    const slice = paginate(app.services.store.snapshot().searchHistory.filter(row => row.userId === app.uid(ctx)).reverse(), page);
    await app.render(ctx, '<b>Search History</b>\n' + (slice.items.map(item => `${e(item.query || '(semua)')} · ${item.offerIds.length} ${app.t(ctx, 'hasil', 'results')} · ${e(item.at)}`).join('\n') || app.t(ctx, "Riwayat kosong.", "No search history.")), [[b('‹ Previous', `history:${Math.max(0, slice.page - 1)}`), b('Next ›', `history:${Math.min(slice.totalPages - 1, slice.page + 1)}`)], [b('Delete history', 'history:clear')]]);
  };
  app.views.history = ctx => show(ctx);
  app.route(/^history:(\d{1,5})$/, (ctx, match) => show(ctx, Number(match[1])));
  app.route(/^history:clear$/, ctx => app.confirm(ctx, app.t(ctx, "Hapus seluruh riwayat pencarian?", "Delete all search history?"), async () => { await app.services.users.deleteHistory(app.uid(ctx)); await ctx.reply(app.t(ctx, "Riwayat dihapus.", "Search history deleted.")); }));
}
