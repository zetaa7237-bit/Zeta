import { showResults } from './promo-radar.js';
export function registerFavorites(app) {
  const show = (ctx, page = 0) => showResults(ctx, app, app.services.store.snapshot().favorites.filter(item => item.userId === app.uid(ctx)).map(item => item.offerId), page, 'favorites');
  app.views.favorites = ctx => show(ctx);
  app.route(/^favorites:(\d{1,5})$/, (ctx, match) => show(ctx, Number(match[1])));
}
