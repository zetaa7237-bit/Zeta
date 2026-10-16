import { id, now, cleanInput } from '../utils/security.js';
import { awardXp } from './achievement-service.js';
export const audit = (db, actorId, action, target = null) => {
  db.auditLogs.push({ id: id(), actorId, action, target, at: now() }); db.auditLogs = db.auditLogs.slice(-5000);
};
export class UserService {
  constructor(store) { this.store = store; }
  get(userId) { return this.store.snapshot().users.find(user => user.telegramId === userId); }
  async ensure(from) {
    return this.store.transaction(db => {
      const telegramId = String(from.id); let user = db.users.find(item => item.telegramId === telegramId);
      if (!user) {
        user = { id: id(), telegramId, username: from.username ? cleanInput(from.username, 64) : null, joinedAt: now(), lastActiveAt: now(), preferences: { language: 'id', notifications: true, categories: [], timezone: 'Asia/Jakarta', frequencyHours: 24, alertDays: 3 }, xp: 0, referralCode: id(), referredBy: null, activityDays: [], xpHistory: [] };
        db.users.push(user);
      }
      user.lastActiveAt = now();
      const day = now().slice(0, 10);
      if (!user.activityDays.includes(day)) { user.activityDays.push(day); user.activityDays = user.activityDays.slice(-366); awardXp(db, telegramId, 'active', day, 1); }
      return user;
    });
  }
  async update(userId, changes) {
    return this.store.transaction(db => { const user = db.users.find(item => item.telegramId === userId); Object.assign(user.preferences, changes); return user; });
  }
  async deleteHistory(userId) { return this.store.transaction(db => { db.searchHistory = db.searchHistory.filter(item => item.userId !== userId); }); }
  async deleteProfile(userId) {
    return this.store.transaction(db => {
      db.users = db.users.filter(user => user.telegramId !== userId);
      for (const key of ['favorites', 'searchHistory', 'notifications', 'tasks', 'tickets', 'userAchievements']) db[key] = db[key].filter(row => row.userId !== userId);
      db.referrals = db.referrals.filter(row => row.inviterId !== userId && row.inviteeId !== userId);
      for (const user of db.users) if (user.referredBy === userId) user.referredBy = null;
      db.auditLogs = db.auditLogs.filter(row => row.actorId !== userId);
    });
  }
}
