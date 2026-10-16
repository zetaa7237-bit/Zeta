import { z } from 'zod';
import { categories, offerSchema } from '../database/schema.js';
import { cleanInput, id, now, digest, canonicalUrl } from '../utils/security.js';
import { awardXp } from './achievement-service.js';
import { queueNotification } from './notification-service.js';
export const filtersSchema = z.strictObject({ category: z.enum(categories).optional(), benefit: z.string().max(100).optional(), region: z.string().max(80).optional(), before: z.iso.datetime().optional(), sort: z.enum(['relevance', 'date']).optional() });
export class PromoService {
  constructor(store, providers, logger, concurrency = 3) { this.store = store; this.providers = providers; this.logger = logger; this.concurrency = concurrency; }
  search(query = '', filters = {}) {
    filters = filtersSchema.parse(filters); const normalized = query.trim().toLowerCase();
    const terms = normalized.split(/\s+/).filter(Boolean);
    const database = this.store.snapshot();
    let offers = database.offers.filter(offer => {
      if (!database.categories.includes(offer.category)) return false;
      const haystack = `${offer.name} ${offer.category} ${offer.benefitType} ${offer.eligibility}`.toLowerCase();
      return (!terms.length || terms.some(term => haystack.includes(term))) && (!filters.category || offer.category === filters.category)
        && (!filters.benefit || offer.benefitType.toLowerCase().includes(filters.benefit.toLowerCase()))
        && (!filters.region || offer.regions.some(region => region.toLowerCase().includes(filters.region.toLowerCase())))
        && (!filters.before || (offer.expiresAt && offer.expiresAt <= filters.before));
    });
    const score = offer => terms.reduce((sum, term) => sum + (offer.name.toLowerCase().includes(term) ? 3 : `${offer.category} ${offer.benefitType}`.toLowerCase().includes(term) ? 1 : 0), 0);
    offers.sort(filters.sort === 'date' ? (a, b) => b.discoveredAt.localeCompare(a.discoveredAt) : (a, b) => score(b) - score(a) || a.name.localeCompare(b.name));
    return offers;
  }
  async searchFor(userId, query, filters = {}) {
    query = query ? cleanInput(query, 300) : ''; filters = filtersSchema.parse(filters);
    const offers = this.search(query, filters);
    await this.store.transaction(db => {
      db.searchHistory.push({ id: id(), userId, query, filters, offerIds: offers.slice(0, 200).map(item => item.id), at: now() });
      db.searchHistory = db.searchHistory.slice(-10000);
      awardXp(db, userId, 'search', digest(`${query.toLowerCase()}:${JSON.stringify(filters)}`).slice(0, 24));
    });
    return offers;
  }
  async toggleFavorite(userId, offerId) {
    return this.store.transaction(db => {
      if (!db.offers.some(offer => offer.id === offerId)) throw new Error('Promo tidak ditemukan.');
      const existing = db.favorites.find(item => item.userId === userId && item.offerId === offerId);
      if (existing) { db.favorites = db.favorites.filter(item => item.id !== existing.id); return false; }
      if (db.favorites.filter(item => item.userId === userId).length >= 100) throw new Error('Maksimal 100 favorit.');
      db.favorites.push({ id: id(), userId, offerId, createdAt: now() }); awardXp(db, userId, 'favorite', offerId); return true;
    });
  }
  async scan(signal) {
    const disabled = this.store.snapshot().settings.disabledProviders;
    const providers = this.providers.filter(provider => provider.isConfigured() && !disabled.includes(provider.getName()));
    if (!providers.length) return 'NOT CONFIGURED: aktifkan feed resmi melalui PROVIDER_CONFIG_PATH.';
    const reports = []; const retryDelays = []; let cursor = 0;
    await Promise.all(Array.from({ length: Math.min(this.concurrency, providers.length) }, async () => {
      while (cursor < providers.length && !signal?.aborted) {
        const provider = providers[cursor++];
        try {
          const offers = await provider.searchOffers('', {}, signal);
          if (signal?.aborted) throw new Error('Job dihentikan.');
          await this.store.transaction(db => {
            for (const candidate of offers) {
              const offer = offerSchema.parse(candidate);
              const hash = digest(canonicalUrl(offer.officialUrl));
              const existing = db.offers.find(item => item.dedupHash === hash);
              const changed = existing && ['status', 'benefitValue', 'currency', 'duration', 'eligibility', 'expiresAt', 'billing', 'limits', 'costRisk'].some(key => existing[key] !== offer[key]);
              const saved = { ...offer, dedupHash: hash, id: existing?.id ?? offer.id, discoveredAt: existing?.discoveredAt ?? offer.discoveredAt };
              if (existing) Object.assign(existing, saved); else db.offers.push(saved);
              for (const user of db.users) {
                const watches = db.favorites.some(item => item.userId === user.telegramId && item.offerId === saved.id);
                if (changed && watches) queueNotification(db, { userId: user.telegramId, offerId: saved.id, kind: 'change', key: `change:${saved.id}:${digest(JSON.stringify(['status', 'benefitValue', 'currency', 'duration', 'eligibility', 'expiresAt', 'billing', 'limits', 'costRisk'].map(key => saved[key]))).slice(0, 16)}`, text: user.preferences.language === 'en' ? `Public information for ${saved.name} changed. Check terms, billing, and source: ${saved.source}` : `Informasi publik ${saved.name} berubah. Periksa syarat, billing, dan sumber: ${saved.source}` });
                if (!existing && user.preferences.categories.includes(saved.category)) queueNotification(db, { userId: user.telegramId, offerId: saved.id, kind: 'new', key: `new:${saved.id}`, text: user.preferences.language === 'en' ? `New offer: ${saved.name} (${saved.status}). ${saved.source}` : `Penawaran baru: ${saved.name} (${saved.status}). ${saved.source}` });
              }
            }
          });
          reports.push(`${provider.getName()}: ${offers.length}`);
        } catch (error) { retryDelays.push(error.retryAfterMs ?? 0); this.logger.warn({ err: error, provider: provider.getName() }, 'Pemeriksaan provider gagal'); reports.push(`${provider.getName()}: ERROR`); }
      }
    }));
    if (signal?.aborted) throw new Error('Job dihentikan.');
    if (reports.every(item => item.endsWith('ERROR'))) throw Object.assign(new Error('Seluruh provider gagal.'), { retryAfterMs: Math.min(...retryDelays) });
    await this.store.transaction(db => { db.settings.lastScanAt = now(); });
    return `Sumber diperiksa: ${reports.join('; ')}`;
  }
}
