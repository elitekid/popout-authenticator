// 휴지통: deletedAt 이 있는 계정. 30일이 지나면 실제로 지운다.
import { duplicateKey } from '../core/account';
import { decryptVault, encryptVault } from '../core/crypto/vault';
import type { Account } from '../core/types';
import { NoVaultError } from './errors';
import { mergeTombstones, readTombstones, saveTombstones } from './tombstones';
import { commitVaultFile, getVaultKey, loadAccounts, readVaultFile, updateAccounts, withVaultWriteLock } from './vault';

export const TRASH_DAYS = 30;
const DAY_MS = 86_400_000;

export async function moveToTrash(ids: string[], now: number = Date.now()): Promise<Account[]> {
  const set = new Set(ids);
  return updateAccounts((accounts) =>
    accounts.map((a) => (set.has(a.id) && a.deletedAt === undefined ? { ...a, deletedAt: now, updatedAt: now } : a)),
  );
}

// 같은 종류·비밀키의 활성 계정이 이미 있어 되살릴 수 없을 때.
export class RestoreDuplicateError extends Error {
  constructor() {
    super('duplicate account');
    this.name = 'RestoreDuplicateError';
  }
}

export async function restoreFromTrash(ids: string[], now: number = Date.now()): Promise<Account[]> {
  const set = new Set(ids);
  return updateAccounts((accounts) => {
    // 쓰기 잠금 안에서 확인한다. 충돌이 있으면 아무것도 저장하지 않고 던진다.
    const seen = new Set<string>();
    for (const a of accounts) if (a.deletedAt === undefined) seen.add(duplicateKey(a));
    return accounts.map((a) => {
      if (!set.has(a.id) || a.deletedAt === undefined) return a;
      const key = duplicateKey(a);
      if (seen.has(key)) throw new RestoreDuplicateError();
      seen.add(key);
      const { deletedAt: _deletedAt, ...rest } = a;
      return { ...rest, updatedAt: now };
    });
  });
}

export async function emptyTrash(ids?: string[]): Promise<Account[]> {
  const set = ids ? new Set(ids) : null;
  const result = await permanentlyRemove(
    (a) => a.deletedAt !== undefined && (!set || set.has(a.id)),
    Date.now(),
  );
  return result.accounts;
}

// 삭제 표시와 금고 저장을 같은 쓰기 잠금 안에서 처리한다. 금고가 되돌아오면 삭제 표시도 되돌려
// 실패한 삭제가 다음 동기화에서 실행되지 않게 한다.
function permanentlyRemove(
  isGone: (account: Account) => boolean,
  now: number,
): Promise<{ accounts: Account[]; removed: number }> {
  return withVaultWriteLock(async () => {
    const file = await readVaultFile();
    if (!file) throw new NoVaultError();
    const key = await getVaultKey(file);
    const accounts = await decryptVault(file, key);
    const gone = accounts.filter(isGone);
    if (gone.length === 0) return { accounts, removed: 0 };
    const kept = accounts.filter((a) => !isGone(a));
    const encrypted = await encryptVault(kept, key, file.lock, file.wrappedKeys);
    if (file.lockChangedAt !== undefined) encrypted.lockChangedAt = file.lockChangedAt;
    const previousTombs = await readTombstones();
    const at = gone.reduce((latest, a) => Math.max(latest, a.updatedAt), now);
    const addedTombs = Object.fromEntries(gone.map((a) => [a.id, at]));
    try {
      await saveTombstones(mergeTombstones(previousTombs, addedTombs));
      await commitVaultFile(encrypted);
    } catch (error) {
      await saveTombstones(previousTombs);
      throw error;
    }
    return { accounts: kept, removed: gone.length };
  });
}

function expired(a: Account, now: number): boolean {
  return a.deletedAt !== undefined && a.deletedAt <= now - TRASH_DAYS * DAY_MS;
}

export async function purgeExpiredTrash(now: number = Date.now()): Promise<number> {
  const result = await permanentlyRemove((a) => expired(a, now), Math.max(now, Date.now()));
  return result.removed;
}

export async function listTrash(): Promise<Account[]> {
  return (await loadAccounts()).filter((a) => a.deletedAt !== undefined);
}
