import * as fs from 'node:fs/promises';
import path from 'node:path';
import { databaseSchema } from './schema.js';
import { initialData } from './initial-data.js';
import { id, now } from '../utils/security.js';
export const MAX_DATABASE_BYTES = 32 * 1024 * 1024;
export async function readDatabase(filename) {
  const stat = await fs.stat(filename);
  if (stat.size > MAX_DATABASE_BYTES) throw new Error('Database melewati batas 32 MB.');
  return JSON.parse(await fs.readFile(filename, 'utf8'));
}
export class JsonStore {
  #data; #queue = Promise.resolve(); #lock; #closed = false;
  constructor(filename, { io = fs, lockIdentity } = {}) { this.filename = path.resolve(filename); this.io = io; this.lockIdentity = lockIdentity; }
  async init() {
    await fs.mkdir(path.dirname(this.filename), { recursive: true, mode: 0o700 });
    try { this.#lock = await fs.open(`${this.filename}.lock`, 'wx', 0o600); }
    catch (error) { if (error.code === 'EEXIST') throw Object.assign(new Error('Database terkunci. Pastikan proses lain sudah berhenti sebelum menghapus .lock.'), { code: 'DATABASE_LOCKED' }); throw error; }
    await this.#lock.writeFile(this.lockIdentity ? JSON.stringify({ version: 1, pid: process.pid, ...this.lockIdentity }) : String(process.pid));
    try {
      let raw;
      try { raw = await readDatabase(this.filename); }
      catch (error) {
        if (error.code === 'ENOENT') raw = initialData();
        else if (error instanceof SyntaxError) {
          // Jangan menimpa korupsi dengan database kosong.
          raw = databaseSchema.parse(await readDatabase(`${this.filename}.previous`));
          await fs.copyFile(this.filename, `${this.filename}.corrupt-${id()}`);
          await this.#atomic(raw);
        } else throw error;
      }
      if (raw.meta?.version === 0) {
        await fs.copyFile(this.filename, `${this.filename}.migration-${id()}`);
        // v0 adalah bentuk v1 tanpa koleksi/settings baru; field lama tetap divalidasi.
        raw = { ...initialData(), ...raw, meta: { ...raw.meta, version: 1 }, settings: { ...initialData().settings, ...raw.settings } };
      }
      this.#data = databaseSchema.parse(raw);
      if (!this.#data.meta.createdAt) this.#data.meta.createdAt = now();
      await this.#atomic(this.#data);
      return this;
    } catch (error) { await this.close(); throw error; }
  }
  snapshot() { if (!this.#data) throw new Error('Database belum siap.'); return structuredClone(this.#data); }
  transaction(mutator) {
    if (this.#closed) return Promise.reject(new Error('Database sudah ditutup.'));
    const operation = this.#queue.then(async () => {
      const next = this.snapshot();
      const result = await mutator(next);
      next.meta.updatedAt = now();
      const valid = databaseSchema.parse(next);
      const serialized = JSON.stringify(valid, null, 2);
      if (Buffer.byteLength(serialized) > MAX_DATABASE_BYTES) throw new Error('Database melewati batas 32 MB.');
      await this.io.copyFile(this.filename, `${this.filename}.previous`);
      await this.#atomic(valid);
      this.#data = valid;
      return structuredClone(result);
    });
    this.#queue = operation.catch(() => {});
    return operation;
  }
  async #atomic(data) {
    const temp = `${this.filename}.${id()}.tmp`;
    let handle;
    try {
      handle = await this.io.open(temp, 'wx', 0o600);
      await handle.writeFile(JSON.stringify(data, null, 2));
      await handle.sync(); await handle.close(); handle = null;
      await this.io.rename(temp, this.filename);
    } finally { await handle?.close().catch(() => {}); await this.io.unlink(temp).catch(() => {}); }
  }
  async replace(data) {
    const valid = databaseSchema.parse(data);
    return this.transaction(draft => { for (const key of Object.keys(draft)) delete draft[key]; Object.assign(draft, valid); });
  }
  async close() {
    this.#closed = true;
    await this.#queue;
    if (this.#lock) { await this.#lock.close(); this.#lock = null; await fs.unlink(`${this.filename}.lock`).catch(() => {}); }
  }
}
