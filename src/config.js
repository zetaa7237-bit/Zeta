import { z } from 'zod';

const flag = z.enum(['true', 'false']).transform(value => value === 'true');
const integer = (min, max, fallback) => z.coerce.number().int().min(min).max(max).default(fallback);
const schema = z.object({
  BOT_TOKEN: z.string().regex(/^\d{5,20}:[A-Za-z0-9_-]{30,}$/),
  OWNER_ID: z.string().regex(/^[1-9]\d{0,15}$/).refine(value => Number.isSafeInteger(Number(value))),
  NODE_ENV: z.enum(['production', 'development', 'test']).default('production'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'silent']).default('info'),
  DATABASE_PATH: z.string().min(1).default('./data/database.json'),
  BACKUP_PATH: z.string().min(1).default('./data/backups'),
  PROMO_CHECK_INTERVAL_MINUTES: integer(1, 10080, 60),
  MAX_CONCURRENT_CHECKS: integer(1, 10, 3), MAX_RETRIES: integer(0, 5, 3),
  AI_PROVIDER: z.enum(['none', 'openai']).default('none'),
  AI_API_KEY: z.string().default(''), AI_MODEL: z.string().max(100).default(''),
  BACKUP_ENABLED: flag.prefault('true'), BACKUP_INTERVAL_HOURS: integer(1, 168, 12),
  REFERRAL_ENABLED: flag.prefault('true'), XP_ENABLED: flag.prefault('true'),
  PROVIDER_CONFIG_PATH: z.string().default(''), PROXY_CONFIG_PATH: z.string().default(''),
  PERSISTENT_STORAGE: flag.prefault('false'), REQUEST_TIMEOUT_MS: integer(1000, 60000, 15000),
}).superRefine((value, ctx) => {
  if (value.AI_PROVIDER !== 'none' && (!value.AI_API_KEY || !value.AI_MODEL)) {
    ctx.addIssue({ code: 'custom', path: ['AI_PROVIDER'], message: 'AI membutuhkan AI_API_KEY dan AI_MODEL.' });
  }
});
export function loadConfig(env = process.env) {
  const result = schema.safeParse(env);
  if (!result.success) {
    const fields = [...new Set(result.error.issues.map(issue => issue.path.join('.')))];
    throw new Error(`Konfigurasi tidak valid: ${fields.join(', ')}. Periksa .env.example; nilai rahasia tidak ditampilkan.`);
  }
  return Object.freeze(result.data);
}
