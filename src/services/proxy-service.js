import fs from 'node:fs/promises';
import path from 'node:path';
import dns from 'node:dns/promises';
import net from 'node:net';
import { z } from 'zod';
import { ProxyAgent } from 'undici';
import { fetchJson, publicLookup, isPublicAddress } from '../utils/http.js';
import { safeUrl, now, id } from '../utils/security.js';
import { audit } from './user-service.js';
const schema = z.array(z.strictObject({ id: z.string().regex(/^[a-z0-9_-]{1,24}$/), urlEnv: z.string().regex(/^[A-Z][A-Z0-9_]{1,80}$/), probeUrl: safeUrl, allowedHosts: z.array(z.string().min(3)).min(1), permissionConfirmed: z.literal(true) })).max(20);
export class ProxyService {
  constructor(store, ownerId, configs = [], env = process.env, filename = '') { this.store = store; this.ownerId = ownerId; this.configs = configs; this.env = env; this.results = new Map(); this.filename = filename; }
  static async create(store, ownerId, filename) {
    let configs = [];
    if (filename) { try { configs = schema.parse(JSON.parse(await fs.readFile(filename, 'utf8'))); } catch (error) { if (error.code !== 'ENOENT') throw error; } }
    return new ProxyService(store, ownerId, configs, process.env, filename);
  }
  async save(configs) {
    if (!this.filename) throw new Error('Atur PROXY_CONFIG_PATH dahulu.');
    const valid = schema.parse(configs);
    if (new Set(valid.map(item => item.id)).size !== valid.length) throw new Error('ID proxy duplikat.');
    await fs.mkdir(path.dirname(path.resolve(this.filename)), { recursive: true, mode: 0o700 });
    const temp = `${this.filename}.${id()}.tmp`;
    try { await fs.writeFile(temp, JSON.stringify(valid, null, 2), { mode: 0o600, flag: 'wx' }); await fs.rename(temp, this.filename); }
    finally { await fs.unlink(temp).catch(() => {}); }
    this.configs = valid;
  }
  async add(actorId, config) {
    if (actorId !== this.ownerId) throw new Error('Khusus owner.');
    await this.save([...this.configs, config]);
    await this.store.transaction(db => audit(db, actorId, 'proxy.add', config.id));
  }
  async remove(actorId, proxyId) {
    if (actorId !== this.ownerId || !this.configs.some(item => item.id === proxyId)) throw new Error('Akses/ID proxy tidak valid.');
    await this.save(this.configs.filter(item => item.id !== proxyId)); this.results.delete(proxyId);
    await this.store.transaction(db => { db.settings.disabledProxies = db.settings.disabledProxies.filter(item => item !== proxyId); audit(db, actorId, 'proxy.remove', proxyId); });
  }
  list() { const disabled = this.store.snapshot().settings.disabledProxies; return this.configs.map(config => ({ id: config.id, status: disabled.includes(config.id) ? 'DISABLED' : this.results.get(config.id)?.status ?? 'NOT CHECKED', latencyMs: this.results.get(config.id)?.latencyMs ?? null })); }
  async toggle(actorId, proxyId, enabled) {
    if (actorId !== this.ownerId || !this.configs.some(item => item.id === proxyId)) throw new Error('Akses/ID proxy tidak valid.');
    await this.store.transaction(db => { db.settings.disabledProxies = db.settings.disabledProxies.filter(value => value !== proxyId); if (!enabled) db.settings.disabledProxies.push(proxyId); audit(db, actorId, enabled ? 'proxy.enable' : 'proxy.disable', proxyId); });
  }
  async test(actorId, proxyId) {
    if (actorId !== this.ownerId) throw new Error('Khusus owner.');
    const config = this.configs.find(item => item.id === proxyId);
    if (!config || this.store.snapshot().settings.disabledProxies.includes(proxyId)) throw new Error('Proxy tidak aktif.');
    const previous = this.results.get(proxyId);
    if (previous && Date.now() - previous.at < 60000) throw new Error('Cooldown proxy satu menit.');
    this.results.set(proxyId, { status: 'CHECKING', at: Date.now() });
    const started = Date.now(); let agent;
    try {
      const addresses = await boundedLookup(new URL(config.probeUrl).hostname);
      if (!addresses.length || addresses.some(item => !isPublicAddress(item.address))) throw new Error('Alamat probe privat ditolak.');
      const url = new URL(this.env[config.urlEnv]);
      if (net.isIP(url.hostname.replace(/^\[|\]$/g, '')) && !isPublicAddress(url.hostname.replace(/^\[|\]$/g, ''))) throw new Error('Alamat proxy privat ditolak.');
      if (url.protocol !== 'https:') throw new Error('Proxy wajib HTTPS.');
      agent = new ProxyAgent({ uri: url.toString(), proxyTls: { lookup: publicLookup } });
      await fetchJson(config.probeUrl, { allowedHosts: config.allowedHosts, dispatcher: agent, timeout: 5000 });
      const result = { status: 'OK', latencyMs: Date.now() - started, at: Date.now(), checkedAt: now() }; this.results.set(proxyId, result); return result;
    } catch {
      this.results.set(proxyId, { status: 'FAILED', latencyMs: null, at: Date.now() }); await this.toggle(actorId, proxyId, false); throw new Error('Tes proxy gagal; proxy dinonaktifkan.');
    } finally { await agent?.close(); }
  }
}

async function boundedLookup(hostname) {
  let timer;
  try {
    return await Promise.race([dns.lookup(hostname, { all: true }), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('DNS timeout')), 5000); timer.unref(); })]);
  } finally { clearTimeout(timer); }
}
