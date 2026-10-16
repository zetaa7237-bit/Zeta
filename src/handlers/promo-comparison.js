import { button as b } from '../utils/keyboards.js';
import { compareOffers } from '../services/comparison-service.js';
import { awardXp } from '../services/achievement-service.js';
export function registerComparison(app) {
  app.views.compare = ctx => app.render(ctx, `<b>Promo Comparison</b>\n${app.t(ctx, 'Dipilih', 'Selected')}: ${(app.session(ctx).compareIds ?? []).length}/4. ${app.t(ctx, 'Buka detail promo lalu Compare +.', 'Open offer details, then Compare +.')}`, [[b('Compare', 'compare:run'), b('Clear', 'compare:clear')]]);
  app.route(/^compare:add:([a-f0-9]{16})$/, async (ctx, match) => {
    if (!app.services.store.snapshot().offers.some(item => item.id === match[1])) throw new Error('Promo tidak ditemukan.');
    const ids = app.session(ctx).compareIds ?? []; if (ids.length >= 4) throw new Error('Maksimal empat promo.');
    app.session(ctx).compareIds = [...new Set([...ids, match[1]])]; await ctx.reply(app.t(ctx, "Ditambahkan ke perbandingan.", "Added to comparison."));
  });
  app.route(/^compare:clear$/, async ctx => { app.session(ctx).compareIds = []; await app.views.compare(ctx); });
  app.route(/^compare:run$/, async ctx => {
    const ids = app.session(ctx).compareIds ?? []; const offers = app.services.store.snapshot().offers.filter(item => ids.includes(item.id));
    const text = compareOffers(offers, app.user(ctx).preferences.language); await app.services.store.transaction(db => awardXp(db, app.uid(ctx), 'compare', [...ids].sort().join(':'))); await app.render(ctx, text);
  });
}
