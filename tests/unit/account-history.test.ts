import 'fake-indexeddb/auto';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { newAccount } from '../../src/core/account';
import { decodeBase32 } from '../../src/core/base32';
import { toBase64 } from '../../src/core/crypto/bytes';
import { newMasterKey, wrapWithPassword } from '../../src/core/crypto/keys';
import { encryptVault } from '../../src/core/crypto/vault';
import type { Account } from '../../src/core/types';
import { createAccountHistory } from '../../src/store/account-history';
import { removeFieldButton, syncFieldScripts } from '../../src/store/field-buttons';
import { clearSessionKey, setSessionKey } from '../../src/store/session';
import * as snapshots from '../../src/store/snapshots';
import { createVault, loadAccounts, readVaultFile, updateAccounts } from '../../src/store/vault';

vi.mock('../../src/store/field-buttons', () => ({
  removeFieldButton: vi.fn(async () => undefined),
  syncFieldScripts: vi.fn(async () => undefined),
  releaseUnusedOrigins: vi.fn(async () => undefined),
}));
const FAKE = decodeBase32('JBSWY3DPEHPK3PXP');
const RFC = new TextEncoder().encode('12345678901234567890');
const FAST = { iterations: 1, memoryKiB: 1024, parallelism: 1 };
const account = (id: string, overrides: Partial<Account> = {}): Account => ({
  ...newAccount({ type: 'totp', issuer: 'Fake', label: `${id}@example.test`, secret: FAKE, algorithm: 'SHA-1', digits: 6, period: 30 }, 1),
  id, ...overrides,
});
async function previousId() { return (await snapshots.listSnapshotPage()).items[0]!.id; }

beforeEach(async () => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  await chrome.storage.local.clear();
  await chrome.storage.session.clear();
  await snapshots._resetSnapshotsForTest();
  Object.defineProperty(globalThis, 'indexedDB', { value: new IDBFactory(), configurable: true });
});

