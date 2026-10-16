import { setTimeout as delay } from 'node:timers/promises';
import { parse } from 'parse5';
import robotsParser from 'robots-parser';
import { offerSchema } from '../database/schema.js';
import { digest, id, now, canonicalUrl } from '../utils/security.js';
import { fetchText } from '../utils/http.js';

export const CRAWLER_NAME = 'NovaHunter';
export const CRAWLER_AGENT = 'NovaHunter/3.0 (+https://github.com/zetaa7237-bit/Zeta)';
const HOUR = 3600000;

export function pageText(html) {
  const parts = [];
  const visit = node => {
    if (['script', 'style', 'noscript', 'template', 'svg', 'nav', 'header', 'footer'].includes(node.tagName)) return;
    if (node.attrs?.some(attr => attr.name === 'hidden' || attr.name === 'aria-hidden' && attr.value === 'true')) return;
    if (node.nodeName === '#text') parts.push(node.value);
    for (const child of node.childNodes ?? []) visit(child);
    // Jangan melekatkan kata-kata antarelemen ketika HTML tidak berisi whitespace.
    if (node.tagName) parts.push(' ');
  };
  visit(parse(html));
  return parts.join('').replace(/\s+/g, ' ').trim();
}

export class OfficialPageProvider {
  constructor(name, source, { request = fetchText, clock = Date.now } = {}) {
    this.name = name; this.source = source; this.request = request; this.clock = clock;
    this.health = 'NOT CHECKED'; this.lastAttemptAt = null; this.checkedAt = null;
    this.nextAllowedAt = 0; this.robots = null; this.robotsUntil = 0;
  }
  getName() { return this.name; }
  isConfigured() { return true; }
  async searchOffers(_query = '', _filters = {}, signal) {
    const current = this.clock();
    if (current < this.nextAllowedAt) throw Object.assign(new Error('Cooldown sumber resmi aktif.'), { retryAfterMs: this.nextAllowedAt - current });
    this.nextAllowedAt = current + HOUR; this.lastAttemptAt = new Date(current).toISOString(); this.health = 'CHECKING';
    const url = new URL(this.source.url); const robotsUrl = `${url.origin}/robots.txt`;
    const options = { allowedHosts: [url.hostname], signal, headers: { 'user-agent': CRAWLER_AGENT, accept: 'text/html,text/plain;q=0.9' } };
    try {
      // Gagal tertutup: tanpa aturan robots yang dapat dibaca, halaman tidak diambil.
      if (!this.robots || current >= this.robotsUntil) {
        const robots = await this.request(robotsUrl, { ...options, maxBytes: 128 * 1024 });
        if (!/^\s*user-agent\s*:/im.test(robots)) throw new Error('Robots policy tidak dapat diverifikasi.');
        this.robots = robotsParser(robotsUrl, robots); this.robotsUntil = current + 24 * HOUR;
      }
      if (this.robots.isAllowed(this.source.url, CRAWLER_NAME) !== true) {
        this.health = 'BLOCKED'; throw new Error('Sumber melarang pengambilan otomatis.');
      }
      const crawlDelay = this.robots.getCrawlDelay(CRAWLER_NAME);
      if (Number.isFinite(crawlDelay)) {
        this.nextAllowedAt = Math.max(this.nextAllowedAt, current + crawlDelay * 1000);
        if (crawlDelay > 10) throw new Error('Crawl delay sumber melebihi batas job.');
        if (crawlDelay > 0) await delay(crawlDelay * 1000, undefined, { signal });
      }
      const html = await this.request(this.source.url, { ...options, maxBytes: 3 * 1024 * 1024 });
      signal?.throwIfAborted();
      const text = pageText(html); const evidence = this.source.evidence.exec(text);
      this.checkedAt = now();
      if (!evidence) {
        this.health = 'CONTENT_CHANGED';
        return [this.toOffer(null, '')];
      }
      this.health = 'OK';
      return [this.toOffer(text, evidence[0])];
    } catch (error) {
      if (this.health !== 'BLOCKED') this.health = 'ERROR';
      this.nextAllowedAt = Math.max(this.nextAllowedAt, this.clock() + (error.retryAfterMs ?? 0));
      error.retryAfterMs = this.nextAllowedAt - this.clock(); throw error;
    }
  }
  toOffer(text, evidence) {
    const matched = Boolean(text); const value = matched && this.source.value?.exec(text);
    const duration = matched && this.source.duration?.exec(text);
    const billing = matched && this.source.billing?.exec(text);
    const limits = matched && this.source.limits?.exec(text);
    return offerSchema.parse({
      id: id(), provider: this.name, name: this.source.name, category: this.source.category,
      benefitType: matched ? this.source.benefitType : 'UNKNOWN',
      benefitValue: value ? Number(value[1].replaceAll(',', '')) : null, currency: value ? 'USD' : null,
      duration: duration ? duration[1] : null,
      eligibility: matched ? `Cuplikan sumber resmi: ${evidence.slice(0, 700)}\nKelayakan akun tidak diperiksa. Baca syarat terbaru pada tautan sumber.` : 'Isi halaman berubah atau bukti penawaran tidak ditemukan. Benefit dan kelayakan belum diketahui; periksa sumber resmi.',
      regions: [], officialUrl: this.source.url, source: this.source.url, registrationUrl: this.source.unavailable ? null : this.source.url,
      discoveredAt: now(), checkedAt: this.checkedAt, expiresAt: null,
      status: !matched ? 'UNKNOWN' : this.source.unavailable ? 'UNAVAILABLE' : 'VERIFIED',
      dedupHash: digest(canonicalUrl(this.source.url)), products: [],
      limits: limits ? limits[0] : null, accountRequirements: null, billing: billing ? billing[0] : null,
      costRisk: this.source.unavailable ? null : 'Periksa biaya setelah trial, kuota, atau kredit berakhir serta syarat paket berbayar. Bot tidak terhubung ke tagihan atau pemakaian akun.',
    });
  }
  async checkOffer(hash, signal) { return (await this.searchOffers('', {}, signal)).find(offer => offer.dedupHash === hash) ?? null; }
  async healthCheck() { return { name: this.name, configured: true, source: this.source.url, checkedAt: this.checkedAt, lastAttemptAt: this.lastAttemptAt, status: this.health }; }
}
