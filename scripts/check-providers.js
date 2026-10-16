// Smoke baca sumber resmi ke database sementara; tidak memerlukan token bot/API key.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createProviders } from '../src/providers/index.js';
import { JsonStore } from '../src/database/json-store.js';
import { PromoService } from '../src/services/promo-service.js';
import { publicAgent } from '../src/utils/http.js';
const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'nova-provider-smoke-'));
let store;
try {
  store = await new JsonStore(path.join(directory, 'database.json')).init();
  const providers = await createProviders();
  const promo = new PromoService(store, providers, { info() {}, warn() {} });
  console.log(await promo.scan());
  for (const provider of providers) {
    const status = await provider.healthCheck();
    const offers = store.snapshot().offers.filter(offer => offer.provider === provider.getName());
    console.log(JSON.stringify({ ...status, offers: offers.map(({ name, status, benefitValue, currency }) => ({ name, status, benefitValue, currency })) }));
    if (status.status !== 'OK' || offers.length !== 1) process.exitCode = 1;
  }
  if (!promo.search('AWS').length || !promo.search('Google Cloud').length) process.exitCode = 1;
} catch { console.error('Pemeriksaan sumber gagal. Periksa koneksi, robots policy, dan format halaman resmi.'); process.exitCode = 1; }
finally { await store?.close(); await fs.rm(directory, { recursive: true, force: true }); await publicAgent.close(); }
