import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newAccount, type AccountDraft } from '../../src/core/account';
import { fromBase64, toBase64 } from '../../src/core/crypto/bytes';
import { newMasterKey, wrapWithPassword } from '../../src/core/crypto/keys';
import { encryptVault } from '../../src/core/crypto/vault';
import type { Account } from '../../src/core/types';
import { enableLock, lockNow } from '../../src/store/lock';
import { getSessionKey, setSessionKey } from '../../src/store/session';
import { saveSettings } from '../../src/store/settings';
import { _resetSnapshotsForTest } from '../../src/store/snapshots';
import { restoreSnapshot } from '../../src/store/recover';
import { loadSettings } from '../../src/store/settings';
import { listSnapshots } from '../../src/store/snapshots';
import { clearSyncArea, deleteSyncData, joinSync, mergeAccounts, syncNow, syncRecoverySources } from '../../src/store/sync';
import { mergeTombstones, readTombstones } from '../../src/store/tombstones';
import { emptyTrash, moveToTrash } from '../../src/store/trash';
import { addDrafts, createVault, loadAccounts, readVaultFile, replaceVaultFile, updateAccounts } from '../../src/store/vault';
import { createChromeMock } from './chrome-mock';

type Dev = ReturnType<typeof createChromeMock>;

const FAST = { iterations: 1, memoryKiB: 1024, parallelism: 1 };
const FAKE_SECRET = [0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x21, 0xde, 0xad, 0xbe, 0xef];
const PASS = 'fake-pass-1234';
const T0 = 1_700_000_000_000;
const MIN = 60_000;

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

const account = (n = 0, now = T0): Account => newAccount(draft(n), now);
const ids = (accounts: Account[]) => accounts.map((x) => x.id).sort();

let a: Dev;
let b: Dev;
let originalChrome: unknown;

// 기기 흉내: 전역 chrome 을 바꿔 끼우고 실행한다.
async function on<T>(dev: Dev, fn: () => Promise<T>): Promise<T> {
  (globalThis as unknown as { chrome: unknown }).chrome = dev;
  return fn();
}

function encoded(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

function chunksOf(area: Record<string, unknown>): [string, unknown[]][] {
  return Object.entries(area)
    .filter(([k]) => /^pa_acc_\d+$/.test(k))
    .map(([k, v]) => [k, v as unknown[]]);
}

function contains(hay: Uint8Array, needle: number[]): boolean {
  outer: for (let i = 0; i + needle.length <= hay.length; i++) {
    for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) continue outer;
    return true;
  }
  return false;
}

// 평문 동기화를 허락한 기기 하나를 만든다.
async function plainDevice(dev: Dev, drafts: AccountDraft[]): Promise<void> {
  await on(dev, async () => {
    await createVault([]);
    await addDrafts(drafts, undefined, T0);
    await saveSettings({ syncPlaintextAllowed: true });
  });
}

// 첫 빈 영역 보류를 넘기려 2분 뒤에 한 번 더 부른다.
async function pushFrom(dev: Dev, at = T0): Promise<void> {
  await on(dev, async () => {
    expect(await syncNow(at)).toBe('held');
    expect(await syncNow(at + 3 * MIN)).toBe('ok');
  });
}

