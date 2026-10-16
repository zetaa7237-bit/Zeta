import fs from 'node:fs/promises';
import path from 'node:path';
// Pemulihan eksplisit oleh operator, khusus worker Render dengan disk yang eksklusif.
// Render menghentikan instance lama sebelum disk dipasang pada instance baru.
export async function recoverDatabaseLock(filename, recoveryId, {
  serviceId = process.env.RENDER_SERVICE_ID,
  instanceId = process.env.RENDER_INSTANCE_ID,
  persistent = false,
  mountPath = '/var/data/nova',
  mountInfo = () => fs.readFile('/proc/self/mountinfo', 'utf8'),
} = {}) {
  if (!recoveryId) return false;
  if (!/^[a-f0-9]{16}$/.test(recoveryId) || !/^srv-[a-z0-9]+$/.test(serviceId ?? '') || !instanceId || !persistent) throw Object.assign(new Error('Pemulihan membutuhkan worker Render dengan disk persisten.'), { code: 'RECOVERY_NOT_ALLOWED' });
  const databasePath = path.resolve(filename);
  const mounted = (await mountInfo()).split('\n').some(line => line.split(' ')[4] === mountPath);
  if (!mounted || !databasePath.startsWith(`${mountPath}/`) || await fs.realpath(path.dirname(databasePath)) !== path.dirname(databasePath)) throw Object.assign(new Error('Mount database tidak sesuai.'), { code: 'RECOVERY_NOT_ALLOWED' });
  const lockPath = `${databasePath}.lock`;
  const marker = `${databasePath}.recovery-${recoveryId}.done`;
  try { await fs.stat(marker); return false; } catch (error) { if (error.code !== 'ENOENT') throw error; }
  let stat;
  try { stat = await fs.lstat(lockPath); } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
  if (!stat.isFile() || stat.size > 32) throw Object.assign(new Error('Format lock tidak sesuai.'), { code: 'RECOVERY_NOT_ALLOWED' });
  const raw = await fs.readFile(lockPath, 'utf8');
  if (!/^[1-9]\d{0,9}$/.test(raw)) throw Object.assign(new Error('PID lock tidak valid.'), { code: 'RECOVERY_NOT_ALLOWED' });
  const pid = Number(raw);
  // PID proses ini belum membuka JsonStore, sehingga lock yang sama adalah sisa instance lama.
  if (pid !== process.pid) {
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
