import { randomBytes, createHash } from 'node:crypto';
import { z } from 'zod';
export const id = () => randomBytes(8).toString('hex');
export const now = () => new Date().toISOString();
export const digest = value => createHash('sha256').update(value).digest('hex');
export const safeUrl = z.url().max(2048).refine(value => {
  const url = new URL(value);
  return url.protocol === 'https:' && !url.username && !url.password && !url.hash && !url.port && ![...url.searchParams.keys()].some(key => /(?:token|api.?key|password|secret|signature|credential|authorization)/i.test(key)) && !sensitive.test(value);
}, 'URL harus HTTPS tanpa kredensial, port khusus, atau fragmen.');
export const sensitive = /(?:\b\d{5,20}:[a-z\d_-]{30,}\b|\b(?:sk-|AKIA)[a-z\d_-]{12,}|(?:password|passwd|token|api[_ -]?key|secret|otp|cookie|authorization)\s*[:=]\s*\S+)/i;
export function cleanInput(value, max = 1000) {
  const text = z.string().trim().min(1).max(max).parse(value);
  if (sensitive.test(text)) throw new Error('Jangan kirim token, password, OTP, cookie, atau API key.');
  return text;
}
export function safeError(error) {
  const code = error?.code;
  return ['ENOSPC', 'EACCES', 'EPERM', 'ENOENT', 'ABORT_ERR', 'ETIMEDOUT'].includes(code) ? code : 'OPERATION_FAILED';
}
export function canonicalUrl(value) {
  const url = new URL(safeUrl.parse(value));
  ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'].forEach(key => url.searchParams.delete(key));
  url.searchParams.sort();
  return url.toString().replace(/\/$/, '');
}
