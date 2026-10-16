import { button as b } from '../utils/keyboards.js';
export const menuEntries = [
  ['ai', 'AI Assistant', 'AI Assistant'], ['radar', 'Promo Radar', 'Promo Radar'], ['cloud', 'Cloud Credit Tracker', 'Cloud Credit Tracker'],
  ['compare', 'Promo Comparison', 'Promo Comparison'], ['alerts', 'Expiry & Cost Alerts', 'Expiry & Cost Alerts'], ['tasks', 'My Tasks', 'My Tasks'],
  ['favorites', 'Favorites', 'Favorites'], ['history', 'Search History', 'Search History'], ['notifications', 'Notifications', 'Notifications'],
  ['tickets', 'Ticket & Support', 'Ticket & Support'], ['export', 'Export Center', 'Export Center'], ['referral', 'Referral System', 'Referral System'],
  ['achievements', 'XP & Achievements', 'XP & Achievements'], ['profile', 'My Profile', 'My Profile'], ['settings', 'Settings', 'Settings'], ['help', 'Help', 'Help'],
];
export async function showHome(ctx, app) {
  const rows = []; for (let index = 0; index < menuEntries.length; index += 2) rows.push(menuEntries.slice(index, index + 2).map(([key, label]) => b(label, `nav:${key}`)));
  if (app.owner(ctx)) rows.push([b('Admin Dashboard', 'nav:admin')]);
  const english = app.user(ctx).preferences.language === 'en';
  await app.render(ctx, english ? '🟣 <b>NOVA HUNTER V3</b>\n━━━━━━━━━━━━\nOfficial offer research. Benefit eligibility depends on your account.\nChoose a feature:' : '🟣 <b>NOVA HUNTER V3</b>\n━━━━━━━━━━━━\nRiset penawaran resmi. Benefit bergantung kelayakan akun.\nPilih fitur:', rows);
}
export async function showHelp(ctx, app) {
  await app.render(ctx, app.t(ctx, '<b>Panduan / Help</b>\n/start — menu utama / main menu\n/cancel — batalkan input / cancel input\n/forget — hapus konteks AI / clear AI context\n/search kata — pencarian / search\nHasil kosong berarti belum ada data, bukan tidak ada penawaran di internet.\nSearch syntax: kata | category=cloud | benefit=credit | region=Indonesia | before=2027-12-31 | sort=date\nKategori tersedia: cloud, developer, ai, hosting, productivity, education, entertainment, trial, startup, free.\nSimpan favorit untuk memantau tanggal dan perubahan publik.\nJangan kirim kredensial, password, token, OTP, atau cookies.\nNOT CONFIGURED: owner perlu mengatur feed resmi.\nKebijakan privasi: /privacy', '<b>Help</b>\n/start — main menu\n/cancel — cancel input\n/forget — clear AI category context\n/search keywords — search local records\nEmpty results mean no matching local data, not that no offers exist on the internet.\nSearch syntax: keywords | category=cloud | benefit=credit | region=Indonesia | before=2027-12-31 | sort=date\nCategories: cloud, developer, ai, hosting, productivity, education, entertainment, trial, startup, free.\nSave favorites to track public dates and changes.\nNever send credentials, passwords, tokens, OTPs, or cookies.\nNOT CONFIGURED: the owner must configure an authorized official feed.\nData retention policy: /privacy'));
}
