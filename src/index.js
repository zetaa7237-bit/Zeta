import { pathToFileURL } from 'node:url';
import { loadConfig } from './config.js';
import { createBot } from './bot.js';
import { createServices, startPeriodic } from './services/index.js';
import { publicAgent } from './utils/http.js';
export async function main() {
  const config = loadConfig(); let bot;
  const services = await createServices(config, (...args) => bot.telegram.sendMessage(...args));
  if (!config.PERSISTENT_STORAGE) services.logger.warn('Penyimpanan belum dikonfirmasi persisten. Render dapat menghapus data saat instance/deploy berganti.');
  const runtime = createBot(config, services); bot = runtime.bot;
  let stopPeriodic = async () => {}; let stopping = false; let launched = false;
  const shutdown = async signal => {
    if (stopping) return; stopping = true; services.logger.info({ signal }, 'Menghentikan bot');
    if (launched) { try { bot.stop(signal); } catch { /* Polling mungkin sudah berhenti. */ } }
    await stopPeriodic(); await runtime.drain(); await services.scheduler.stop(); await services.store.close(); await publicAgent.close();
  };
  process.once('SIGINT', () => { shutdown('SIGINT').catch(() => { process.exitCode = 1; }); });
  process.once('SIGTERM', () => { shutdown('SIGTERM').catch(() => { process.exitCode = 1; }); });
  try {
    bot.botInfo = await bot.telegram.getMe();
    await bot.telegram.setMyCommands([{ command: 'start', description: 'Menu NOVA HUNTER' }, { command: 'search', description: 'Cari penawaran lokal' }, { command: 'cancel', description: 'Batalkan input' }, { command: 'privacy', description: 'Kebijakan penyimpanan data' }]);
    services.scheduler.start(); stopPeriodic = startPeriodic(services, config); launched = true;
    services.logger.info('NOVA HUNTER V3 siap; long polling satu proses.');
    await bot.launch({ dropPendingUpdates: false });
  } finally { await shutdown('STOP'); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(error => {
  // Hanya error konfigurasi buatan sendiri boleh ditampilkan; error transport dapat membawa URL token.
  const message = error.message?.startsWith('Konfigurasi tidak valid:') ? error.message : 'Startup gagal. Periksa konektivitas Telegram, konfigurasi, izin disk, schema, dan lock database.';
  process.stderr.write(`${message}\n`); process.exitCode = 1;
});
