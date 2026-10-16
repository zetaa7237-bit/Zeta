import { queueNotification } from './notification-service.js';
export class AlertService {
  constructor(store) { this.store = store; }
  async check() {
    return this.store.transaction(db => {
      for (const offer of db.offers) if (offer.expiresAt && Date.parse(offer.expiresAt) <= Date.now()) offer.status = 'EXPIRED';
      for (const offer of db.offers) if (offer.status === 'VERIFIED' && offer.checkedAt && Date.now() - Date.parse(offer.checkedAt) > 30 * 86400000) { offer.status = 'UNVERIFIED'; offer.benefitValue = null; offer.currency = null; }
      for (const favorite of db.favorites) {
        const user = db.users.find(item => item.telegramId === favorite.userId);
        const offer = db.offers.find(item => item.id === favorite.offerId);
        if (!user || !offer || !offer.expiresAt) continue;
        const remaining = Date.parse(offer.expiresAt) - Date.now();
        if (remaining >= 0 && remaining <= user.preferences.alertDays * 86400000) {
          const date = new Intl.DateTimeFormat(user.preferences.language, { timeZone: user.preferences.timezone, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(offer.expiresAt));
          queueNotification(db, { userId: user.telegramId, offerId: offer.id, kind: 'expiry', key: `expiry:${offer.id}:${offer.expiresAt}`, text: user.preferences.language === 'en' ? `${offer.name} expires ${date} (${user.preferences.timezone}). Based on public dates, not account usage. Cost risk: ${offer.costRisk ?? 'UNKNOWN'}. ${offer.source}` : `${offer.name} berakhir ${date} (${user.preferences.timezone}). Berdasarkan tanggal publik, bukan penggunaan akun. Risiko biaya: ${offer.costRisk ?? 'UNKNOWN'}. ${offer.source}` });
        }
      }
      return 'Tanggal publik dan risiko biaya diperiksa; penggunaan akun tidak tersedia.';
    });
  }
}
