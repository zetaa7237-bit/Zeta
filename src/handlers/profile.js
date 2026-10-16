import { escapeHtml as e } from '../utils/html-escape.js';
import { button as b } from '../utils/keyboards.js';
import { levelFor } from '../services/achievement-service.js';
export function registerProfile(app) {
  app.views.profile = ctx => { const user = app.user(ctx); return app.render(ctx, `<b>My Profile</b>\nID: ${e(user.telegramId)}\nUsername: ${e(user.username)}\n${app.t(ctx, 'Bergabung', 'Joined')}: ${e(user.joinedAt)}\n${app.t(ctx, 'Aktif', 'Active')}: ${e(user.lastActiveAt)}\n${app.t(ctx, 'Bahasa', 'Language')}: ${e(user.preferences.language)}\n${app.t(ctx, 'Zona', 'Timezone')}: ${e(user.preferences.timezone)}\n${app.t(ctx, 'Kategori', 'Categories')}: ${e(user.preferences.categories.join(', ') || app.t(ctx, 'Belum dipilih', 'None selected'))}\nXP: ${user.xp} · Level ${levelFor(user.xp)}`, [[b('Export data', 'export:profile'), b('Settings', 'nav:settings')]]); };
}
