import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
// Lock legacy membutuhkan izin operator; lock beridentitas dapat dipulihkan pada disk Render eksklusif.
// Render menghentikan instance lama sebelum disk dipasang pada instance baru.
export async function recoverDatabaseLock(filename, recoveryId, {
  serviceId = process.env.RENDER_SERVICE_ID,
  instanceId = process.env.RENDER_INSTANCE_ID,
  persistent = false,
  mountPath = '/var/data/nova',
  mountInfo = () => fs.readFile('/proc/self/mountinfo', 'utf8'),
} = {}) {
  const platform = /^srv-[a-z0-9]+$/.test(serviceId ?? '') && typeof instanceId === 'string' && instanceId.length > 0 && persistent;
  if (!recoveryId && !platform) return false;
  if (recoveryId && (!/^[a-f0-9]{16}$/.test(recoveryId) || !platform)) throw Object.assign(new Error('Pemulihan membutuhkan worker Render dengan disk persisten.'), { code: 'RECOVERY_NOT_ALLOWED' });
  const databasePath = path.resolve(filename);
  const lockPath = `${databasePath}.lock`;
  let stat;
  try { stat = await fs.lstat(lockPath); } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
  if (!stat.isFile() || stat.size > 1024) throw Object.assign(new Error('Format lock tidak sesuai.'), { code: 'RECOVERY_NOT_ALLOWED' });
  const raw = await fs.readFile(lockPath, 'utf8');
  let identity;
  try { identity = JSON.parse(raw); } catch { /* Lock legacy berupa PID. */ }
  const structured = identity?.version === 1 && Number.isSafeInteger(identity.pid) && identity.pid > 0 && identity.serviceId === serviceId && typeof identity.instanceId === 'string' && identity.instanceId.length > 0;
  if (!recoveryId && !structured) return false;
  const mounted = (await mountInfo()).split('\n').some(line => line.split(' ')[4] === mountPath);
  if (!mounted || !databasePath.startsWith(`${mountPath}/`) || await fs.realpath(path.dirname(databasePath)) !== path.dirname(databasePath)) throw Object.assign(new Error('Mount database tidak sesuai.'), { code: 'RECOVERY_NOT_ALLOWED' });
  recoveryId ||= randomBytes(8).toString('hex');
  const marker = `${databasePath}.recovery-${recoveryId}.done`;
  try { await fs.stat(marker); return false; } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (!structured && !/^[1-9]\d{0,9}$/.test(raw)) throw Object.assign(new Error('PID lock tidak valid.'), { code: 'RECOVERY_NOT_ALLOWED' });
  const pid = structured ? identity.pid : Number(raw);
  // PID lintas instance memiliki namespace berbeda. Disk Render hanya dipasang setelah instance lama berhenti.
  // Dalam instance yang sama, proses aktif lain tetap ditolak; PID startup sendiri belum membuka database.
  if ((!structured || identity.instanceId === instanceId) && pid !== process.pid) {
    try { process.kill(pid, 0); throw Object.assign(new Error('PID lock masih aktif.'), { code: 'DATABASE_LOCKED' }); }
    catch (error) { if (error.code !== 'ESRCH') throw error; }
  }
  const checkpoint = await fs.open(marker, 'wx', 0o600);
  try { await checkpoint.writeFile('Pemulihan lock sekali pakai oleh operator.\n'); await checkpoint.sync(); } finally { await checkpoint.close(); }
  // Tolak perubahan lock di antara pemeriksaan dan pemulihan.
  const current = await fs.lstat(lockPath);
  if (current.ino !== stat.ino || await fs.readFile(lockPath, 'utf8') !== raw) throw Object.assign(new Error('Lock berubah selama pemulihan.'), { code: 'DATABASE_LOCKED' });
  await fs.rename(lockPath, `${lockPath}.recovered-${recoveryId}`);
  return true;
}
