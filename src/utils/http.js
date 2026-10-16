import dns from 'node:dns';
import ipaddr from 'ipaddr.js';
import { Agent, fetch } from 'undici';
import { safeUrl } from './security.js';
export function isPublicAddress(address) {
  try { return ipaddr.process(address).range() === 'unicast'; } catch { return false; }
}
export function publicLookup(hostname, options, callback) {
  dns.lookup(hostname, { all: true }, (error, addresses) => {
    if (error) return callback(error);
    if (!addresses.length || addresses.some(item => !isPublicAddress(item.address))) return callback(new Error('Alamat privat/reserved ditolak.'));
    const selected = options.family ? addresses.filter(item => item.family === options.family) : addresses;
    if (!selected.length) return callback(new Error('Alamat tidak tersedia.'));
    if (options.all) callback(null, selected); else callback(null, selected[0].address, selected[0].family);
  });
}
export const publicAgent = new Agent({ connect: { lookup: publicLookup } });
export async function readLimited(response, limit = 1024 * 1024) {
  if (Number(response.headers.get('content-length')) > limit) { await response.body?.cancel(); throw new Error('Respons terlalu besar.'); }
  const chunks = []; let size = 0;
  for await (const chunk of response.body ?? []) {
    size += chunk.length;
    if (size > limit) throw new Error('Respons terlalu besar.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}
export async function fetchJson(url, { allowedHosts, signal, timeout = 15000, dispatcher = publicAgent, ...options } = {}) {
  const parsed = new URL(safeUrl.parse(url));
  if (!allowedHosts?.includes(parsed.hostname) || ipaddr.isValid(parsed.hostname.replace(/^\[|\]$/g, ''))) throw new Error('Host tidak diizinkan.');
  const response = await fetch(url, { ...options, dispatcher, redirect: 'error', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeout)]) : AbortSignal.timeout(timeout) });
  if (!response.ok) {
    const retryAfter = response.headers.get('retry-after');
    const delay = /^\d+$/.test(retryAfter ?? '') ? Number(retryAfter) * 1000 : Date.parse(retryAfter ?? '') - Date.now();
    await response.body?.cancel();
    const error = new Error(`HTTP ${response.status}`);
    error.retryAfterMs = Number.isFinite(delay) ? Math.min(86400000, Math.max(0, delay)) : 0;
    throw error;
  }
  return JSON.parse(await readLimited(response));
}
