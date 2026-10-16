import { id, now, safeError } from '../utils/security.js';
import { audit } from './user-service.js';
export class Scheduler {
  #active = new Map(); #ticking = false; #paused = false; #timer; #tickPromise;
  constructor(store, handlers, { concurrency = 3, retries = 3, timeout = 60000, logger = { error() {} } } = {}) {
    this.store = store; this.handlers = handlers; this.concurrency = concurrency; this.retries = retries; this.timeout = timeout; this.logger = logger; this.lastTickAt = null;
  }
  async recover() {
    await this.store.transaction(db => {
      for (const task of db.tasks) if (task.status === 'RUNNING') { task.status = 'FAILED'; task.finishedAt = now(); task.error = 'INTERRUPTED'; }
    });
  }
  async enqueue(type, userId, key, payload = {}) {
    if (this.#paused) throw new Error('Scheduler dijeda.');
    if (!this.handlers[type]) throw new Error('Jenis tugas tidak dikenal.');
    return this.store.transaction(db => {
      const existing = db.tasks.find(task => task.key === key && ['PENDING', 'RUNNING'].includes(task.status));
      if (existing) return existing;
      if (db.tasks.some(task => (task.userId === userId || task.key === key) && task.type === type && Date.now() - Date.parse(task.createdAt) < 30000)) throw new Error('Cooldown tugas 30 detik.');
      // Pemicu berkala tidak boleh memenuhi kapasitas dengan riwayat terminal.
      if (db.tasks.length >= 5000) {
        const removable = db.tasks.findIndex(task => ['COMPLETED', 'FAILED', 'CANCELLED'].includes(task.status) && !(task.type === 'broadcast' && Date.now() - Date.parse(task.createdAt) < 3600000));
        if (removable < 0) throw new Error('Antrean tugas penuh.');
        db.tasks.splice(removable, 1);
      }
      const task = { id: id(), type, userId, key, payload, createdAt: now(), startedAt: null, finishedAt: null, nextRunAt: now(), attempts: 0, status: 'PENDING', result: null, error: null };
      db.tasks.push(task); return task;
    });
  }
  async cancel(taskId, actorId, ownerId) {
    return this.store.transaction(db => {
      const task = db.tasks.find(row => row.id === taskId);
      if (!task || (task.userId !== actorId && actorId !== ownerId)) throw new Error('Akses tugas ditolak.');
      if (task.status !== 'PENDING') throw new Error('Hanya tugas PENDING dapat dibatalkan.');
      task.status = 'CANCELLED'; task.finishedAt = now(); audit(db, actorId, 'job.cancel', taskId);
    });
  }
  tick() {
    if (this.#paused || this.#ticking) return this.#tickPromise ?? Promise.resolve();
    this.#ticking = true; this.lastTickAt = now();
    this.#tickPromise = (async () => {
      try {
        const pending = this.store.snapshot().tasks.filter(task => task.status === 'PENDING' && Date.parse(task.nextRunAt) <= Date.now()).slice(0, this.concurrency - this.#active.size);
        const results = await Promise.allSettled(pending.map(task => this.run(task)));
        if (results.some(result => result.status === 'rejected')) throw new Error('Penulisan hasil job gagal.');
      } finally { this.#ticking = false; }
    })();
    return this.#tickPromise;
  }
  async run(task) {
    const controller = new AbortController(); this.#active.set(task.id, controller);
    let timer;
    try {
      const claimed = await this.store.transaction(db => {
        const row = db.tasks.find(item => item.id === task.id);
        if (!row || row.status !== 'PENDING') return false;
        row.status = 'RUNNING'; row.startedAt = now(); row.attempts++; return true;
      });
      if (!claimed) return;
      controller.signal.throwIfAborted();
      timer = setTimeout(() => controller.abort(), this.timeout); timer.unref();
      // Handler wajib menghormati AbortSignal; tidak melepaskan job yang masih menulis.
      const result = await this.handlers[task.type](task, controller.signal);
      if (controller.signal.aborted) throw new Error('TIMEOUT');
      await this.store.transaction(db => { const row = db.tasks.find(item => item.id === task.id); if (row) { row.status = 'COMPLETED'; row.finishedAt = now(); row.result = String(result ?? 'Selesai').slice(0, 500); } });
    } catch (error) {
      this.logger.error({ err: error, correlationId: task.id }, 'Job gagal');
      await this.store.transaction(db => {
        const row = db.tasks.find(item => item.id === task.id); if (!row) return;
        row.error = controller.signal.aborted ? 'TIMEOUT_OR_SHUTDOWN' : safeError(error);
        if (!this.#paused && row.attempts <= this.retries) { row.status = 'PENDING'; row.nextRunAt = new Date(Date.now() + Math.max(Number.isFinite(error.retryAfterMs) ? Math.min(86400000, error.retryAfterMs) : 0, 1000 * 2 ** row.attempts + Math.floor(Math.random() * 1000))).toISOString(); }
        else { row.status = 'FAILED'; row.finishedAt = now(); }
      });
    } finally { clearTimeout(timer); this.#active.delete(task.id); }
  }
  start() { this.#paused = false; this.#timer = setInterval(() => { this.tick().catch(error => this.logger.error({ err: error }, 'Scheduler gagal')); }, 1000); this.#timer.unref(); }
  async pause() { this.#paused = true; clearInterval(this.#timer); await this.#tickPromise?.catch(error => this.logger.error({ err: error }, 'Scheduler berhenti dengan error')); }
  async stop() { this.#paused = true; clearInterval(this.#timer); for (const controller of this.#active.values()) controller.abort(); await this.#tickPromise?.catch(error => this.logger.error({ err: error }, 'Scheduler berhenti dengan error')); }
  health() { return { running: !this.#paused && Boolean(this.#timer), active: this.#active.size, lastTickAt: this.lastTickAt }; }
}
