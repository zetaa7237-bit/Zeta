import { escapeHtml as e } from './html-escape.js';
import { chooseLanguage } from './i18n.js';
export function offerDetail(offer, timezone = 'Asia/Jakarta', language = 'id') {
  const t = (id, en) => chooseLanguage(language, id, en);
  const date = value => value ? new Intl.DateTimeFormat(language, { timeZone: timezone, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'UNKNOWN';
  const fields = [
    ['Status', 'Status', offer.status], ['Kategori', 'Category', offer.category], ['Benefit', 'Benefit', offer.benefitType],
    ['Nilai', 'Value', `${offer.benefitValue ?? 'UNKNOWN'} ${offer.currency ?? ''}`], ['Durasi', 'Duration', offer.duration],
    ['Syarat', 'Eligibility', offer.eligibility], ['Produk', 'Products', offer.products.join(', ') || 'UNKNOWN'], ['Batas', 'Limits', offer.limits],
    ['Akun', 'Account', offer.accountRequirements], ['Wilayah', 'Regions', offer.regions.join(', ') || 'UNKNOWN'], ['Billing', 'Billing', offer.billing],
    ['Risiko biaya', 'Cost risk', offer.costRisk], ['Berakhir', 'Expires', date(offer.expiresAt)], ['Diperiksa', 'Checked', date(offer.checkedAt)],
    ['Sumber', 'Source', offer.source], ['Resmi', 'Official', offer.officialUrl], ['Pendaftaran', 'Registration', offer.registrationUrl],
  ];
  return `🟣 <b>${e(offer.name)}</b>\n━━━━━━━━━━━━\n${fields.map(([id, en, value]) => `${t(id, en)}: ${e(value)}`).join('\n')}\n${t('Benefit bergantung kelayakan akun. Pemakaian/tagihan aktual: UNKNOWN.', 'Benefits depend on account eligibility. Actual usage/billing: UNKNOWN.')}`;
}
