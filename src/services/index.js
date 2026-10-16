import { setTimeout as delay } from 'node:timers/promises';
import { JsonStore } from '../database/json-store.js';
import { createProviders } from '../providers/index.js';
import { createLogger } from '../utils/logger.js';
import { escapeHtml } from '../utils/html-escape.js';
import { UserService } from './user-service.js';
import { PromoService } from './promo-service.js';
import { CloudService } from './cloud-service.js';
import { AlertService } from './alert-service.js';
import { NotificationService } from './notification-service.js';
import { BackupService } from './backup-service.js';
import { ReferralService } from './referral-service.js';
import { TicketService } from './ticket-service.js';
import { ExportService } from './export-service.js';
import { AiService, OpenAiAdapter } from './ai-service.js';
import { ProxyService } from './proxy-service.js';
import { Scheduler } from './scheduler.js';
import { cleanup } from './maintenance-service.js';
export async function createServices(config, send) {
  const logger = createLogger(config); let store;
  try { store = await new JsonStore(config.DATABASE_PATH).init(); } catch (error) { error.startupStage = 'DATABASE'; throw error; }
  let stage = 'DATABASE';
  try {
    const isNew = !store.snapshot().meta.updatedAt;
    if (isNew) await store.transaction(db => { db.settings.referralsEnabled = config.REFERRAL_ENABLED; db.settings.xpEnabled = config.XP_ENABLED; db.settings.scanIntervalMinutes = config.PROMO_CHECK_INTERVAL_MINUTES; });
    stage = 'PROVIDERS';
    const providers = await createProviders(config.PROVIDER_CONFIG_PATH);
    const users = new UserService(store); const promo = new PromoService(store, providers, logger, config.MAX_CONCURRENT_CHECKS);
    const cloud = new CloudService(promo); const alerts = new AlertService(store); const notifications = new NotificationService(store, send);
    const backup = new BackupService(store, config.BACKUP_PATH, config.OWNER_ID); const referral = new ReferralService(store);
    const tickets = new TicketService(store, config.OWNER_ID); const exports = new ExportService(store);
    const ai = new AiService(promo, config.AI_PROVIDER === 'openai' ? new OpenAiAdapter(config) : null);
    stage = 'PROXY';
    const proxy = await ProxyService.create(store, config.OWNER_ID, config.PROXY_CONFIG_PATH);
    const scheduler = new Scheduler(store, {
      scan: (_task, signal) => promo.scan(signal),
      backup: async () => { try { const result = await backup.create(); return `Backup ${result.id}`; } catch (error) { await send(config.OWNER_ID, 'Backup gagal. Periksa kapasitas/izin disk dan /jobs.').catch(() => {}); throw error; } },
      alerts: async (_task, signal) => { await cleanup(store); await alerts.check(); await notifications.deliver(signal); return 'Alert diproses.'; },
      broadcast: async (task, signal) => {
        const current = store.snapshot().tasks.find(item => item.id === task.id); const cursor = current.payload.cursor;
        const recipients = store.snapshot().users.filter(user => user.preferences.notifications).sort((a, b) => a.telegramId.localeCompare(b.telegramId)).filter(user => !cursor || user.telegramId > cursor);
        let sent = 0; let failed = 0;
        for (const user of recipients) {
          signal.throwIfAborted();
          try { await send(user.telegramId, escapeHtml(task.payload.text), { parse_mode: 'HTML' }); sent++; }
          catch (error) { if (error.response?.error_code !== 403) throw error; failed++; }
          await store.transaction(db => { const row = db.tasks.find(item => item.id === task.id); if (row) row.payload.cursor = user.telegramId; });
          await delay(75, undefined, { signal });
        }
        return `Terkirim pada percobaan ini: ${sent}; tidak dapat dihubungi: ${failed}.`;
      },
    }, { concurrency: config.MAX_CONCURRENT_CHECKS, retries: config.MAX_RETRIES, timeout: 120000, logger });
    stage = 'SCHEDULER';
    await scheduler.recover();
    return { store, logger, providers, users, promo, cloud, alerts, notifications, backup, referral, tickets, exports, ai, proxy, scheduler };
  } catch (error) { error.startupStage = stage; await store.close(); throw error; }
}
export function startPeriodic(services, config) {
  let busy = false; let pending = Promise.resolve();
  const tick = async () => {
    if (busy || !services.scheduler.health().running) return; busy = true;
    try {
      const db = services.store.snapshot();
      if (!db.settings.maintenance && services.providers.some(provider => provider.isConfigured() && !db.settings.disabledProviders.includes(provider.getName())) && (!db.settings.lastScanAt || Date.now() - Date.parse(db.settings.lastScanAt) >= db.settings.scanIntervalMinutes * 60000)) await services.scheduler.enqueue('scan', config.OWNER_ID, 'scan');
      if (config.BACKUP_ENABLED && (!db.settings.lastBackupAt || Date.now() - Date.parse(db.settings.lastBackupAt) >= config.BACKUP_INTERVAL_HOURS * 3600000)) await services.scheduler.enqueue('backup', config.OWNER_ID, 'backup');
      if (!db.settings.maintenance) await services.scheduler.enqueue('alerts', config.OWNER_ID, 'alerts');
    } catch (error) { services.logger.warn({ err: error }, 'Antrean berkala gagal'); } finally { busy = false; }
  };
  const timer = setInterval(() => { pending = tick(); }, 60000); timer.unref(); pending = tick();
  return async () => { clearInterval(timer); await pending; };
}
