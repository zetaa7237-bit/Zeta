import { id, now } from '../utils/security.js';
import { escapeHtml } from '../utils/html-escape.js';
export function queueNotification(db, { userId, offerId = null, kind, key, text }) {
  if (db.notifications.some(item => item.userId === userId && item.key === key)) return;
  db.notifications.push({ id: id(), userId, offerId, kind, key, text: text.slice(0, 2000), createdAt: now(), sentAt: null, snoozedUntil: null, dismissed: false, attempts: 0 });
}
export class NotificationService {
  #running = false;
  constructor(store, send) { this.store = store; this.send = send; }
  async deliver(signal) {
    if (this.#running) return; this.#running = true;
    try {
      const db = this.store.snapshot();
      for (const user of db.users) {
        if (signal?.aborted) break;
        if (!user.preferences.notifications) continue;
        const last = db.notifications.filter(item => item.userId === user.telegramId && item.sentAt).sort((a, b) => b.sentAt.localeCompare(a.sentAt))[0];
        if (last && Date.now() - Date.parse(last.sentAt) < user.preferences.frequencyHours * 3600000) continue;
        const item = db.notifications.find(row => row.userId === user.telegramId && !row.sentAt && !row.dismissed && row.attempts < 5 && (!row.snoozedUntil || Date.parse(row.snoozedUntil) <= Date.now()));
        if (!item) continue;
        try {
          await this.send(user.telegramId, `🔔 <b>NOVA HUNTER</b>\n${escapeHtml(item.text)}`, { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: 'Snooze 24h', callback_data: `notice:snooze:${item.id}` }, { text: 'Dismiss', callback_data: `notice:dismiss:${item.id}` }]] } });
          await this.store.transaction(draft => { const row = draft.notifications.find(row => row.id === item.id); if (row) { row.sentAt = now(); row.attempts++; } });
        } catch {
          await this.store.transaction(draft => { const row = draft.notifications.find(row => row.id === item.id); if (row) row.attempts++; });
        }
      }
    } finally { this.#running = false; }
  }
  async act(userId, notificationId, action) {
    return this.store.transaction(db => {
      const item = db.notifications.find(row => row.id === notificationId && row.userId === userId);
      if (!item) throw new Error('Notifikasi tidak ditemukan.');
      if (action === 'dismiss') item.dismissed = true;
      else if (action === 'snooze') { item.snoozedUntil = new Date(Date.now() + 86400000).toISOString(); item.sentAt = null; item.attempts = 0; }
      else throw new Error('Aksi tidak valid.');
    });
  }
}
