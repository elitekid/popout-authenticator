import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HOUSEKEEPING_ALARM, register, runHousekeeping } from '../../src/bg/housekeeping';
import { newAccount, type AccountDraft } from '../../src/core/account';
import { WrongSecretError } from '../../src/core/crypto/errors';
import { encryptVault } from '../../src/core/crypto/vault';
import { newMasterKey, wrapWithPassword } from '../../src/core/crypto/keys';
import { DEFAULT_SETTINGS, type Account, type VaultFile } from '../../src/core/types';
import { LockedError, NoVaultError, VaultWriteError } from '../../src/store/errors';
import {
  buildRawCopy,
  checkEmptyRecovery,
  isRawCopy,
  openRawCopy,
  openSnapshot,
  restoreSnapshot,
} from '../../src/store/recover';
import { clearSessionKey, setSessionKey } from '../../src/store/session';
import { loadSettings, onSettingsChanged, saveSettings } from '../../src/store/settings';
import { mergeAccounts } from '../../src/store/sync';
import {
  _resetSnapshotsForTest,
  addSnapshot,
  listSnapshots,
  pruneSnapshots,
} from '../../src/store/snapshots';
import {
  TRASH_DAYS,
  emptyTrash,
  listTrash,
  moveToTrash,
  purgeExpiredTrash,
  restoreFromTrash,
} from '../../src/store/trash';
import { addDrafts, createVault, loadAccounts, replaceVaultFile, updateAccounts } from '../../src/store/vault';

const FAST = { iterations: 1, memoryKiB: 1024, parallelism: 1 };
const DAY = 86_400_000;
const FAKE_SECRET = [0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x21, 0xde, 0xad, 0xbe, 0xef];

// 마지막 바이트만 바꿔 서로 다른 가짜 비밀키를 만든다.
function draft(n = 0): AccountDraft {
  const secret = new Uint8Array(FAKE_SECRET);
  secret[secret.length - 1] = n;
  return {
    type: 'totp',
    issuer: 'Example',
    label: `user${n}@example.com`,
    secret,
    algorithm: 'SHA-1',
    digits: 6,
    period: 30,
  };
}

const account = (n = 0, now = 1_700_000_000_000): Account => newAccount(draft(n), now);
const ids = (accounts: Account[]) => accounts.map((a) => a.id).sort();

function fakeFile(n: number): VaultFile {
  return {
    format: 'otpx-vault',
    version: 1,
    lock: 'none',
    wrappedKeys: [],
    iv: '',
    data: '',
    count: 1,
    checksum: `fake-${n}`,
    savedAt: 0,
  };
}

async function putLockedVault(accounts: Account[]): Promise<Uint8Array> {
  const master = newMasterKey();
  const wrapped = await wrapWithPassword(master, 'fake-pass-5678', FAST);
  const file = await encryptVault(accounts, master, 'password', [wrapped]);
  await replaceVaultFile(async () => file);
  return master;
}

beforeEach(async () => {
  await chrome.storage.local.clear();
  await chrome.storage.session.clear();
  await chrome.alarms.clearAll();
  await _resetSnapshotsForTest();
  Object.defineProperty(globalThis, 'indexedDB', {
    value: new IDBFactory(),
    configurable: true,
    writable: true,
  });
});