beforeEach(async () => {
  originalChrome = (globalThis as unknown as { chrome: unknown }).chrome;
  a = createChromeMock();
  b = createChromeMock();
  b.storage.sync = a.storage.sync;
  await _resetSnapshotsForTest();
  Object.defineProperty(globalThis, 'indexedDB', {
    value: new IDBFactory(),
    configurable: true,
    writable: true,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  (globalThis as unknown as { chrome: unknown }).chrome = originalChrome;
});

describe('sync conditions', () => {
  it('does not touch the sync area while the vault is unlocked-by-default (lock none)', async () => {
    await on(a, async () => {
      await createVault([]);
      await addDrafts([draft(1), draft(2)], undefined, T0);
      expect(await syncNow(T0)).toBe('off');
      expect(await syncNow(T0 + 3 * MIN)).toBe('off');
    });
    expect(await a.storage.sync.get(null)).toEqual({});
  });

  it('holds the first push on an empty sync area, then pushes after 2 minutes', async () => {
    await plainDevice(a, [draft(1)]);
    await on(a, async () => {
      expect(await syncNow(T0)).toBe('held');
      expect(await a.storage.sync.get(null)).toEqual({});
      expect(await syncNow(T0 + 2 * MIN + 1)).toBe('ok');
    });
    expect(Object.keys(await a.storage.sync.get(null))).toContain('pa_meta');
  });

  it('does not call sync.set when nothing changed', async () => {
    await plainDevice(a, [draft(1), draft(2)]);
    await pushFrom(a);
    await on(a, async () => {
      const spy = vi.spyOn(a.storage.sync, 'set');
      expect(await syncNow(T0 + 4 * MIN)).toBe('ok');
      expect(await syncNow(T0 + 5 * MIN)).toBe('ok');
      expect(spy).not.toHaveBeenCalled();
    });
  });
});

describe('two devices', () => {
  it('joins automatically when plaintext sync is allowed and merges both ways', async () => {
    await plainDevice(a, [draft(1), draft(2)]);
    await plainDevice(b, [draft(3)]);
    await pushFrom(a);

    await on(b, async () => {
      expect(await syncNow(T0 + 4 * MIN)).toBe('ok');
      expect(await loadAccounts()).toHaveLength(3);
    });
    await on(a, async () => {
      expect(await syncNow(T0 + 5 * MIN)).toBe('ok');
      expect(await loadAccounts()).toHaveLength(3);
    });
  });

  it('propagates trash and emptied trash', async () => {
    await plainDevice(a, [draft(1), draft(2)]);
    await plainDevice(b, [draft(3)]);
    await pushFrom(a);
    await on(b, () => syncNow(T0 + 4 * MIN));
    await on(a, () => syncNow(T0 + 5 * MIN));

    const target = await on(a, async () => {
      const list = await loadAccounts();
      const found = list.find((x) => x.label === 'user1@example.com');
      if (!found) throw new Error('missing account');
      await moveToTrash([found.id], T0 + 6 * MIN);
      await syncNow(T0 + 6 * MIN);
      return found.id;
    });
    await on(b, async () => {
      await syncNow(T0 + 7 * MIN);
      const got = (await loadAccounts()).find((x) => x.id === target);
      expect(got?.deletedAt).toBe(T0 + 6 * MIN);
    });
    await on(a, async () => {
      await emptyTrash();
      await syncNow(T0 + 8 * MIN);
    });
    await on(b, async () => {
      await syncNow(T0 + 9 * MIN);
      expect((await loadAccounts()).some((x) => x.id === target)).toBe(false);
      expect(await loadAccounts()).toHaveLength(2);
    });
  });

  it('encrypts records and needs a join with a locked vault', async () => {
    const accounts = [account(1), account(2)];
    await on(a, async () => {
      const master = newMasterKey();
      const wrapped = await wrapWithPassword(master, PASS, FAST);
      const file = await encryptVault(accounts, master, 'password', [wrapped]);
      file.lockChangedAt = 1;
      await replaceVaultFile(async () => file);
      await setSessionKey(master);
    });
    await pushFrom(a);

    const area = await a.storage.sync.get(null);
    const meta = area.pa_meta as { wrappedKeys: { kind: string }[]; lock: string };
    expect(meta.lock).toBe('password');
    expect(meta.wrappedKeys.some((k) => k.kind === 'none')).toBe(false);
    expect(meta.wrappedKeys.some((k) => k.kind === 'password')).toBe(true);
    const records = chunksOf(area).flatMap(([, list]) => list as { d: string }[]);
    expect(records).toHaveLength(2);
    for (const r of records) expect(contains(fromBase64(r.d), FAKE_SECRET.slice(0, 9))).toBe(false);
    expect(JSON.stringify(area)).not.toContain(toBase64(accounts[0].secret));

    await on(b, async () => {
      await createVault([]);
      await saveSettings({ syncPlaintextAllowed: true });
      expect(await syncNow(T0 + 4 * MIN)).toBe('needs-join');
      expect(await joinSync({ password: PASS })).toBe('ok');
      expect(ids(await loadAccounts())).toEqual(ids(accounts));
    });
  });
});

describe('enabling the lock after plaintext sync', () => {
  it('overwrites the plaintext sync copy and other devices join with the password', async () => {
    await plainDevice(a, [draft(1), draft(2)]);
    await plainDevice(b, [draft(3)]);
    await pushFrom(a);
    await on(b, () => syncNow(T0 + 4 * MIN));
    await on(a, () => syncNow(T0 + 5 * MIN));

    await on(a, async () => {
      await enableLock(PASS, FAST);
      expect(await syncNow(T0 + 6 * MIN)).toBe('ok');
      expect(await loadAccounts()).toHaveLength(3);
      expect((await readVaultFile())!.lock).toBe('password');
    });
    const meta = (await a.storage.sync.get('pa_meta')).pa_meta as { lock: string; wrappedKeys: { kind: string }[] };
    expect(meta.lock).toBe('password');
    expect(meta.wrappedKeys.some((k) => k.kind === 'none')).toBe(false);

    await on(b, async () => {
      expect(await syncNow(T0 + 7 * MIN)).toBe('needs-join');
      expect(await joinSync({ password: PASS })).toBe('ok');
      expect(await loadAccounts()).toHaveLength(3);
      expect((await readVaultFile())!.lock).toBe('password');
    });
  });
});

describe('chunks', () => {
  it('keeps every chunk within 7000 bytes and loses no record', async () => {
    await plainDevice(
      a,
      Array.from({ length: 60 }, (_, i) => draft(i)),
    );
    await pushFrom(a);
    const area = await a.storage.sync.get(null);
    const chunks = chunksOf(area);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.length).toBeLessThanOrEqual(12);
    for (const [, list] of chunks) expect(encoded(list)).toBeLessThanOrEqual(7000);
    expect(chunks.reduce((n, [, list]) => n + list.length, 0)).toBe(60);
    expect((area.pa_meta as { chunks: number }).chunks).toBe(chunks.length);
  });

  it('reports overflow and writes nothing when 12 chunks are not enough', async () => {
    await plainDevice(
      a,
      Array.from({ length: 60 }, (_, i) => draft(i)),
    );
    await on(a, async () => {
      await updateAccounts((list) => list.map((x) => ({ ...x, note: 'x'.repeat(2000) })));
      expect(await syncNow(T0)).toBe('held');
      expect(await syncNow(T0 + 3 * MIN)).toBe('overflow');
    });
    expect(await a.storage.sync.get(null)).toEqual({});
    expect((await a.storage.local.get('syncOverflow')).syncOverflow).toBe(true);
  });
});

describe('recovery and clearing', () => {
  it('lists sync records as a recovery source and clears only pa_ keys', async () => {
    await plainDevice(a, [draft(1), draft(2)]);
    await pushFrom(a);
    await a.storage.sync.set({ other: 1 });
    await on(a, async () => {
      expect(await syncRecoverySources()).toEqual([{ kind: 'sync', count: 2 }]);
      await clearSyncArea();
      expect(await syncRecoverySources()).toEqual([]);
    });
    expect(await a.storage.sync.get(null)).toEqual({ other: 1 });
  });
});

describe('mergeAccounts', () => {
  it('takes the newer updatedAt and keeps local on ties', () => {
    const base = account(1);
    const newer = { ...base, label: 'remote', updatedAt: base.updatedAt + 5 };
    expect(mergeAccounts([base], [newer], {})[0].label).toBe('remote');
    const tie = { ...base, label: 'remote' };
    expect(mergeAccounts([base], [tie], {})[0].label).toBe(base.label);
    const olderRemote = { ...base, label: 'remote', updatedAt: base.updatedAt - 5 };
    expect(mergeAccounts([base], [olderRemote], {})[0].label).toBe(base.label);
  });

  it('unions both sides, local order first', () => {
    const l1 = account(1);
    const l2 = account(2);
    const r3 = account(3);
    const r4 = account(4);
    expect(mergeAccounts([l1, l2], [r4, r3, l1], {}).map((x) => x.id)).toEqual([l1.id, l2.id, r4.id, r3.id]);
  });

  it('removes tombstoned accounts unless they were updated after the tombstone', () => {
    const x = account(1);
    const y = { ...account(2), updatedAt: T0 + 100 };
    const tombs = { [x.id]: x.updatedAt, [y.id]: T0 + 50 };
    expect(mergeAccounts([x], [y], tombs).map((v) => v.id)).toEqual([y.id]);
  });

  it('keeps the older createdAt for the same secret under different ids', () => {
    const older = { ...account(1), id: 'bbb', createdAt: T0 };
    const newer = { ...account(1), id: 'aaa', createdAt: T0 + 10 };
    expect(mergeAccounts([newer], [older], {}).map((v) => v.id)).toEqual(['bbb']);
    expect(mergeAccounts([older], [newer], {}).map((v) => v.id)).toEqual(['bbb']);
    const tieA = { ...account(1), id: 'aaa', createdAt: T0 };
    const tieB = { ...account(1), id: 'bbb', createdAt: T0 };
    expect(mergeAccounts([tieB], [tieA], {}).map((v) => v.id)).toEqual(['aaa']);
  });

  it('does not treat trashed copies as duplicates', () => {
    const live = { ...account(1), id: 'a1' };
    const trashed = { ...account(1), id: 'a2', deletedAt: T0 + 1, updatedAt: T0 + 1 };
    expect(mergeAccounts([live], [trashed], {})).toHaveLength(2);
  });
});

describe('hotp counter merge', () => {
  it('never rolls the counter back, whichever side wins the other fields', () => {
    const base = { ...account(1), type: 'hotp' as const, counter: 10 };
    const renamedLocal = { ...base, label: 'renamed', updatedAt: base.updatedAt + 5 };
    const aheadRemote = { ...base, counter: 15 };
    const merged = mergeAccounts([renamedLocal], [aheadRemote], {})[0];
    expect(merged.label).toBe('renamed');
    expect(merged.counter).toBe(15);
    const renamedRemote = { ...base, label: 'remote', counter: 10, updatedAt: base.updatedAt + 5 };
    const aheadLocal = { ...base, counter: 15 };
    const other = mergeAccounts([aheadLocal], [renamedRemote], {})[0];
    expect(other.label).toBe('remote');
    expect(other.counter).toBe(15);
  });

  it('keeps the larger counter on both devices after a sync', async () => {
    const acct = { ...account(1), type: 'hotp' as const, counter: 15 };
    await on(b, async () => {
      await createVault([]);
      await saveSettings({ syncPlaintextAllowed: true });
      await updateAccounts(() => [acct]);
    });
    await pushFrom(b);
    await on(a, async () => {
      await createVault([]);
      await saveSettings({ syncPlaintextAllowed: true });
      await updateAccounts(() => [{ ...acct, counter: 10, label: 'renamed', updatedAt: T0 + 1000 }]);
      expect(await syncNow(T0 + 4 * MIN)).toBe('ok');
      const got = (await loadAccounts())[0];
      expect([got.label, got.counter]).toEqual(['renamed', 15]);
    });
    await on(b, async () => {
      expect(await syncNow(T0 + 5 * MIN)).toBe('ok');
      const got = (await loadAccounts())[0];
      expect([got.label, got.counter]).toEqual(['renamed', 15]);
    });
  });
});

describe('chunk generations', () => {
  it('holds when a chunk from an older generation is mixed with a newer meta', async () => {
    await plainDevice(a, Array.from({ length: 60 }, (_, i) => draft(i)));
    await pushFrom(a);
    const oldChunk0 = (await a.storage.sync.get('pa_acc_0')).pa_acc_0;
    await on(a, () => clearSyncArea());
    await plainDevice(b, [draft(200), draft(201)]);
    await pushFrom(b, T0 + 10 * MIN);
    expect((await a.storage.sync.get('pa_meta')).pa_meta).toMatchObject({ chunks: 1 });
    await a.storage.sync.set({ pa_acc_0: oldChunk0 });
    const before = await a.storage.sync.get(null);
    await on(b, async () => {
      const spy = vi.spyOn(b.storage.sync, 'set');
      expect(await syncNow(T0 + 20 * MIN)).toBe('held');
      expect(spy).not.toHaveBeenCalled();
      expect(await loadAccounts()).toHaveLength(2);
    });
    expect(await a.storage.sync.get(null)).toEqual(before);
  });

  it('reads the legacy format (no generation) and switches on the next upload', async () => {
    await plainDevice(a, [draft(1), draft(2)]);
    await pushFrom(a);
    const area = await a.storage.sync.get(null);
    delete (area.pa_meta as { gen?: string }).gen;
    for (const [, list] of chunksOf(area)) for (const r of list as { g?: string }[]) delete r.g;
    await a.storage.sync.set(area);
    await plainDevice(b, [draft(3)]);
    await on(b, async () => {
      expect(await syncNow(T0 + 4 * MIN)).toBe('ok');
      expect(await loadAccounts()).toHaveLength(3);
    });
    const next = await a.storage.sync.get(null);
    const gen = (next.pa_meta as { gen?: string }).gen;
    expect(typeof gen).toBe('string');
    const records = chunksOf(next).flatMap(([, list]) => list as { g?: string }[]);
    expect(records).toHaveLength(3);
    for (const r of records) expect(r.g).toBe(gen);
  });
});

describe('deleting sync data', () => {
  it('turns sync off for this device so nothing is re-uploaded', async () => {
    await plainDevice(a, [draft(1), draft(2)]);
    await pushFrom(a);
    await on(a, async () => {
      await deleteSyncData();
      expect((await loadSettings()).syncEnabled).toBe(false);
      expect(await a.storage.sync.get(null)).toEqual({});
      expect(await syncNow(T0 + 10 * MIN)).toBe('off');
      expect(await syncNow(T0 + 20 * MIN)).toBe('off');
      expect(await loadAccounts()).toHaveLength(2);
    });
    expect(await a.storage.sync.get(null)).toEqual({});
  });
});

describe('snapshot restore', () => {
  it('records tombstones for accounts removed by replace so sync does not bring them back', async () => {
    await plainDevice(a, [draft(1)]);
    await on(a, async () => {
      await addDrafts([draft(2)], undefined, T0);
    });
    await pushFrom(a);
    await on(a, async () => {
      const snap = (await listSnapshots()).find((s) => s.count === 1);
      if (!snap) throw new Error('missing snapshot');
      const removed = (await loadAccounts()).find((x) => x.label === 'user2@example.com');
      if (!removed) throw new Error('missing account');
      await restoreSnapshot(snap.id, 'replace');
      expect(await loadAccounts()).toHaveLength(1);
      expect((await readTombstones())[removed.id]).toBeGreaterThan(0);
      expect(await syncNow(T0 + 6 * MIN)).toBe('ok');
      const list = await loadAccounts();
      expect(list).toHaveLength(1);
      expect(list.some((x) => x.id === removed.id)).toBe(false);
    });
  });
});

describe('mergeTombstones', () => {
  it('takes the larger value and keeps the newest 500', () => {
    expect(mergeTombstones({ x: 1, y: 9 }, { x: 5 })).toEqual({ x: 5, y: 9 });
    const many: Record<string, number> = {};
    for (let i = 0; i < 600; i++) many[`id${i}`] = i;
    const out = mergeTombstones(many, {});
    expect(Object.keys(out)).toHaveLength(500);
    expect(out.id599).toBe(599);
    expect(out.id99).toBeUndefined();
  });
});

describe('audit fixes', () => {
  it('keeps a lock requested while a sync join saves its session key', async () => {
    await plainDevice(a, [draft(1)]);
    await on(a, () => enableLock(PASS, FAST));
    await pushFrom(a);
    await plainDevice(b, [draft(2)]);
    await on(b, async () => {
      let lock: Promise<void> | undefined;
      const original = b.storage.session.set.bind(b.storage.session);
      vi.spyOn(b.storage.session, 'set').mockImplementation(async (values) => {
        if ('vaultKey' in values) {
          lock = lockNow();
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
        await original(values);
      });
      expect(await joinSync({ password: PASS })).toBe('ok');
      await lock;
      expect(await getSessionKey()).toBeNull();
    });
  });

  it('does not upload when sync is disabled while preparing the first push', async () => {
    await plainDevice(a, [draft(1)]);
    await on(a, async () => {
      expect(await syncNow(T0)).toBe('held');
      const encrypt = globalThis.crypto.subtle.encrypt.bind(globalThis.crypto.subtle);
      vi.spyOn(globalThis.crypto.subtle, 'encrypt').mockImplementationOnce(async (...args) => {
        await saveSettings({ syncEnabled: false });
        return encrypt(...args);
      });
      expect(await syncNow(T0 + 3 * MIN)).toBe('off');
      expect(await a.storage.sync.get(null)).toEqual({});
    });
  });

  it.each(['record', 'chunks', 'meta'])('holds malformed %s without overwriting remote data', async (part) => {
    await plainDevice(a, [draft(1)]);
    await pushFrom(a);
    const area = await a.storage.sync.get(null);
    if (part === 'record') (area.pa_acc_0 as unknown[]).push({ id: 'broken' });
    else if (part === 'chunks') (area.pa_meta as { chunks: number }).chunks = -1;
    else area.pa_meta = { v: 1 };
    await a.storage.sync.set(area);
    const before = await a.storage.sync.get(null);
    await on(a, async () => {
      const spy = vi.spyOn(a.storage.sync, 'set');
      expect(await syncNow(T0 + 4 * MIN)).toBe('held');
      expect(spy).not.toHaveBeenCalled();
      expect(await loadAccounts()).toHaveLength(1);
    });
    expect(await a.storage.sync.get(null)).toEqual(before);
  });

  it('joinSync does nothing when the result would be plaintext sync without permission', async () => {
    await plainDevice(a, [draft(1)]);
    await pushFrom(a);
    const before = await a.storage.sync.get(null);
    await on(b, async () => {
      await createVault([]);
      await addDrafts([draft(2)], undefined, T0);
      expect(await joinSync({})).toBe('off');
      expect(await loadAccounts()).toHaveLength(1);
    });
    expect(await a.storage.sync.get(null)).toEqual(before);
  });

  it('holds instead of overwriting when a chunk has not arrived', async () => {
    await plainDevice(a, Array.from({ length: 60 }, (_, i) => draft(i)));
    await pushFrom(a);
    await a.storage.sync.remove('pa_acc_1');
    const before = await a.storage.sync.get(null);
    await plainDevice(b, [draft(100)]);
    await on(b, async () => {
      expect(await syncNow(T0 + 4 * MIN)).toBe('held');
      expect(await loadAccounts()).toHaveLength(1);
    });
    await on(a, async () => {
      expect(await syncNow(T0 + 5 * MIN)).toBe('held');
    });
    expect(await a.storage.sync.get(null)).toEqual(before);
  });

  it('holds an empty area again after it had content, even with no local accounts', async () => {
    await plainDevice(a, []);
    await on(a, async () => {
      await a.storage.local.set({ syncObserved: true });
      expect(await syncNow(T0)).toBe('held');
    });
    expect(await a.storage.sync.get(null)).toEqual({});
  });

  it('keeps the synced tombstone item under the per-item limit', async () => {
    await plainDevice(a, [draft(1)]);
    await on(a, async () => {
      const many: Record<string, number> = {};
      for (let i = 0; i < 500; i++) many[`00000000-0000-4000-8000-${String(i).padStart(12, '0')}`] = T0 + i;
      await a.storage.local.set({ syncTomb: many });
    });
    await pushFrom(a);
    const tomb = (await a.storage.sync.get('pa_tomb')).pa_tomb as Record<string, number>;
    expect(encoded(tomb)).toBeLessThanOrEqual(7000);
    expect(tomb['00000000-0000-4000-8000-000000000499']).toBe(T0 + 499);
  });
});
