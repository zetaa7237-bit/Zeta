import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { recoverDatabaseLock } from '../src/database/recover-lock.js';
import { JsonStore } from '../src/database/json-store.js';
const directories = []; afterEach(async () => { for (const directory of directories.splice(0)) await fs.rm(directory, { recursive: true, force: true }); });
async function fixture() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'nova-recovery-')); directories.push(directory);
  const filename = path.join(directory, 'database.json');
  const options = { serviceId: 'srv-fixture', instanceId: 'fixture-instance', persistent: true, mountPath: directory, mountInfo: async () => `1 2 0:1 / ${directory} rw - ext4 /dev/fixture rw` };
  return { directory, filename, options };
}
it('recovers only an abandoned lock once and preserves database bytes', async () => {
  const { filename, options } = await fixture(); const store = await new JsonStore(filename).init(); await store.close();
  const before = await fs.readFile(filename); await fs.writeFile(`${filename}.lock`, '2147483647');
  expect(await recoverDatabaseLock(filename, 'aaaaaaaaaaaaaaaa', options)).toBe(true);
  expect(await fs.readFile(filename)).toEqual(before); expect(await fs.readFile(`${filename}.lock.recovered-aaaaaaaaaaaaaaaa`, 'utf8')).toBe('2147483647');
  await fs.writeFile(`${filename}.lock`, '2147483647'); expect(await recoverDatabaseLock(filename, 'aaaaaaaaaaaaaaaa', options)).toBe(false); expect(await fs.readFile(`${filename}.lock`, 'utf8')).toBe('2147483647');
});
it('rejects live owner PID, malformed locks, and absent platform/mount guarantees', async () => {
  const { filename, options } = await fixture(); await fs.writeFile(`${filename}.lock`, String(process.ppid));
  await expect(recoverDatabaseLock(filename, 'bbbbbbbbbbbbbbbb', options)).rejects.toMatchObject({ code: 'DATABASE_LOCKED' });
  await expect(recoverDatabaseLock(filename, 'bbbbbbbbbbbbbbbb', { ...options, persistent: false })).rejects.toMatchObject({ code: 'RECOVERY_NOT_ALLOWED' });
  await expect(recoverDatabaseLock(filename, 'bbbbbbbbbbbbbbbb', { ...options, mountInfo: async () => '' })).rejects.toMatchObject({ code: 'RECOVERY_NOT_ALLOWED' });
  await fs.writeFile(`${filename}.lock`, 'not-a-pid'); await expect(recoverDatabaseLock(filename, 'bbbbbbbbbbbbbbbb', options)).rejects.toMatchObject({ code: 'RECOVERY_NOT_ALLOWED' });
});
it('a reused container PID matching this startup process is stale before JsonStore opens', async () => {
  const { filename, options } = await fixture(); await fs.writeFile(`${filename}.lock`, String(process.pid));
  expect(await recoverDatabaseLock(filename, 'cccccccccccccccc', options)).toBe(true);
});
it('does nothing unless operator supplies a recovery ID', async () => {
  const { filename } = await fixture(); await fs.writeFile(`${filename}.lock`, '2147483647');
  expect(await recoverDatabaseLock(filename, '')).toBe(false); expect(await fs.readFile(`${filename}.lock`, 'utf8')).toBe('2147483647');
});
it('recovers an identified previous Render instance automatically despite PID namespace reuse', async () => {
  const { filename, options } = await fixture();
  const store = await new JsonStore(filename, { lockIdentity: { serviceId: options.serviceId, instanceId: 'previous-instance' } }).init();
  const raw = await fs.readFile(`${filename}.lock`, 'utf8'); await store.close();
  await fs.writeFile(`${filename}.lock`, raw.replace(String(process.pid), String(process.ppid)));
  expect(await recoverDatabaseLock(filename, '', options)).toBe(true);
  const reopened = await new JsonStore(filename, { lockIdentity: { serviceId: options.serviceId, instanceId: options.instanceId } }).init();
  expect(JSON.parse(await fs.readFile(`${filename}.lock`, 'utf8')).instanceId).toBe(options.instanceId); await reopened.close();
});
it('refuses automatic recovery for another service, legacy lock, or live process in the same instance', async () => {
  const { filename, options } = await fixture();
  const lock = { version: 1, pid: process.ppid, serviceId: options.serviceId, instanceId: options.instanceId };
  await fs.writeFile(`${filename}.lock`, JSON.stringify(lock));
  await expect(recoverDatabaseLock(filename, '', options)).rejects.toMatchObject({ code: 'DATABASE_LOCKED' });
  await fs.writeFile(`${filename}.lock`, JSON.stringify({ ...lock, serviceId: 'srv-other' }));
  expect(await recoverDatabaseLock(filename, '', options)).toBe(false);
  await fs.writeFile(`${filename}.lock`, '2147483647');
  expect(await recoverDatabaseLock(filename, '', options)).toBe(false);
  await fs.writeFile(`${filename}.lock`, JSON.stringify({ ...lock, instanceId: 'old' }));
  await expect(recoverDatabaseLock(filename, '', { ...options, mountInfo: async () => '' })).rejects.toMatchObject({ code: 'RECOVERY_NOT_ALLOWED' });
});