describe('vault write', () => {
  it('keeps the old vault and takes no snapshot when the re-read differs', async () => {
    const a = account(1);
    await createVault([a]);
    await updateAccounts((list) => [...list, account(2)]);
    const before = await loadAccounts();
    const snapshotsBefore = (await listSnapshots()).length;

    const local = chrome.storage.local;
    const original = local.get.bind(local) as unknown as (keys?: unknown) => Promise<Record<string, unknown>>;
    const originalSet = local.set.bind(local) as unknown as (items: Record<string, unknown>) => Promise<void>;
    let written = false;
    const setSpy = vi.spyOn(local, 'set').mockImplementation((async (items: Record<string, unknown>) => {
      written = true;
      return originalSet(items);
    }) as never);
    const getSpy = vi.spyOn(local, 'get').mockImplementation((async (keys?: unknown) => {
      const got = await original(keys);
      const vault = got.vault as VaultFile | undefined;
      if (written && vault) return { ...got, vault: { ...vault, checksum: 'tampered' } };
      return got;
    }) as never);

    await expect(updateAccounts((list) => [...list, account(3)])).rejects.toBeInstanceOf(VaultWriteError);
    getSpy.mockRestore();
    setSpy.mockRestore();

    expect(ids(await loadAccounts())).toEqual(ids(before));
    expect((await listSnapshots()).length).toBe(snapshotsBefore);
  });

  it('snapshots the previous version on each write', async () => {
    const a = account(1);
    const b = account(2);
    await createVault([a]);
    await updateAccounts((list) => [...list, b]);
    await updateAccounts((list) => [...list, account(3)]);

    const list = await listSnapshots();
    expect(list.length).toBeGreaterThanOrEqual(1);
    const previous = await openSnapshot(list[0].id);
    expect(ids(previous)).toEqual(ids([a, b]));
  });

  it('does not lose accounts on concurrent writes', async () => {
    await createVault();
    await Promise.all(Array.from({ length: 10 }, (_, i) => addDrafts([draft(i)])));
    expect(await loadAccounts()).toHaveLength(10);
  });

  it('reports a duplicate on the second add', async () => {
    await createVault();
    const first = await addDrafts([draft(1)], [{ pinned: true, group: 'work', note: 'n' }]);
    expect(first.added).toHaveLength(1);
    expect(first.duplicates).toBe(0);
    const second = await addDrafts([draft(1)]);
    expect(second.added).toHaveLength(0);
    expect(second.duplicates).toBe(1);
    const [stored] = await loadAccounts();
    expect(stored.pinned).toBe(true);
    expect(stored.group).toBe('work');
    expect(stored.note).toBe('n');
  });

  it('matches meta to drafts by index across duplicates', async () => {
    await createVault();
    await addDrafts([draft(1)]);
    const { added } = await addDrafts([draft(1), draft(2)], [{ note: 'dup' }, { note: 'second' }]);
    expect(added).toHaveLength(1);
    expect(added[0].note).toBe('second');
  });

  it('refuses to overwrite an existing vault', async () => {
    await createVault([account(1)]);
    await expect(createVault()).rejects.toThrow('vault exists');
    expect(await loadAccounts()).toHaveLength(1);
  });

  it('throws NoVaultError when there is no vault', async () => {
    await expect(loadAccounts()).rejects.toBeInstanceOf(NoVaultError);
  });
});

describe('snapshots', () => {
  it('keeps the latest 30 plus one per day for 30 days', async () => {
    const now = Date.UTC(2026, 9, 13, 12, 0, 0);
    let n = 0;
    for (let i = 0; i < 40; i++) await addSnapshot(fakeFile(n++), now - i * 60_000);
    for (let k = 1; k <= 40; k++) await addSnapshot(fakeFile(n++), now - k * DAY);
    await pruneSnapshots(now);
    expect(await listSnapshots()).toHaveLength(59);
  });

  it('skips a snapshot identical to the latest one', async () => {
    await addSnapshot(fakeFile(1), 1000);
    await addSnapshot(fakeFile(1), 2000);
    expect(await listSnapshots()).toHaveLength(1);
  });
});

