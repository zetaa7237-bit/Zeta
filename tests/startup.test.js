import { spawnSync } from 'node:child_process';
import { expect, it } from 'vitest';
it('startup without mandatory configuration exits clearly without secrets or network', () => {
  const env = { ...process.env }; delete env.BOT_TOKEN; delete env.OWNER_ID;
  const result = spawnSync(process.execPath, ['src/index.js'], { env, encoding: 'utf8', timeout: 5000 });
  expect(result.status).toBe(1); expect(result.stderr).toContain('Konfigurasi tidak valid: BOT_TOKEN, OWNER_ID');
  const invalid = spawnSync(process.execPath, ['src/index.js'], { env: { ...env, BOT_TOKEN: 'must_not_be_disclosed', OWNER_ID: 'not-numeric' }, encoding: 'utf8', timeout: 5000 });
  expect(invalid.status).toBe(1); expect(invalid.stderr).not.toContain('must_not_be_disclosed'); expect(invalid.stderr).not.toContain('not-numeric');
});
it('startup diagnostics expose only known stage and error codes, never transport secrets', async () => {
  const { startupErrorMessage } = await import('../src/utils/startup-error.js');
  const error = Object.assign(new Error('https://example.com/password=private'), { startupStage: 'TELEGRAM_AUTH', response: { error_code: 401 } });
  expect(startupErrorMessage(error)).toContain('TELEGRAM_AUTH; TELEGRAM_401');
  expect(startupErrorMessage(error)).not.toContain('private');
  expect(startupErrorMessage({ message: 'secret', startupStage: 'private', code: 'private' })).toContain('STARTUP; OPERATION_FAILED');
  expect(startupErrorMessage({ startupStage: 'DATABASE', code: 'DATABASE_LOCKED' })).toContain('DATABASE; DATABASE_LOCKED');
});
