import { button as b } from '../utils/keyboards.js';
export function registerExport(app) {
  app.views.export = ctx => app.render(ctx, app.t(ctx, "<b>Export Center</b>\nHanya data milik Anda. CSV dilindungi dari formula injection. Ekspor menggunakan buffer memori, tanpa file sementara.\nImpor database penuh: khusus owner melalui /import, maksimal 32 MB dan membutuhkan konfirmasi.", "<b>Export Center</b>\nOnly your own data. CSV cells are protected against formula injection. Exports use memory buffers.\nFull database import: owner only via /import, maximum 32 MB, with confirmation."), [[b('Favorites CSV', 'export:favorites'), b('Search JSON', 'export:search')], [b('My statistics JSON', 'export:profile')]]);
  app.route(/^export:(favorites|search|profile)$/, async (ctx, match) => { await ctx.replyWithDocument(app.services.exports.create(app.uid(ctx), match[1])); });
}