describe('recovery', () => {
  it.each(['replace', 'merge'] as const)('keeps %s restoration newer than the current copy and deletion markers', async (mode) => {
    const a = account(1);
    await createVault([a]);
    const updatedAt = Date.now() + DAY;
    const newer = { ...a, label: 'changed', updatedAt };
    await updateAccounts(() => mode === 'replace' ? [newer] : []);
    const [snapshot] = await listSnapshots();
    const tombs = { [a.id]: updatedAt + DAY };
    await chrome.storage.local.set({ syncTomb: tombs });
    await restoreSnapshot(snapshot.id, mode);
    const restored = await loadAccounts();
    expect(restored[0].label).toBe(a.label);
    expect(restored[0].updatedAt).toBeGreaterThan(tombs[a.id]);
    expect(mergeAccounts(restored, [newer], tombs)).toEqual(restored);
  });

  it('restores from a snapshot into an empty store', async () => {
    const a = account(1);
    await createVault([a]);
    await updateAccounts((list) => [...list, account(2)]);
    expect(await checkEmptyRecovery()).toEqual([]);

    await chrome.storage.local.remove('vault');
    const sources = await checkEmptyRecovery(async () => [{ kind: 'sync', count: 3 }]);
    const snapshot = sources.find((s) => s.kind === 'snapshot');
    expect(snapshot).toBeDefined();
    expect(sources.some((s) => s.kind === 'sync')).toBe(true);
    if (!snapshot || snapshot.kind !== 'snapshot') return;

    const result = await restoreSnapshot(snapshot.id, 'merge');
    expect(result.added).toBe(1);
    expect(ids(await loadAccounts())).toEqual(ids([a]));
    expect(await checkEmptyRecovery()).toEqual([]);
  });

  it('merges only accounts that are not already present', async () => {
    const a = account(1);
    const b = account(2);
    await createVault([a, b]);
    await updateAccounts((list) => list.filter((x) => x.id !== b.id));
    await updateAccounts((list) => [...list, account(3)]);
    const [latest] = await listSnapshots();
    const result = await restoreSnapshot(latest.id, 'merge');
    // 스냅샷 [a] 는 이미 있다. b 는 스냅샷에 없다.
    expect(result.added).toBe(0);

    const oldest = (await listSnapshots()).at(-1);
    expect(oldest).toBeDefined();
    const merged = await restoreSnapshot(oldest!.id, 'merge');
    expect(merged.added).toBe(1);
    expect(await loadAccounts()).toHaveLength(3);
  });
});

describe('trash', () => {
  it.each(['empty', 'purge'])('restores tombstones when %s fails to save the vault', async (operation) => {
    const now = Date.UTC(2026, 9, 13, 12, 0, 0);
    const a = account(1);
    await createVault([a]);
    await moveToTrash([a.id], now - (TRASH_DAYS + 1) * DAY);
    const previousTombs = { olderDeletion: now - DAY };
    await chrome.storage.local.set({ syncTomb: previousTombs });
    await _resetSnapshotsForTest();
    Object.defineProperty(globalThis, 'indexedDB', {
      value: { open: () => { throw new Error('idb down'); } },
      configurable: true,
      writable: true,
    });
    await expect(operation === 'empty' ? emptyTrash() : purgeExpiredTrash(now))
      .rejects.toBeInstanceOf(VaultWriteError);
    expect(ids(await listTrash())).toEqual([a.id]);
    expect((await chrome.storage.local.get('syncTomb')).syncTomb).toEqual(previousTombs);
  });

  it('moves, restores and purges after 30 days', async () => {
    const now = Date.UTC(2026, 9, 13, 12, 0, 0);
    const a = account(1);
    await createVault([a]);

    await moveToTrash([a.id], now);
    expect(await listTrash()).toHaveLength(1);
    await restoreFromTrash([a.id], now);
    expect(await listTrash()).toHaveLength(0);

    await moveToTrash([a.id], now);
    expect(await purgeExpiredTrash(now + (TRASH_DAYS - 1) * DAY)).toBe(0);
    expect(await loadAccounts()).toHaveLength(1);
    expect(await purgeExpiredTrash(now + (TRASH_DAYS + 1) * DAY)).toBe(1);
    expect(await loadAccounts()).toHaveLength(0);
  });

  it('does not write when nothing has expired', async () => {
    await createVault([account(1)]);
    const before = await chrome.storage.local.get('vault');
    expect(await purgeExpiredTrash()).toBe(0);
    expect(await chrome.storage.local.get('vault')).toEqual(before);
  });
});

describe('locked vault', () => {
  it('needs the session key', async () => {
    const a = account(1);
    const master = await putLockedVault([a]);
    await expect(loadAccounts()).rejects.toBeInstanceOf(LockedError);
    await setSessionKey(master);
    expect(ids(await loadAccounts())).toEqual(ids([a]));
    await clearSessionKey();
    await expect(loadAccounts()).rejects.toBeInstanceOf(LockedError);
  });

  it('builds and opens a raw copy', async () => {
    const a = account(1);
    await putLockedVault([a]);
    const text = await buildRawCopy();
    expect(isRawCopy(text)).toBe(true);
    expect(isRawCopy('{}')).toBe(false);
    expect(isRawCopy('not json')).toBe(false);

    const vault = (JSON.parse(text) as { local: { vault: VaultFile } }).local.vault;
    expect(vault.lock).toBe('password');
    expect(vault.wrappedKeys).toHaveLength(1);

    expect(ids(await openRawCopy(text, { password: 'fake-pass-5678' }))).toEqual(ids([a]));
    await expect(openRawCopy(text, { password: 'wrong-pass-0000' })).rejects.toBeInstanceOf(WrongSecretError);
    await expect(openRawCopy(text)).rejects.toBeInstanceOf(LockedError);
  });
});

