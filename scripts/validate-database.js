import { databaseSchema } from '../src/database/schema.js';
import { readDatabase } from '../src/database/json-store.js';
try { databaseSchema.parse(await readDatabase(process.env.DATABASE_PATH || './data/database.json')); process.stdout.write('Database valid.\n'); }
catch { process.stderr.write('Database tidak valid atau tidak dapat dibaca. Gunakan backup tervalidasi; jangan timpa data asli.\n'); process.exitCode = 1; }
