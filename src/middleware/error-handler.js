import { id, safeError } from '../utils/security.js';
export async function handleError(error, ctx, logger) {
  const correlationId = id(); logger.error({ err: error, correlationId }, 'Operasi Telegram gagal');
  const message = ctx.state?.language === 'en' ? `Operation failed (${safeError(error)}). Check the input format or try again. Reference: ${correlationId}` : `Operasi gagal (${safeError(error)}). Periksa format input atau coba lagi. Referensi: ${correlationId}`;
  try { await ctx.reply(message); } catch { logger.warn({ correlationId }, 'Pesan kesalahan tidak dapat dikirim'); }
}
