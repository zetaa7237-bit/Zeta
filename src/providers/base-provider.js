import { z } from 'zod';
import { offerSchema } from '../database/schema.js';
import { canonicalUrl, digest, id, now, safeUrl } from '../utils/security.js';
import { fetchJson } from '../utils/http.js';
export const providerConfigSchema = z.strictObject({
  id: z.enum(['aws', 'cloud', 'software', 'entertainment']), endpoint: safeUrl,
  allowedHosts: z.array(z.string().regex(/^(?:[a-z0-9-]+\.)+[a-z]{2,}$/)).min(1).max(30),
  permissionConfirmed: z.literal(true), minIntervalSeconds: z.number().int().min(60).max(86400).default(300),
});
export class BaseProvider {
  constructor(name, config = null, request = fetchJson) { this.name = name; this.config = config ? providerConfigSchema.parse(config) : null; this.request = request; this.health = 'NOT CONFIGURED'; this.lastAttemptAt = 0; this.nextAllowedAt = 0; }
  getName() { return this.name; }
  isConfigured() { return Boolean(this.config); }
  async searchOffers(_query = '', _filters = {}, signal) {
    if (!this.isConfigured()) return [];
    if (this.nextAllowedAt > Date.now()) throw Object.assign(new Error('Cooldown provider aktif.'), { retryAfterMs: this.nextAllowedAt - Date.now() });
    this.lastAttemptAt = Date.now(); this.nextAllowedAt = this.lastAttemptAt + this.config.minIntervalSeconds * 1000;
    try {
      const response = await this.request(this.config.endpoint, { allowedHosts: this.config.allowedHosts, signal });
      const records = z.array(z.record(z.string(), z.unknown())).max(500).parse(response);
      const offers = records.map(raw => {
        const source = new URL(safeUrl.parse(raw.source));
        const official = new URL(safeUrl.parse(raw.officialUrl));
        const registration = raw.registrationUrl ? new URL(safeUrl.parse(raw.registrationUrl)).hostname : official.hostname;
        if (![source.hostname, official.hostname, registration].every(host => this.config.allowedHosts.includes(host))) throw new Error('Sumber di luar allowlist.');
        const { id: _id, provider: _provider, dedupHash: _hash, discoveredAt: _date, ...fields } = raw;
        const offer = offerSchema.parse({ ...fields, id: id(), provider: this.name, discoveredAt: now(), dedupHash: digest(canonicalUrl(raw.officialUrl)) });
        if (offer.checkedAt && (Date.parse(offer.checkedAt) > Date.now() || Date.parse(offer.checkedAt) < Date.now() - 30 * 86400000)) {
          offer.status = 'UNVERIFIED'; offer.benefitValue = null; offer.currency = null;
        }
        if (offer.status !== 'VERIFIED') { offer.benefitValue = null; offer.currency = null; }
        if (offer.expiresAt && Date.parse(offer.expiresAt) <= Date.now()) offer.status = 'EXPIRED';
        return offer;
      });
      this.health = 'OK'; return offers;
    } catch (error) { this.health = 'ERROR'; this.nextAllowedAt = Math.max(this.nextAllowedAt, Date.now() + (error.retryAfterMs ?? 0)); error.retryAfterMs = this.nextAllowedAt - Date.now(); throw error; }
  }
  async checkOffer(offerId, signal) { return (await this.searchOffers('', {}, signal)).find(offer => offer.dedupHash === offerId) ?? null; }
  async healthCheck() { return { name: this.name, configured: this.isConfigured(), source: this.config?.endpoint ?? null, checkedAt: this.lastAttemptAt ? new Date(this.lastAttemptAt).toISOString() : null, status: this.isConfigured() ? this.health === 'NOT CONFIGURED' ? 'NOT CHECKED' : this.health : 'NOT CONFIGURED' }; }
}
