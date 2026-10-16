import { z } from 'zod';
import { safeUrl, sensitive } from '../utils/security.js';
const text = (max = 1000) => z.string().max(max).refine(value => !sensitive.test(value), 'Data menyerupai rahasia ditolak.');
const timestamp = z.iso.datetime();
const nullableDate = timestamp.nullable();
const identifier = z.string().regex(/^[a-zA-Z0-9_-]{1,32}$/);
const userId = z.string().regex(/^[1-9]\d{0,15}$/);
const record = shape => z.strictObject(shape);
const entity = { id: identifier };
export const categories = ['cloud', 'developer', 'ai', 'hosting', 'productivity', 'education', 'entertainment', 'trial', 'startup', 'free'];
export const offerSchema = record({
  ...entity, provider: identifier, name: text(150), category: z.enum(categories), benefitType: text(100),
  benefitValue: z.number().nonnegative().nullable(), currency: z.string().regex(/^[A-Z]{3}$/).nullable(),
  duration: text(300).nullable(), eligibility: text(1500), regions: z.array(text(80)).max(50),
  officialUrl: safeUrl, source: safeUrl, discoveredAt: timestamp, checkedAt: nullableDate, expiresAt: nullableDate,
  status: z.enum(['VERIFIED', 'UNVERIFIED', 'UNKNOWN', 'EXPIRED', 'UNAVAILABLE']), dedupHash: z.string().regex(/^[a-f0-9]{64}$/),
  products: z.array(text(150)).max(50), limits: text(1500).nullable(), accountRequirements: text(1500).nullable(),
  billing: text(1500).nullable(), costRisk: text(1500).nullable(), registrationUrl: safeUrl.nullable(),
}).superRefine((offer, ctx) => {
  if (offer.status === 'VERIFIED' && !offer.checkedAt) ctx.addIssue({ code: 'custom', message: 'Verifikasi membutuhkan timestamp.' });
  if (offer.benefitValue !== null && !offer.checkedAt) ctx.addIssue({ code: 'custom', message: 'Nilai benefit membutuhkan timestamp verifikasi.' });
});
const preferences = record({ language: z.enum(['id', 'en']), notifications: z.boolean(), categories: z.array(z.enum(categories)).max(10),
  timezone: text(80).refine(value => { try { new Intl.DateTimeFormat('id', { timeZone: value }); return true; } catch { return false; } }),
  frequencyHours: z.number().int().min(1).max(168), alertDays: z.number().int().min(1).max(90) });
const user = record({ ...entity, telegramId: userId, username: text(64).nullable(), joinedAt: timestamp, lastActiveAt: timestamp,
  preferences, xp: z.number().int().nonnegative(), referralCode: identifier, referredBy: identifier.nullable(),
  activityDays: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(366),
  xpHistory: z.array(record({ key: text(150), activity: text(40), amount: z.number().int().min(0).max(100), at: timestamp })).max(1000),
});
export const taskSchema = record({ ...entity, type: z.enum(['scan', 'backup', 'alerts', 'broadcast']), userId: userId,
  key: text(100), payload: record({ text: text(1000).optional(), cursor: userId.nullable().optional() }),
  createdAt: timestamp, startedAt: nullableDate, finishedAt: nullableDate, nextRunAt: timestamp,
  attempts: z.number().int().min(0).max(10), status: z.enum(['PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED']),
  result: text(500).nullable(), error: text(80).nullable(),
});
export const databaseSchema = record({
  meta: record({ version: z.literal(1), createdAt: nullableDate, updatedAt: nullableDate }),
  users: z.array(user).max(10000), offers: z.array(offerSchema).max(10000), categories: z.array(z.enum(categories)).max(10),
  searchHistory: z.array(record({ ...entity, userId, query: text(300), filters: record({ category: z.enum(categories).optional(), benefit: text(100).optional(), region: text(80).optional(), before: timestamp.optional(), sort: z.enum(['relevance', 'date']).optional() }), offerIds: z.array(identifier).max(200), at: timestamp })).max(10000),
  favorites: z.array(record({ ...entity, userId, offerId: identifier, createdAt: timestamp })).max(20000),
  notifications: z.array(record({ ...entity, userId, offerId: identifier.nullable(), kind: z.enum(['expiry', 'change', 'new', 'ticket', 'cost']), key: text(180), text: text(2000), createdAt: timestamp, sentAt: nullableDate, snoozedUntil: nullableDate, dismissed: z.boolean(), attempts: z.number().int().max(5) })).max(20000),
  tasks: z.array(taskSchema).max(5000),
  tickets: z.array(record({ ...entity, userId, category: z.enum(['bug', 'data', 'account', 'other']), priority: z.enum(['LOW', 'NORMAL', 'HIGH']), status: z.enum(['OPEN', 'IN_PROGRESS', 'WAITING_USER', 'RESOLVED', 'CLOSED']), createdAt: timestamp, updatedAt: timestamp,
    replies: z.array(record({ authorId: userId, text: text(1500), at: timestamp })).min(1).max(100) })).max(5000),
  referrals: z.array(record({ ...entity, inviterId: userId, inviteeId: userId, at: timestamp, rewarded: z.boolean(), flagged: z.boolean() })).max(10000),
  achievements: z.array(record({ ...entity, name: text(80), activity: text(40), threshold: z.number().int().positive() })).max(50),
  userAchievements: z.array(record({ ...entity, userId, achievementId: identifier, at: timestamp })).max(70000),
  settings: record({ maintenance: z.boolean(), referralsEnabled: z.boolean(), xpEnabled: z.boolean(), scanIntervalMinutes: z.number().int().min(1).max(10080), disabledProviders: z.array(identifier).max(100), disabledProxies: z.array(identifier).max(100), lastScanAt: nullableDate, lastBackupAt: nullableDate }),
  auditLogs: z.array(record({ ...entity, actorId: userId, action: text(100), target: text(100).nullable(), at: timestamp })).max(5000),
  backups: z.array(record({ ...entity, filename: z.string().regex(/^backup-[a-f0-9]{16}\.json$/), createdAt: timestamp, bytes: z.number().int().nonnegative() })).max(50),
}).superRefine((db, ctx) => {
  for (const [name, collection] of Object.entries(db)) {
    if (!Array.isArray(collection) || !collection.length || typeof collection[0] !== 'object') continue;
    if (new Set(collection.map(item => item.id)).size !== collection.length) ctx.addIssue({ code: 'custom', message: `ID duplikat: ${name}` });
  }
  for (const key of ['telegramId', 'referralCode']) if (new Set(db.users.map(user => user[key])).size !== db.users.length) ctx.addIssue({ code: 'custom', message: `Pengguna duplikat: ${key}` });
  for (const [name, key] of [['offers', row => row.dedupHash], ['favorites', row => `${row.userId}:${row.offerId}`], ['referrals', row => row.inviteeId], ['userAchievements', row => `${row.userId}:${row.achievementId}`]]) {
    if (new Set(db[name].map(key)).size !== db[name].length) ctx.addIssue({ code: 'custom', message: `Duplikasi: ${name}` });
  }
  const users = new Set(db.users.map(row => row.telegramId));
  const offers = new Set(db.offers.map(row => row.id));
  for (const name of ['favorites', 'searchHistory', 'notifications', 'tickets', 'userAchievements']) for (const row of db[name]) {
    if (!users.has(row.userId)) ctx.addIssue({ code: 'custom', message: `Relasi pengguna rusak: ${name}` });
  }
  for (const favorite of db.favorites) if (!offers.has(favorite.offerId)) ctx.addIssue({ code: 'custom', message: 'Relasi favorit rusak.' });
});