describe('account history', () => {
  it('restores only the selected account and retains order, usage, metadata, and another concurrent edit', async () => {
    const first = account('a');
    const other = account('b', { secret: RFC });
    await createVault([other, first]);
    await updateAccounts((list) => list.map((a) => a.id === 'a' ? { ...a, label: 'new', lastUsedAt: 12, updatedAt: 2 } : a));
    const id = await previousId();
    const history = await createAccountHistory('a');
    const page = await history.readPage();
    expect(page.entries[0].fields).toEqual(['label']);
    const preview = await history.preview(id);
    expect(preview.changes).toEqual([{ field: 'label', before: 'new', after: first.label }]);
    await updateAccounts((list) => list.map((a) => a.id === 'b' ? { ...a, note: 'newer other note', updatedAt: 3 } : a));
    await history.restore(id);
    const after = await loadAccounts();
    expect(after.map((a) => a.id)).toEqual(['b', 'a']);
    expect(after[0].note).toBe('newer other note');
    expect(after[1]).toMatchObject({ label: first.label, createdAt: 1, lastUsedAt: 12, id: 'a' });
    expect((await readVaultFile())!.lock).toBe('none');
    expect((await snapshots.listSnapshotPage()).items.length).toBe(3);
  });

  it('rejects same-account edits, deletion, and duplicate credentials without overwriting', async () => {
    await createVault([account('a')]);
    await updateAccounts((list) => list.map((a) => ({ ...a, label: 'current', secret: RFC, updatedAt: 2 })));
    const id = await previousId();
    const history = await createAccountHistory('a');
    await updateAccounts((list) => [...list, account('b')]);
    await expect(history.restore(id)).rejects.toMatchObject({ reason: 'duplicate' });
    await updateAccounts((list) => list.map((a) => a.id === 'a' ? { ...a, note: 'changed', updatedAt: 3 } : a));
    await expect(history.restore(id)).rejects.toMatchObject({ reason: 'stale' });
    const fresh = await createAccountHistory('a');
    await updateAccounts((list) => list.map((a) => a.id === 'a' ? { ...a, deletedAt: 4 } : a));
    await expect(fresh.restore(id)).rejects.toMatchObject({ reason: 'stale' });
    expect((await loadAccounts())[0]).toMatchObject({ label: 'current', note: 'changed', deletedAt: 4 });
  });

  it('rejects a vault locked while a snapshot is being read', async () => {
    const key = await createVault([account('a')]);
    await updateAccounts((list) => list.map((a) => ({ ...a, note: 'current', updatedAt: 2 })));
    const file = (await readVaultFile())!;
    await chrome.storage.local.set({ vault: { ...file, lock: 'password', wrappedKeys: [] } });
    await setSessionKey(key);
    const id = await previousId();
    const history = await createAccountHistory('a');
    const original = snapshots.getSnapshot;
    vi.spyOn(snapshots, 'getSnapshot').mockImplementation(async (id) => {
      const file = await original(id);
      await clearSessionKey();
      return file;
    });
    await expect(history.restore(id)).rejects.toMatchObject({ reason: 'locked' });
    expect((await readVaultFile())!.checksum).toBe(file.checksum);
  });

  it.each(['current', 'past'])('preserves current authentication fields when %s is HOTP', async (hotpSide) => {
    const old = account('a', { type: hotpSide === 'past' ? 'hotp' : 'totp', counter: 2 });
    await createVault([old]);
    await updateAccounts((list) => list.map((a) => ({ ...a, type: hotpSide === 'current' ? 'hotp' : 'totp', secret: RFC, algorithm: 'SHA-256', digits: 8, period: 60, counter: 19, note: 'changed', updatedAt: 2 })));
    const id = await previousId();
    const before = (await loadAccounts())[0];
    const history = await createAccountHistory('a');
    expect(await history.preview(id)).toMatchObject({ hotp: true, changes: [{ field: 'note' }] });
    await history.restore(id);
    expect((await loadAccounts())[0]).toMatchObject({ type: before.type, secret: RFC, algorithm: 'SHA-256', digits: 8, period: 60, counter: 19, note: '' });
  });

  it('turns the field button off before restoring sites and never requests permission', async () => {
    await createVault([account('a', { matchHosts: ['old.example.test'] })]);
    await updateAccounts((list) => list.map((a) => ({ ...a, matchHosts: ['new.example.test'], updatedAt: 2 })));
    const history = await createAccountHistory('a');
    await history.restore(await previousId());
    expect(removeFieldButton).toHaveBeenCalledWith('a');
    expect(syncFieldScripts).toHaveBeenCalledOnce();
    expect((await loadAccounts())[0].matchHosts).toEqual(['old.example.test']);
  });

  it('supports an old password and isolates corrupt and absent versions', async () => {
    const key = newMasterKey();
    const wrap = await wrapWithPassword(key, 'test-pass-1234', FAST);
    const encrypted = await encryptVault([account('a', { note: 'old locked' })], key, 'password', [wrap]);
    await snapshots.addSnapshot(encrypted, 1);
    await snapshots.addSnapshot({ ...encrypted, checksum: 'corrupt' }, 2);
    const noneKey = newMasterKey();
    await snapshots.addSnapshot(await encryptVault([account('other')], noneKey, 'none', [{ kind: 'none', data: toBase64(noneKey), iv: '' }]), 3);
    await createVault([account('a')]);
    const history = await createAccountHistory('a');
    const page = await history.readPage();
    expect(page.entries.map((x) => x.status)).toEqual(['absent', 'corrupt', 'passwordNeeded']);
    const id = page.entries[2].id;
    await expect(history.preview(id, 'incorrect')).rejects.toMatchObject({ reason: 'wrongPassword' });
    expect((await history.preview(id, 'test-pass-1234')).changes).toEqual([{ field: 'note', before: '', after: 'old locked' }]);
    await history.restore(id, 'test-pass-1234');
    expect((await loadAccounts())[0].note).toBe('old locked');
  });

  it('deduplicates timestamp-only versions, checks missing snapshots, and discards aborted reads', async () => {
    await createVault([account('a')]);
    await updateAccounts((list) => list.map((a) => ({ ...a, lastUsedAt: 100, updatedAt: 2 })));
    const history = await createAccountHistory('a');
    expect((await history.readPage()).entries).toEqual([]);
    await expect(history.preview(999)).rejects.toMatchObject({ reason: 'missing' });
    history.dispose();
    await expect(history.readPage()).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('pages 40 versions with 300 fake accounts sequentially without getAll or re-reading previous pages', async () => {
    const key = newMasterKey();
    const wrapped = [{ kind: 'none' as const, data: toBase64(key), iv: '' }];
    const many = Array.from({ length: 300 }, (_, i) => account(`a${i}`));
    const now = Date.now();
    // 서로 다른 날의 판도 남게 보존 조건 안에서 만든다.
    for (let i = 0; i < 40; i++) {
      const stamp = now - (40 - i) * 12 * 60 * 60 * 1000;
      const file = await encryptVault(many.map((a) => a.id === 'a0' ? { ...a, note: `version ${i}` } : a), key, 'none', wrapped);
      await snapshots.addSnapshot(file, stamp);
    }
    await createVault(many);
    const before = await snapshots.listSnapshotPage();
    expect(before.items).toHaveLength(10);
    const second = await snapshots.listSnapshotPage(before.next);
    expect(second.items).toHaveLength(10);
    expect(second.items.every((x) => !before.items.some((a) => a.id === x.id))).toBe(true);
    const allSpy = vi.spyOn(IDBObjectStore.prototype, 'getAll');
    let concurrent = 0, maximum = 0;
    const original = snapshots.getSnapshot;
    const read = vi.spyOn(snapshots, 'getSnapshot').mockImplementation(async (id) => {
      concurrent++;
      maximum = Math.max(maximum, concurrent);
      try { return await original(id); } finally { concurrent--; }
    });
    const started = performance.now();
    const history = await createAccountHistory('a0');
    let pages = 0, versions = 0, more = true;
    while (more) {
      const page = await history.readPage();
      versions += page.entries.length;
      more = page.hasMore;
      pages++;
      expect(page.entries.every((x) => !('file' in x) && !('secret' in x))).toBe(true);
    }
    expect(versions).toBeGreaterThanOrEqual(30);
    expect(pages).toBeLessThanOrEqual(4);
    expect(maximum).toBe(1);
    expect(new Set(read.mock.calls.map(([id]) => id)).size).toBe(read.mock.calls.length);
    expect(allSpy).not.toHaveBeenCalled();
    console.info(`history throughput: ${versions} snapshots × 300 fake accounts, ${pages} pages, ${(performance.now() - started).toFixed(1)}ms, max concurrent snapshot reads ${maximum}`);
  });
});
