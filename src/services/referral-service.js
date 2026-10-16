import { id, now } from '../utils/security.js';
import { awardXp } from './achievement-service.js';
export class ReferralService {
  constructor(store) { this.store = store; }
  async apply(inviteeId, code) {
    return this.store.transaction(db => {
      if (!db.settings.referralsEnabled) throw new Error('Referral nonaktif.');
      const inviter = db.users.find(user => user.referralCode === code);
      const invitee = db.users.find(user => user.telegramId === inviteeId);
      if (!inviter || !invitee || inviter.telegramId === inviteeId) throw new Error('Referral tidak valid.');
      if (invitee.referredBy || db.referrals.some(row => row.inviteeId === inviteeId)) throw new Error('Referral sudah digunakan.');
      if (Date.now() - Date.parse(invitee.joinedAt) > 10 * 60000) throw new Error('Referral hanya saat bergabung.');
      const recent = db.referrals.filter(row => row.inviterId === inviter.telegramId && Date.now() - Date.parse(row.at) < 86400000);
      invitee.referredBy = inviter.telegramId;
      // Reward ditunda sampai undangan aktif pada hari UTC berikutnya; tanpa identifikasi tambahan.
      const row = { id: id(), inviterId: inviter.telegramId, inviteeId, at: now(), rewarded: false, flagged: recent.length >= 5 };
      db.referrals.push(row); return row;
    });
  }
  async qualify(userId) {
    return this.store.transaction(db => {
      const row = db.referrals.find(item => item.inviteeId === userId);
      const user = db.users.find(item => item.telegramId === userId);
      if (!db.settings.referralsEnabled || !row || row.rewarded || row.flagged || user.activityDays.length < 2) return false;
      if (db.referrals.filter(item => item.inviterId === row.inviterId && item.rewarded).length >= 20) return false;
      row.rewarded = awardXp(db, row.inviterId, 'referral', row.id, 10); return row.rewarded;
    });
  }
}
