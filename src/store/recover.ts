// 금고가 비었거나 못 읽을 때의 복구: 스냅샷, 원시 사본.
import { duplicateKey } from '../core/account';
import { CorruptVaultError } from '../core/crypto/errors';
import { decryptVault, encryptVault } from '../core/crypto/vault';
import type { Account, VaultFile } from '../core/types';
import { clearSessionKey, getLockEpoch, setSessionKey, withSessionLock } from './session';
import { getSnapshot, listSnapshots } from './snapshots';
import { readTombstones, recordTombstones, type Tombstones } from './tombstones';
import {
  commitVaultFile,
  getVaultKey,
  loadAccounts,
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
  const startEpoch = await getLockEpoch();
  const snap = await snapshotFile(id);
  // 금고가 없으면(빈 화면 복구) 스냅샷 파일을 메타 그대로 되살린다.
  // 스냅샷은 잠금 안에서 다시 읽는다(기다리는 사이 초기화로 지워졌으면 되살리지 않는다).
  const restored = await withVaultWriteLock(async () => {
    if (await readVaultFile()) return null;
    const fresh = await snapshotFile(id);
    await commitVaultFile(fresh);
    // 비밀번호를 모르면(creds 없음) 지금 세션 키가 이 파일을 여는지 본다. 안 열리면 키 없이 맞춰 다시 풀게 한다.
    let key: Uint8Array | null = null;
    try {
      key = await keyFromFile(fresh, creds);
    } catch {
      try {
        const session = await getVaultKey(fresh);
        await decryptVault(fresh, session);
        key = session;
      } catch {
        // 아래에서 키 없이 맞춘다.
      }
    }
    await alignWithRestoredFile(fresh, key, startEpoch);
    return fresh.count;
  });
  if (restored !== null) return { added: restored };

  const opened = await openFile(snap, creds);
  const old = opened.accounts;
  let added = 0;
  if (mode === 'replace') {
    // 지금 금고가 깨져 못 열어도 통째 되돌리기는 되게, 못 열면 스냅샷 파일을 메타 그대로 쓴다.
    try {
      let removed: string[] = [];
      await updateAccounts(async (current) => {
        const next = restoredAccounts(old, current, await readTombstones());
        const kept = new Set(next.map((a) => a.id));
        removed = current.filter((a) => !kept.has(a.id)).map((a) => a.id);
        return next;
      });
      // 스냅샷에 없어 지워진 계정은 삭제 표시를 남겨, 다음 동기화가 되살리지 않게 한다(쓰기가 끝난 뒤에만).
      await recordTombstones(removed);
    } catch (error) {
      if (!(error instanceof CorruptVaultError)) throw error;
      await withVaultWriteLock(async () => {
        const fresh = await encryptVault(
          restoredAccounts(old, [], await readTombstones()), opened.key, snap.lock, snap.wrappedKeys,
        );
        if (snap.lockChangedAt !== undefined) fresh.lockChangedAt = snap.lockChangedAt;
        await commitVaultFile(fresh);
        await alignWithRestoredFile(fresh, opened.key, startEpoch);
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

function rawVaultFile(text: string): VaultFile {
  const vault = parseRaw(text)?.local?.vault;
  if (typeof vault !== 'object' || vault === null) {
    throw new CorruptVaultError('not a raw copy with a vault');
  }
  return vault as VaultFile;
}

export async function openRawCopy(text: string, creds?: Credentials): Promise<Account[]> {
  const file = rawVaultFile(text);
  return decryptVault(file, await keyFromFile(file, creds));
}

// 지금 금고가 손상돼 못 열 때: 현재 금고를 풀지 않고 원시 사본의 금고로 통째 바꾼다.
// 손상된 이전 판은 commitVaultFile 이 스냅샷에 남긴다. 돌려주는 값은 되살린 계정 수.
export async function replaceWithRawCopy(text: string, creds?: Credentials): Promise<number> {
  const startEpoch = await getLockEpoch();
  const file = rawVaultFile(text);
  const key = await keyFromFile(file, creds);
  const accounts = await decryptVault(file, key);
  await withVaultWriteLock(async () => {
    // 사본을 푸는 사이 다른 창이 이미 복구했으면 그 금고를 덮지 않는다.
    if (!(await currentVaultCorrupt())) throw new Error('vault no longer damaged');
    await commitVaultFile(file);
    await alignWithRestoredFile(file, key, startEpoch);
  });
  return accounts.filter((a) => a.deletedAt === undefined).length;
}

// 되살린 금고 파일의 잠금으로 바뀌었으니 풀린 상태를 맞춘다. 반드시 쓰기 잠금 안에서, commit 뒤에 부른다.
// key 가 null 이면 키를 알 수 없으니 옛 세션 키를 지워 다시 풀게 한다.
// startEpoch: 복구를 시작할 때의 잠금 횟수. 그 뒤 lockNow 가 있었으면 키를 다시 저장하지 않는다.
async function alignWithRestoredFile(
  file: VaultFile,
  key: Uint8Array | null,
  startEpoch: number,
): Promise<void> {
  await withSessionLock(async () => {
    // 잠금 없는 파일이면 옛 세션 키를 지운다.
    if (file.lock === 'none' || !key) await clearSessionKey();
    else if ((await getLockEpoch()) !== startEpoch) return;
    else await setSessionKey(key);
  });
  // 파일에 패스키 수단이 없으면 코드 보호를 끈다. 켜 두면 넣기가 늘 실패하고 끌 수도 없다.
  if (file.lock === 'none' || !file.wrappedKeys.some((k) => k.kind === 'prf')) {
    await chrome.storage.local.set({ codeProtection: false });
    await chrome.storage.session.remove('codeAccessRequests');
  }
}

// 금고가 있는데 내용이 손상돼 열리지 않을 때만 true. 잠김 등 판단할 수 없으면 false.
async function currentVaultCorrupt(): Promise<boolean> {
  if (!(await readVaultFile())) return false;
  try {
    await loadAccounts();
    return false;
  } catch (error) {
    return error instanceof CorruptVaultError;
  }
}
