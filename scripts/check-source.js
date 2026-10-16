import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
async function check(directory) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) await check(filename);
    else if (filename.endsWith('.js')) { const result = spawnSync(process.execPath, ['--check', filename], { stdio: 'inherit' }); if (result.status !== 0) process.exitCode = 1; }
  }
}
await check('src'); await check('scripts');
