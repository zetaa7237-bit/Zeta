import { escapeHtml as e } from '../utils/html-escape.js';
import { chooseLanguage } from '../utils/i18n.js';
export function compareOffers(offers, language = 'id') {
  if (offers.length < 2 || offers.length > 4) throw new Error('Pilih 2–4 penawaran.');
  const t = (id, en) => chooseLanguage(language, id, en);
  const fields = [['Benefit', 'Benefit', 'benefitType'], ['Durasi', 'Duration', 'duration'], ['Syarat', 'Eligibility', 'eligibility'], ['Produk', 'Products', 'products'], ['Batas', 'Limits', 'limits'], ['Wilayah', 'Regions', 'regions'], ['Tanggal akhir', 'Expiry', 'expiresAt'], ['Billing', 'Billing', 'billing'], ['Risiko biaya', 'Cost risk', 'costRisk'], ['Kepastian', 'Certainty', 'status']];
  return t('<b>Perbandingan</b>\nTidak ada konversi mata uang atau skor nilai terbaik.\n\n', '<b>Comparison</b>\nNo currency conversion or best-value score.\n\n') + offers.map(offer => `<b>${e(offer.name)}</b>\n${t('Nilai', 'Value')}: ${e(offer.benefitValue ?? 'UNKNOWN')} ${e(offer.currency ?? '')}\n` + fields.map(([id, en, field]) => `${t(id, en)}: ${e(Array.isArray(offer[field]) ? offer[field].join(', ') || 'UNKNOWN' : offer[field])}`).join('\n') + `\n${t('Sumber', 'Source')}: ${e(offer.source)}`).join('\n\n');
}
