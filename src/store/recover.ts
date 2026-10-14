// 금고가 비었거나 못 읽을 때의 복구: 스냅샷, 원시 사본.
import { duplicateKey } from '../core/account';
import { CorruptVaultError } from '../core/crypto/errors';
import { decryptVault, encryptVault } from '../core/crypto/vault';
import type { Account, VaultFile } from '../core/types';
import { getSnapshot, listSnapshots } from './snapshots';
import { readTombstones, type Tombstones } from './tombstones';
import {
  commitVaultFile,
  getVaultKey,
  keyFromFile,
  readVaultFile,
  updateAccounts,
  withVaultWriteLock,
  type Credentials,
} from './vault';

export type RecoverySource =
  | { kind: 'snapshot'; id: number; takenAt: number; count: number }
  | { kind: 'sync'; count: number };

const RAW_FORMAT = 'popout-authenticator-raw';

// 지금 금고에 계정이 있으면 [] . 아무것도 지우지 않는다.
export async function checkEmptyRecovery(
  extra?: () => Promise<RecoverySource[]>,
): Promise<RecoverySource[]> {
  const file = await readVaultFile();
  if (file && file.count > 0) return [];
  const snapshots: RecoverySource[] = (await listSnapshots())
    .filter((s) => s.count > 0)
    .map((s) => ({ kind: 'snapshot' as const, id: s.id, takenAt: s.takenAt, count: s.count }));
  const more = extra ? await extra() : [];
  return [...snapshots, ...more];
}

async function snapshotFile(id: number): Promise<VaultFile> {
  const file = await getSnapshot(id);
  if (!file) throw new Error('snapshot not found');
  return file;
}

async function openFile(file: VaultFile, creds?: Credentials): Promise<{ accounts: Account[]; key: Uint8Array }> {
  // 지금 금고 키로 먼저 본다. 키가 다르면 스냅샷 자체의 감싼 키로.
  try {
    const key = await getVaultKey();
    return { accounts: await decryptVault(file, key), key };
  } catch {
    // 아래에서 다시 시도한다.
  }
  const key = await keyFromFile(file, creds);
  return { accounts: await decryptVault(file, key), key };
}

export async function openSnapshot(id: number, creds?: Credentials): Promise<Account[]> {
  return (await openFile(await snapshotFile(id), creds)).accounts;
}

// 복원은 새 변경이다. 이전 삭제 표시나 현재판이 다음 동기화에서 복원을 다시 덮지 않게 한다.
function restoredAccounts(old: Account[], current: Account[], tombs: Tombstones): Account[] {
  const now = Date.now();
  const updated = new Map(current.map((a) => [a.id, a.updatedAt]));
  return old.map((a) => ({
    ...a,
    updatedAt: Math.max(now, a.updatedAt + 1, (updated.get(a.id) ?? 0) + 1, (tombs[a.id] ?? 0) + 1),
  }));
}

export async function restoreSnapshot(
  id: number,
  mode: 'merge' | 'replace',
  creds?: Credentials,
): Promise<{ added: number }> {
  const snap = await snapshotFile(id);
  // 금고가 없으면(빈 화면 복구) 스냅샷 파일을 메타 그대로 되살린다.
  // 스냅샷은 잠금 안에서 다시 읽는다(기다리는 사이 초기화로 지워졌으면 되살리지 않는다).
  const restored = await withVaultWriteLock(async () => {
    if (await readVaultFile()) return null;
    const fresh = await snapshotFile(id);
    await commitVaultFile(fresh);
    return fresh.count;
  });
  if (restored !== null) return { added: restored };

  const opened = await openFile(snap, creds);
  const old = opened.accounts;
  let added = 0;
  if (mode === 'replace') {
    // 지금 금고가 깨져 못 열어도 통째 되돌리기는 되게, 못 열면 스냅샷 파일을 메타 그대로 쓴다.
    try {
      await updateAccounts(async (current) => restoredAccounts(old, current, await readTombstones()));
    } catch (error) {
      if (!(error instanceof CorruptVaultError)) throw error;
      await withVaultWriteLock(async () => {
        const fresh = await encryptVault(
          restoredAccounts(old, [], await readTombstones()), opened.key, snap.lock, snap.wrappedKeys,
        );
        if (snap.lockChangedAt !== undefined) fresh.lockChangedAt = snap.lockChangedAt;
        await commitVaultFile(fresh);
      });
    }
    return { added: old.length };
  }
  await updateAccounts(async (accounts) => {
    const ids = new Set(accounts.map((a) => a.id));
    const keys = new Set(accounts.filter((a) => a.deletedAt === undefined).map((a) => duplicateKey(a)));
    const extra: Account[] = [];
    for (const a of old) {
      if (a.deletedAt !== undefined || ids.has(a.id)) continue;
      const key = duplicateKey(a);
      if (keys.has(key)) continue;
      keys.add(key);
      extra.push(a);
    }
    added = extra.length;
    return [...accounts, ...restoredAccounts(extra, accounts, await readTombstones())];
  });
  return { added };
}

export async function buildRawCopy(): Promise<string> {
  const got = await chrome.storage.local.get(['vault', 'settings']);
  return JSON.stringify(
    {
      format: RAW_FORMAT,
      version: 1,
      createdAt: Date.now(),
      local: { vault: got.vault, settings: got.settings },
    },
    null,
    2,
  );
}

function parseRaw(text: string): { local?: { vault?: unknown } } | null {
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed === 'object' && parsed !== null && (parsed as { format?: unknown }).format === RAW_FORMAT) {
      return parsed as { local?: { vault?: unknown } };
    }
  } catch {
    // JSON 이 아님
  }
  return null;
}

export function isRawCopy(text: string): boolean {
  return parseRaw(text) !== null;
}

export async function openRawCopy(text: string, creds?: Credentials): Promise<Account[]> {
  const raw = parseRaw(text);
  const vault = raw?.local?.vault;
  if (!raw || typeof vault !== 'object' || vault === null) {
    throw new CorruptVaultError('not a raw copy with a vault');
  }
  const file = vault as VaultFile;
  return decryptVault(file, await keyFromFile(file, creds));
}