describe('settings', () => {
  it('returns defaults, saves patches, ignores unknown keys', async () => {
    expect(await loadSettings()).toEqual(DEFAULT_SETTINGS);

    const seen: string[] = [];
    const off = onSettingsChanged((s) => seen.push(s.theme));
    const saved = await saveSettings({ theme: 'dark', bogus: 1 } as never);
    off();
    expect(saved.theme).toBe('dark');
    expect(seen).toEqual(['dark']);
    expect((await loadSettings()).theme).toBe('dark');
    const stored = (await chrome.storage.local.get('settings')).settings as Record<string, unknown>;
    expect('bogus' in stored).toBe(false);

    await chrome.storage.local.set({ settings: { theme: 'light', evil: true } });
    const loaded = await loadSettings();
    expect(loaded.theme).toBe('light');
    expect('evil' in loaded).toBe(false);
  });
});

describe('housekeeping', () => {
  it('does not throw without a vault or when locked', async () => {
    await expect(runHousekeeping()).resolves.toBeUndefined();
    await putLockedVault([account(1)]);
    await expect(runHousekeeping()).resolves.toBeUndefined();
  });

  it('purges expired trash when unlocked', async () => {
    const now = Date.UTC(2026, 9, 13, 12, 0, 0);
    const a = account(1);
    await createVault([a]);
    await moveToTrash([a.id], now - (TRASH_DAYS + 1) * DAY);
    await runHousekeeping(now);
    expect(await loadAccounts()).toHaveLength(0);
  });

  it('creates the alarm on startup', async () => {
    register();
    (chrome.runtime.onStartup as unknown as { dispatch: () => void }).dispatch();
    await vi.waitFor(async () => {
      expect(await chrome.alarms.get(HOUSEKEEPING_ALARM)).toBeDefined();
    });
  });
});

describe('audit fixes', () => {
  it('reverts when the re-read itself fails', async () => {
    const a = account(1);
    await createVault([a]);
    const local = chrome.storage.local;
    const original = local.get.bind(local) as unknown as (keys?: unknown) => Promise<Record<string, unknown>>;
    const originalSet = local.set.bind(local) as unknown as (items: Record<string, unknown>) => Promise<void>;
    let written = false;
    const setSpy = vi.spyOn(local, 'set').mockImplementation((async (items: Record<string, unknown>) => {
      written = true;
      return originalSet(items);
    }) as never);
    const getSpy = vi.spyOn(local, 'get').mockImplementation((async (keys?: unknown) => {
      if (written) {
        written = false;
        throw new Error('read failed');
      }
      return original(keys);
    }) as never);

    await expect(updateAccounts(() => [])).rejects.toBeInstanceOf(VaultWriteError);
    getSpy.mockRestore();
    setSpy.mockRestore();
    expect(ids(await loadAccounts())).toEqual(ids([a]));
  });

  it('reverts when the previous version cannot be snapshotted', async () => {
    const a = account(1);
    await createVault([a]);
    await _resetSnapshotsForTest();
    Object.defineProperty(globalThis, 'indexedDB', {
      value: { open: () => { throw new Error('idb down'); } },
      configurable: true,
      writable: true,
    });
    await expect(updateAccounts(() => [])).rejects.toBeInstanceOf(VaultWriteError);
    expect(ids(await loadAccounts())).toEqual(ids([a]));
  });

  it('replaces a corrupt current vault from a snapshot', async () => {
    const a = account(1);
    await createVault([a]);
    await updateAccounts((list) => [...list, account(2)]);
    const file = (await chrome.storage.local.get('vault')).vault as VaultFile;
    await chrome.storage.local.set({ vault: { ...file, checksum: 'broken' } });
    await expect(loadAccounts()).rejects.toThrow();

    const [latest] = await listSnapshots();
    expect((await restoreSnapshot(latest.id, 'replace')).added).toBe(1);
    expect(ids(await loadAccounts())).toEqual(ids([a]));
  });
});
