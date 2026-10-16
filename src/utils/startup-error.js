import { safeError } from './security.js';
export function startupErrorMessage(error) {
  if (error.message?.startsWith('Konfigurasi tidak valid:')) return error.message;
  const stage = ['DATABASE', 'PROVIDERS', 'PROXY', 'SCHEDULER', 'SERVICES', 'TELEGRAM_AUTH', 'TELEGRAM_COMMANDS', 'POLLING'].includes(error.startupStage) ? error.startupStage : 'STARTUP';
  const telegramCode = error.response?.error_code;
  const code = error.code === 'DATABASE_LOCKED' ? 'DATABASE_LOCKED' : [401, 403, 404, 409, 429].includes(telegramCode) ? `TELEGRAM_${telegramCode}` : error.name === 'ZodError' ? 'INVALID_SCHEMA' : safeError(error);
  return `Startup gagal [${stage}; ${code}]. Periksa konfigurasi, konektivitas, izin disk, dan lock database. Nilai rahasia tidak ditampilkan.`;
}
