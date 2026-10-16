import { id, now } from '../utils/security.js';
export function awardXp(db, userId, activity, key, amount = 5) {
  if (!db.settings.xpEnabled) return false;
  const user = db.users.find(item => item.telegramId === userId);
  if (!user) return false;
  const date = now().slice(0, 10);
  const rewardKey = `${activity}:${key}`;
  if (user.xpHistory.some(item => item.key === rewardKey)) return false;
  if (user.xpHistory.filter(item => item.activity === activity && item.at.startsWith(date)).length >= 5) return false;
  if (user.xpHistory.length >= 1000) return false; // Batas permanen mencegah pengulangan key lama.
  user.xp += amount; user.xpHistory.push({ key: rewardKey, activity, amount, at: now() });
  for (const achievement of db.achievements) {
    const count = achievement.activity === 'active' ? user.activityDays.length : user.xpHistory.filter(item => item.activity === achievement.activity).length;
    if (count >= achievement.threshold && !db.userAchievements.some(item => item.userId === userId && item.achievementId === achievement.id)) {
      db.userAchievements.push({ id: id(), userId, achievementId: achievement.id, at: now() });
    }
  }
  return true;
}
export const levelFor = xp => Math.floor(Math.sqrt(xp / 100)) + 1;
