import { categories } from './schema.js';
export function initialData() {
  return {
    meta: { version: 1, createdAt: null, updatedAt: null }, users: [], offers: [], categories: [...categories],
    searchHistory: [], favorites: [], notifications: [], tasks: [], tickets: [], referrals: [],
    achievements: [
      ['first-search', 'First Search', 'search', 1], ['explorer', 'Promo Explorer', 'search', 10],
      ['cloud-learner', 'Cloud Learner', 'cloud', 1], ['watchlist', 'Watchlist Creator', 'favorite', 1],
      ['reporter', 'Helpful Reporter', 'ticket', 1], ['seven-day', 'Seven-Day Active', 'active', 7],
      ['researcher', 'Promo Researcher', 'compare', 5],
    ].map(([id, name, activity, threshold]) => ({ id, name, activity, threshold })),
    userAchievements: [], settings: { maintenance: false, referralsEnabled: true, xpEnabled: true, scanIntervalMinutes: 60, disabledProviders: [], disabledProxies: [], lastScanAt: null, lastBackupAt: null },
    auditLogs: [], backups: [],
  };
}
