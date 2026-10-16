import fs from 'node:fs/promises';
import path from 'node:path';
import { databaseSchema } from '../database/schema.js';
import { readDatabase, MAX_DATABASE_BYTES } from '../database/json-store.js';
import { id, now } from '../utils/security.js';
import { audit } from './user-service.js';
export class BackupService {
  #queue = Promise.resolve();
  constructor(store, directory, ownerId) { this.store = store; this.directory = path.resolve(directory); this.ownerId = ownerId; }
  exclusive(action) { const task = this.#queue.then(action); this.#queue = task.catch(() => {}); return task; }
  assertOwner(actorId) { if (actorId !== this.ownerId) throw new Error('Khusus owner.'); }
  async create(actorId = this.ownerId) { this.assertOwner(actorId); return this.exclusive(() => this.writeBackup(actorId)); }
  async writeBackup(actorId) {
    await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
    const backupId = id(); const filename = `backup-${backupId}.json`; const target = path.join(this.directory, filename);
    const data = JSON.stringify(databaseSchema.parse(this.store.snapshot()), null, 2);
    const handle = await fs.open(`${target}.tmp`, 'wx', 0o600);
    try { await handle.writeFile(data); await handle.sync(); } finally { await handle.close(); }
    await fs.rename(`${target}.tmp`, target);
    const entry = { id: backupId, filename, createdAt: now(), bytes: Buffer.byteLength(data) };
    await this.store.transaction(db => { db.backups.push(entry); db.backups = db.backups.slice(-50); db.settings.lastBackupAt = now(); audit(db, actorId, 'backup.create', backupId); });
    await this.prune(); return entry;
  }
  async prune() {
    const files = (await fs.readdir(this.directory)).filter(name => /^backup-[a-f0-9]{16}\.json$/.test(name));
    const records = await Promise.all(files.map(async filename => ({ filename, ...(await fs.stat(path.join(this.directory, filename))) })));
    records.sort((a, b) => b.mtimeMs - a.mtimeMs); let bytes = 0; const removed = [];
    for (const [index, record] of records.entries()) {
      bytes += record.size;
      if (index > 0 && (index >= 20 || Date.now() - record.mtimeMs > 30 * 86400000 || bytes > 128 * 1024 * 1024)) { await fs.unlink(path.join(this.directory, record.filename)); removed.push(record.filename); }
    }
    await this.store.transaction(db => { db.backups = db.backups.filter(item => !removed.includes(item.filename)); });
  }
  async read(backupId, actorId) {
    this.assertOwner(actorId);
    if (!/^[a-f0-9]{16}$/.test(backupId)) throw new Error('ID backup tidak valid.');
    return databaseSchema.parse(await readDatabase(path.join(this.directory, `backup-${backupId}.json`)));
  }
  async restore(backupId, actorId) {
    this.assertOwner(actorId);
    return this.exclusive(async () => { const data = await this.read(backupId, actorId); return this.apply(data, actorId, 'backup.restore'); });
  }
  async import(buffer, actorId) {
    this.assertOwner(actorId);
    if (buffer.length > MAX_DATABASE_BYTES) throw new Error('Impor maksimal 32 MB.');
    const data = databaseSchema.parse(JSON.parse(buffer.toString('utf8')));
    return this.exclusive(() => this.apply(data, actorId, 'database.import'));
  }
  async apply(data, actorId, action) {
    const backup = await this.writeBackup(actorId);
    // Jangan menjalankan ulang job/broadcast dari snapshot lama.
    for (const task of data.tasks) if (['RUNNING', 'PENDING'].includes(task.status)) { task.status = 'CANCELLED'; task.finishedAt = now(); }
    for (const item of data.notifications) item.dismissed = true;
    const backups = this.store.snapshot().backups;
    data.backups = backups; audit(data, actorId, action, backup.id);
    await this.store.replace(data); return backup;
  }
}
