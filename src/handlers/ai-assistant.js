import { button as b } from '../utils/keyboards.js';
import { offerDetail } from '../utils/formatter.js';
import { compareOffers } from '../services/comparison-service.js';
import { showResults } from './promo-radar.js';
export function registerAi(app) {
  app.views.ai = ctx => app.render(ctx, app.t(ctx, "<b>AI Assistant</b>\nAI opsional membantu menerjemahkan pencarian menjadi kata kunci/kategori. Fakta dan ringkasan berasal dari database, dengan sumber pada detail promo.\nTanpa AI: pencarian kata kunci. Maksimal 5 permintaan/jam; input 300 karakter.\nKonteks kategori disimpan di memori selama 30 menit. /forget untuk menghapus.", "<b>AI Assistant</b>\nOptional AI extracts keywords and categories. Facts and summaries come from the database; source links are shown in offer details.\nWithout AI: keyword search. Limit: 5 requests/hour, 300 input characters.\nCategory context stays in memory for 30 minutes. Use /forget to clear it."), [[b('Ask / Search', 'ai:ask'), b('Clear context', 'ai:clear')]]);
  app.route(/^ai:ask$/, ctx => app.ask(ctx, 'ai', app.t(ctx, "Kirim permintaan pencarian, misalnya: kredit cloud untuk startup. Jangan kirim informasi sensitif.", "Send a search request, such as cloud credit for startups. Do not include sensitive information.")));
  app.route(/^ai:clear$/, async ctx => { app.services.ai.clear(app.uid(ctx)); await ctx.reply(app.t(ctx, "Konteks AI dihapus.", "AI context cleared.")); });
  app.flows.ai = async (ctx, text) => {
    const result = await app.services.ai.search(app.uid(ctx), text); app.session(ctx).resultIds = result.offers.map(item => item.id);
    await ctx.reply(app.t(ctx, `Mode: ${result.mode}. Kategori: ${result.category ?? 'semua'}. Buka detail untuk syarat, durasi, benefit, dan sumber. Informasi yang tidak tersedia: UNKNOWN.`, `Mode: ${result.mode}. Category: ${result.category ?? 'all'}. Open details for eligibility, duration, benefits, and sources. Missing information: UNKNOWN.`));
    if (/\b(bandingkan|compare)\b/i.test(text) && result.offers.length >= 2) await app.render(ctx, compareOffers(result.offers.slice(0, 3), app.user(ctx).preferences.language));
    else if (result.offers.length) await app.render(ctx, offerDetail(result.offers[0], app.user(ctx).preferences.timezone, app.user(ctx).preferences.language));
    await showResults(ctx, app, app.session(ctx).resultIds);
  };
}
