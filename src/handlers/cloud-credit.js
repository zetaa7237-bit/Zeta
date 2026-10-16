import { showResults } from './promo-radar.js';
import { awardXp } from '../services/achievement-service.js';
export function registerCloud(app) {
  app.views.cloud = async ctx => { await app.services.store.transaction(db => awardXp(db, app.uid(ctx), 'cloud', 'catalog')); await ctx.reply(app.t(ctx, "Cloud Credit Tracker: katalog publik, bukan integrasi akun. Kredit, batas, billing, dan risiko biaya tersedia pada detail; data yang tidak diketahui ditulis UNKNOWN.", "Cloud Credit Tracker: public catalog, no account integration. Details include credit, limits, billing, and cost risks; missing information is UNKNOWN.")); await show(ctx, 0); };
  const show = (ctx, page) => showResults(ctx, app, app.services.cloud.list().map(item => item.id), page, 'cloudpage');
  app.route(/^cloudpage:(\d{1,5})$/, (ctx, match) => show(ctx, Number(match[1])));
}
