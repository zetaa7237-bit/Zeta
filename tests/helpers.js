import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { vi } from 'vitest';
import { JsonStore } from '../src/database/json-store.js';
import { UserService } from '../src/services/user-service.js';
import { id, now, digest } from '../src/utils/security.js';
export const OWNER = '10001';
export const USER = '10002';
export const token = () => `123456:${'x'.repeat(35)}`;
export async function setup() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'nova-test-'));
  const store = await new JsonStore(path.join(directory, 'database.json')).init();
  const users = new UserService(store);
  await users.ensure({ id: Number(OWNER), username: 'owner_test' });
  await users.ensure({ id: Number(USER), username: 'user_test' });
  return { store, users, directory, close: async () => { await store.close(); await fs.rm(directory, { recursive: true, force: true }); } };
}
export function offer(overrides = {}) {
  return { id: id(), provider: 'mock', name: 'Penawaran sintetis untuk tes', category: 'cloud', benefitType: 'credit', benefitValue: 10, currency: 'USD', duration: '30 hari (fixture)', eligibility: 'Data sintetis, bukan promo nyata', regions: ['Indonesia'], officialUrl: 'https://example.com/fixture', source: 'https://example.com/fixture', discoveredAt: now(), checkedAt: now(), expiresAt: new Date(Date.now() + 86400000).toISOString(), status: 'VERIFIED', dedupHash: digest('https://example.com/fixture'), products: ['Compute fixture'], limits: null, accountRequirements: null, billing: null, costRisk: 'Fixture biaya setelah tanggal akhir', registrationUrl: null, ...overrides };
}
export const logger = () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() });
export function context(userId = USER) {
  const messages = []; const capture = async (text, options) => { messages.push({ text, options }); return {}; };
  return { from: { id: Number(userId) }, botInfo: { username: 'nova_fixture_bot' }, chat: { type: 'private' }, message: { text: '' }, reply: vi.fn(capture), editMessageText: vi.fn(capture), replyWithDocument: vi.fn(), answerCbQuery: vi.fn(), messages };
}
