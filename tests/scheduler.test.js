import { afterEach, expect, it, vi } from 'vitest';
import { setup, USER, OWNER, logger } from './helpers.js';
import { Scheduler } from '../src/services/scheduler.js';
const resources = []; afterEach(async () => { vi.useRealTimers(); for (const item of resources.splice(0)) await item.close(); });
async function fixture() { const item = await setup(); resources.push(item); return item; }
it('scheduler retries bounded, deduplicates, sanitizes error and persists terminal state', async () => {
  const { store } = await fixture(); const handler = vi.fn().mockRejectedValueOnce(new Error('credential-secret')).mockResolvedValue('ok');
  const scheduler = new Scheduler(store, { scan: handler }, { retries: 1, logger: logger() });
  const first = await scheduler.enqueue('scan', USER, 'scan'); expect((await scheduler.enqueue('scan', USER, 'scan')).id).toBe(first.id);
  await scheduler.tick(); expect(store.snapshot().tasks[0]).toMatchObject({ status: 'PENDING', attempts: 1, error: 'OPERATION_FAILED' });
  await store.transaction(db => { db.tasks[0].nextRunAt = '2000-01-01T00:00:00.000Z'; }); await scheduler.tick();
  expect(store.snapshot().tasks[0]).toMatchObject({ status: 'COMPLETED', attempts: 2, result: 'ok' });
});
it('scheduler prevents overlap, limits concurrency and only cancels pending owned jobs', async () => {
  const { store } = await fixture(); let active = 0; let max = 0; const finish = [];
  const handler = () => new Promise(resolve => { active++; max = Math.max(max, active); finish.push(() => { active--; resolve('done'); }); });
  const scheduler = new Scheduler(store, { scan: handler, alerts: handler, backup: handler }, { concurrency: 2, logger: logger() });
  await scheduler.enqueue('scan', USER, 'scan'); await scheduler.enqueue('alerts', USER, 'alerts'); const third = await scheduler.enqueue('backup', USER, 'backup');
  const running = scheduler.tick(); await vi.waitFor(() => expect(finish).toHaveLength(2)); const overlap = scheduler.tick(); expect(overlap).toBe(running); expect(max).toBe(2);
  await expect(scheduler.cancel(third.id, '99999', OWNER)).rejects.toThrow(); await scheduler.cancel(third.id, USER, OWNER);
  finish.forEach(resolve => resolve()); await running; expect(store.snapshot().tasks[2].status).toBe('CANCELLED');
});
it('scheduler abort timeout and restart recovery do not replay running broadcast', async () => {
  const { store } = await fixture();
  const handler = (_task, signal) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
  const scheduler = new Scheduler(store, { scan: handler }, { timeout: 10, retries: 0, logger: logger() });
  await scheduler.enqueue('scan', USER, 'scan'); await scheduler.tick(); expect(store.snapshot().tasks[0]).toMatchObject({ status: 'FAILED', error: 'TIMEOUT_OR_SHUTDOWN' });
  await store.transaction(db => { db.tasks[0].status = 'RUNNING'; }); await scheduler.recover(); expect(store.snapshot().tasks[0].error).toBe('INTERRUPTED');
});

it('pause waits for active writes before a restore can replace data', async () => {
  const { store } = await fixture(); let release; const handler = () => new Promise(resolve => { release = resolve; });
  const scheduler = new Scheduler(store, { scan: handler }, { logger: logger() });
  await scheduler.enqueue('scan', USER, 'scan'); const tick = scheduler.tick();
  await vi.waitFor(() => expect(release).toBeTypeOf('function'));
  let paused = false; const pausing = scheduler.pause().then(() => { paused = true; });
  await new Promise(resolve => setImmediate(resolve)); expect(paused).toBe(false);
  release('done'); await Promise.all([tick, pausing]); expect(paused).toBe(true);
});
it('scheduler honors a provider Retry-After instead of retrying too early', async () => {
  const { store } = await fixture();
  const scheduler = new Scheduler(store, { scan: async () => { throw Object.assign(new Error('rate limit'), { retryAfterMs: 60000 }); } }, { logger: logger() });
  await scheduler.enqueue('scan', USER, 'scan'); const started = Date.now(); await scheduler.tick();
  expect(Date.parse(store.snapshot().tasks[0].nextRunAt) - started).toBeGreaterThanOrEqual(60000);
});
it('periodic jobs continue after terminal history reaches capacity without discarding active jobs', async () => {
  const { store } = await fixture(); const scheduler = new Scheduler(store, { scan: async () => 'ok', alerts: async () => 'ok' }, { logger: logger() });
  const seed = await scheduler.enqueue('scan', USER, 'first');
  await store.transaction(db => {
    db.tasks = Array.from({ length: 5000 }, (_, index) => ({ ...seed, id: `task${index}`, key: `key${index}`, type: 'scan', status: index === 0 ? 'RUNNING' : 'COMPLETED', createdAt: '2000-01-01T00:00:00.000Z' }));
  });
  await scheduler.enqueue('alerts', OWNER, 'alerts'); const tasks = store.snapshot().tasks;
  expect(tasks).toHaveLength(5000); expect(tasks.some(task => task.id === 'task0')).toBe(true); expect(tasks.some(task => task.id === 'task1')).toBe(false);
});
