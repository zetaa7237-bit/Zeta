import { button as b } from '../utils/keyboards.js';
import { paginate } from '../utils/pagination.js';
import { escapeHtml as e } from '../utils/html-escape.js';
import { offerDetail } from '../utils/formatter.js';
export function parseSearch(input) {
  const [query, ...parts] = input.split('|').map(value => value.trim()); const filters = {};
  for (const part of parts) {
    const match = /^(category|benefit|region|before|sort)=(.+)$/.exec(part);
    if (!match) throw new Error('Format filter tidak valid.');
    filters[match[1]] = match[1] === 'before' ? new Date(`${match[2]}T23:59:59.000Z`).toISOString() : match[2];
  }
  return { query, filters };
}
export async function showResults(ctx, app, ids, page = 0, route = 'results') {
  const offers = app.services.store.snapshot().offers.filter(item => ids.includes(item.id)).sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
  const slice = paginate(offers, page);
  const rows = slice.items.map(item => [b(`${item.name.slice(0, 40)} · ${item.status}`, `offer:${item.id}`)]);
  rows.push([b('‹ Previous', `${route}:${Math.max(0, slice.page - 1)}`), b('Next ›', `${route}:${Math.min(slice.totalPages - 1, slice.page + 1)}`)]);
  await app.render(ctx, `<b>Hasil / Results</b> · ${offers.length}\n${app.t(ctx, 'Halaman', 'Page')} ${slice.page + 1}/${slice.totalPages}\n${offers.length ? app.t(ctx, "Pilih penawaran untuk sumber dan detail.", "Select an offer for sources and details.") : app.t(ctx, "Belum ada data yang cocok. Periksa status provider.", "No matching records. Check provider status.")}`, rows);
}
export function registerRadar(app) {
  app.views.radar = async ctx => {
    const providers = await Promise.all(app.services.providers.map(provider => provider.healthCheck()));
    const active = providers.filter(provider => provider.configured && !app.services.store.snapshot().settings.disabledProviders.includes(provider.name));
    const interval = app.services.store.snapshot().settings.scanIntervalMinutes;
    const explanation = active.length ? app.t(ctx, `\nPemeriksaan otomatis setiap ${interval} menit (cooldown sumber bawaan minimal 60 menit). VERIFIED berarti informasi ditemukan pada halaman sumber, bukan jaminan kelayakan akun.`, `\nAutomatic checks every ${interval} minutes (built-in source cooldown: at least 60 minutes). VERIFIED means information was found on the source page, not guaranteed account eligibility.`) : app.t(ctx, '\nBelum ada sumber aktif. Owner dapat mengaktifkan sumber bawaan atau mengatur feed berizin melalui PROVIDER_CONFIG_PATH.', '\nNo active sources. The owner can enable built-in sources or configure an authorized feed with PROVIDER_CONFIG_PATH.');
    await app.render(ctx, app.t(ctx, '<b>Promo Radar</b>\nSumber terdaftar:\n', '<b>Promo Radar</b>\nRegistered sources:\n') + providers.map(provider => `${e(provider.name)}: ${e(provider.status)}${provider.source ? `\n${e(provider.source)} · ${e(provider.checkedAt ?? 'NOT CHECKED')}` : ''}${app.services.store.snapshot().settings.disabledProviders.includes(provider.name) ? ' (DISABLED)' : ''}`).join('\n') + explanation, [[b('Search', 'radar:search'), b(app.t(ctx, 'Refresh sumber', 'Refresh sources'), 'radar:scan')], [b(app.t(ctx, 'Semua kategori', 'All categories'), 'radar:all')], [b(app.t(ctx, 'Refresh status', 'Refresh status'), 'nav:radar')]]);
  };
  app.route(/^radar:search$/, ctx => app.ask(ctx, 'search', app.t(ctx, "Kirim kata kunci. Opsional: kata | category=cloud | benefit=credit | region=Indonesia | before=2027-12-31 | sort=date", "Send keywords. Optional: keywords | category=cloud | benefit=credit | region=Indonesia | before=2027-12-31 | sort=date")));
  app.flows.search = async (ctx, text) => {
    const { query, filters } = parseSearch(text); const offers = await app.services.promo.searchFor(app.uid(ctx), query, filters);
    app.session(ctx).resultIds = offers.map(item => item.id); await showResults(ctx, app, app.session(ctx).resultIds);
  };
  app.route(/^radar:all$/, async ctx => { const offers = await app.services.promo.searchFor(app.uid(ctx), ''); app.session(ctx).resultIds = offers.map(item => item.id); await showResults(ctx, app, app.session(ctx).resultIds); });
  app.route(/^radar:scan$/, async ctx => { const task = await app.services.scheduler.enqueue('scan', app.uid(ctx), 'scan'); await app.render(ctx, app.t(ctx, `Tugas ${task.id}: ${task.status}. Lihat My Tasks.`, `Task ${task.id}: ${task.status}. See My Tasks.`)); });
  app.route(/^results:(\d{1,5})$/, (ctx, match) => showResults(ctx, app, app.session(ctx).resultIds ?? [], Number(match[1])));
  app.route(/^offer:([a-f0-9]{16})$/, async (ctx, match) => {
    const offer = app.services.store.snapshot().offers.find(item => item.id === match[1]); if (!offer) throw new Error('Promo tidak ditemukan.');
    await app.render(ctx, offerDetail(offer, app.user(ctx).preferences.timezone, app.user(ctx).preferences.language), [[b('★ Toggle favorite', `favorite:${offer.id}`), b('Compare +', `compare:add:${offer.id}`)], [b('Refresh', `offer:${offer.id}`)]]);
  });
  app.route(/^favorite:([a-f0-9]{16})$/, async (ctx, match) => { const saved = await app.services.promo.toggleFavorite(app.uid(ctx), match[1]); await ctx.reply(saved ? app.t(ctx, "Favorit disimpan; tanggal publik dipantau.", "Favorite saved; public dates will be monitored.") : app.t(ctx, "Favorit dihapus.", "Favorite removed.")); });
}
