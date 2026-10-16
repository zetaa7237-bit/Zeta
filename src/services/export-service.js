import { z } from 'zod';
import { databaseSchema } from '../database/schema.js';
import { MAX_DATABASE_BYTES } from '../database/json-store.js';
export function csvCell(value) {
  let text = String(value ?? 'UNKNOWN');
  if (/^[\s\u0000-\u001f]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
export function validateImport(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length > MAX_DATABASE_BYTES) throw new Error('Ukuran impor tidak valid.');
  return databaseSchema.parse(JSON.parse(buffer.toString('utf8')));
}
export class ExportService {
  constructor(store) { this.store = store; }
  create(userId, kind) {
    kind = z.enum(['favorites', 'search', 'profile']).parse(kind); const db = this.store.snapshot(); let data;
    if (kind === 'favorites') {
      const favorites = new Set(db.favorites.filter(item => item.userId === userId).map(item => item.offerId));
      const rows = db.offers.filter(item => favorites.has(item.id));
      data = ['Nama,Status,Benefit,Mata uang,Sumber', ...rows.map(item => [item.name, item.status, item.benefitValue, item.currency, item.source].map(csvCell).join(','))].join('\r\n');
    } else if (kind === 'search') {
      const history = db.searchHistory.filter(item => item.userId === userId).slice(-1)[0];
      data = JSON.stringify({ search: history ? { query: history.query, filters: history.filters, at: history.at } : null, offers: db.offers.filter(item => history?.offerIds.includes(item.id)) }, null, 2);
    } else {
      const user = db.users.find(item => item.telegramId === userId);
      data = JSON.stringify({ profile: user ? { joinedAt: user.joinedAt, preferences: user.preferences, xp: user.xp, xpHistory: user.xpHistory } : null, achievements: db.userAchievements.filter(item => item.userId === userId).map(({ achievementId, at }) => ({ achievementId, at })), searchCount: db.searchHistory.filter(item => item.userId === userId).length, favoriteCount: db.favorites.filter(item => item.userId === userId).length }, null, 2);
    }
    const buffer = Buffer.from(data);
    if (buffer.length > 10 * 1024 * 1024) throw new Error('Ekspor melewati 10 MB.');
    return { source: buffer, filename: `nova-${kind}.${kind === 'favorites' ? 'csv' : 'json'}` };
  }
}
