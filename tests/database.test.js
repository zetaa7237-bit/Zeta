import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { JsonStore } from '../src/database/json-store.js';
import { initialData } from '../src/database/initial-data.js';
import { databaseSchema } from '../src/database/schema.js';
import { setup, USER } from './helpers.js';
const resources = []; afterEach(async () => { await Promise.all(resources.splice(0).map(item => item.close())); });
async function fixture() { const item = await setup(); resources.push(item); return item; }
describe('JSON database', () => {
  it('menginisialisasi dan menolak penulis kedua', async () => {
    const { store } = await fixture(); expect(store.snapshot().meta.version).toBe(1); expect(store.snapshot().meta.createdAt).toBeTruthy();
    await expect(new JsonStore(store.filename).init()).rejects.toThrow('terkunci');
  });
  it('menyerialkan 40 penulisan tanpa lost update dan menolak schema invalid', async () => {
    const { store } = await fixture(); const before = store.snapshot().users.find(user => user.telegramId === USER).xp;
    await Promise.all(Array.from({ length: 40 }, () => store.transaction(db => { db.users.find(user => user.telegramId === USER).xp++; })));
    expect(store.snapshot().users.find(user => user.telegramId === USER).xp).toBe(before + 40);
    const disk = JSON.parse(await fs.readFile(store.filename, 'utf8')); expect(databaseSchema.safeParse(disk).success).toBe(true);
    await expect(store.transaction(db => { db.users[0].xp = -1; })).rejects.toThrow();
    expect(JSON.parse(await fs.readFile(store.filename, 'utf8'))).toEqual(disk);
  });
  it.each(['ENOSPC', 'EACCES'])('kegagalan atomic rename %s menjaga disk dan memori', async code => {
    const item = await fixture(); const before = item.store.snapshot();
    item.store.io = { ...fs, rename: async () => { throw Object.assign(new Error('disk'), { code }); } };
    await expect(item.store.transaction(db => { db.settings.maintenance = true; })).rejects.toMatchObject({ code });
    expect(item.store.snapshot()).toEqual(before);
    expect(JSON.parse(await fs.readFile(item.store.filename, 'utf8'))).toEqual(before);
    expect((await fs.readdir(item.directory)).some(name => name.endsWith('.tmp'))).toBe(false);
    item.store.io = fs;
  });
  it('memulihkan JSON korup dari previous dan mengarantina sumber', async () => {
    const item = await fixture(); await item.store.transaction(db => { db.settings.maintenance = true; });
    const previous = JSON.parse(await fs.readFile(`${item.store.filename}.previous`, 'utf8'));
    await item.store.close(); await fs.writeFile(item.store.filename, '{broken');
    const restored = await new JsonStore(item.store.filename).init();
    expect(restored.snapshot()).toEqual(previous); expect((await fs.readdir(item.directory)).some(name => name.includes('.corrupt-'))).toBe(true); await restored.close();
  });
  it('gagal tertutup jika JSON rusak tanpa backup', async () => {
    const item = await fixture(); await item.store.close(); await fs.rm(`${item.store.filename}.previous`); await fs.writeFile(item.store.filename, '{broken');
    await expect(new JsonStore(item.store.filename).init()).rejects.toThrow(); expect(await fs.readFile(item.store.filename, 'utf8')).toBe('{broken');
  });
  it('migration v0 membuat backup dan versi asing ditolak', async () => {
    const item = await fixture(); await item.store.close(); const data = initialData(); data.meta.version = 0; delete data.backups;
    await fs.writeFile(item.store.filename, JSON.stringify(data)); const migrated = await new JsonStore(item.store.filename).init();
    expect(migrated.snapshot().meta.version).toBe(1); expect((await fs.readdir(item.directory)).some(name => name.includes('.migration-'))).toBe(true); await migrated.close();
    data.meta.version = 77; await fs.writeFile(item.store.filename, JSON.stringify(data)); await expect(new JsonStore(item.store.filename).init()).rejects.toThrow();
  });
  it('mencegah data rahasia dan relasi favorit yatim', async () => {
    const { store } = await fixture(); await expect(store.transaction(db => { db.users[0].username = 'password=private'; })).rejects.toThrow();
    await expect(store.transaction(db => { db.favorites.push({ id: 'dangling', userId: USER, offerId: 'missing', createdAt: new Date().toISOString() }); })).rejects.toThrow();
  });
});
