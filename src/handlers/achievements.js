import { levelFor } from '../services/achievement-service.js';
import { escapeHtml as e } from '../utils/html-escape.js';
export function registerAchievements(app) {
  app.views.achievements = ctx => {
    const db = app.services.store.snapshot(); const user = app.user(ctx); const level = levelFor(user.xp); const start = (level - 1) ** 2 * 100; const end = level ** 2 * 100; const blocks = Math.floor((user.xp - start) / (end - start) * 10);
    const badges = db.userAchievements.filter(item => item.userId === app.uid(ctx)).map(item => item.achievementId);
    return app.render(ctx, `<b>XP & Achievements</b>\nLevel ${level} · ${user.xp} XP\n${'■'.repeat(blocks)}${'□'.repeat(10 - blocks)} → ${end} XP\n${db.achievements.map(item => `${badges.includes(item.id) ? '✓' : '○'} ${e(item.name)}`).join('\n')}\n${app.t(ctx, 'XP tidak bernilai uang dan tidak memengaruhi kelayakan promo.', 'XP has no monetary value and does not affect offer eligibility.')}\n${app.t(ctx, 'Riwayat terakhir', 'Recent history')}:\n${user.xpHistory.slice(-10).map(item => `${e(item.activity)} +${item.amount} · ${e(item.at)}`).join('\n')}`);
  };
}
