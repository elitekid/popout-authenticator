// 금고 저장: chrome.storage.local 'vault' 에 파일 하나. 쓴 뒤 다시 읽어 확인한다.
import { duplicateKey, newAccount, type AccountDraft } from '../core/account';
import { fromBase64, toBase64 } from '../core/crypto/bytes';
import { newMasterKey, unwrapWithPassword, unwrapWithRecoveryCode } from '../core/crypto/keys';
import { decryptVault, encryptVault, verifyVaultFile } from '../core/crypto/vault';
import { WrongSecretError } from '../core/crypto/errors';
import type { ImportMeta } from '../core/import/types';
import type { Account, VaultFile } from '../core/types';
import { LockedError, NoVaultError, VaultWriteError } from './errors';
import { getSessionKey } from './session';
import { addSnapshot } from './snapshots';

const KEY = 'vault';
const LOCK_NAME = 'popout-vault-write';

let chain: Promise<unknown> = Promise.resolve();

// 같은 확장의 모든 창·서비스 워커가 한 번에 하나씩만 쓴다.
// 대상 크로미움은 확장 페이지·서비스 워커 모두 navigator.locks 가 있다. 사슬은 시험 환경용.
export function withVaultWriteLock<T>(fn: () => Promise<T>): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.locks) {
    return navigator.locks.request(LOCK_NAME, fn) as Promise<T>;
  }
  const run = chain.then(() => fn());
  chain = run.catch(() => undefined);
  return run;
}

export async function readVaultFile(): Promise<VaultFile | null> {
  const got = await chrome.storage.local.get(KEY);
  const value = got[KEY];
  return value ? (value as VaultFile) : null;
}

export type Credentials = { password?: string; recoveryCode?: string };

export async function keyFromFile(file: VaultFile, creds: Credentials = {}): Promise<Uint8Array> {
  const keys = Array.isArray(file.wrappedKeys) ? file.wrappedKeys : [];
  const none = keys.find((k) => k.kind === 'none');
  if (none) return fromBase64(none.data);
  if (creds.password !== undefined) {
    const wk = keys.find((k) => k.kind === 'password');
    if (wk) return unwrapWithPassword(wk, creds.password);
  }
  if (creds.recoveryCode !== undefined) {
    // 새 복구 코드를 확인하기 전에는 감싸기가 여럿일 수 있다. 차례로 시도한다.
    let wrong: unknown;
    for (const wk of keys.filter((k) => k.kind === 'recovery')) {
      try {
        return await unwrapWithRecoveryCode(wk, creds.recoveryCode);
      } catch (error) {
        if (!(error instanceof WrongSecretError)) throw error;
        wrong = error;
      }
    }
    if (wrong) throw wrong;
  }
  throw new LockedError();
}

export async function getVaultKey(file?: VaultFile): Promise<Uint8Array> {
  const current = file ?? (await readVaultFile());
  if (!current) throw new NoVaultError();
  if (current.lock === 'none') return keyFromFile(current);
  const key = await getSessionKey();
  if (!key) throw new LockedError();
  return key;
}

async function reads(next: VaultFile): Promise<boolean> {
  try {
    const reread = await readVaultFile();
    if (!reread || reread.count !== next.count || reread.checksum !== next.checksum) return false;
    await verifyVaultFile(reread);
    return true;
  } catch {
    return false;
  }
}

async function revert(prev: VaultFile | null): Promise<void> {
  if (prev) await chrome.storage.local.set({ [KEY]: prev });
  else await chrome.storage.local.remove(KEY);
}

// 반드시 withVaultWriteLock 안에서만 부른다.
export async function commitVaultFile(next: VaultFile): Promise<void> {
  const prev = await readVaultFile();
  await chrome.storage.local.set({ [KEY]: next });
  if (!(await reads(next))) {
    await revert(prev);
    throw new VaultWriteError();
  }
  if (prev && prev.checksum !== next.checksum) {
    // 이전 판을 스냅샷에 못 남기면 그 판에만 있던 계정을 잃으니 쓰기를 되돌린다.
    try {
      await addSnapshot(prev);
    } catch (error) {
      await revert(prev);
      throw new VaultWriteError(`snapshot failed: ${String(error)}`);
    }
  }
}

export function createVault(accounts: Account[] = []): Promise<Uint8Array> {
  return withVaultWriteLock(async () => {
    if (await readVaultFile()) throw new Error('vault exists');
    const master = newMasterKey();
    const file = await encryptVault(accounts, master, 'none', [
      { kind: 'none', iv: '', data: toBase64(master) },
    ]);
    await commitVaultFile(file);
    return master;
  });
}

// key: '매번' 잠금 중 카메라 화면처럼 1회용 키를 받아 쓰는 곳만 넘긴다.
export type KeyOption = { key?: Uint8Array };

export async function loadAccounts(opts: KeyOption = {}): Promise<Account[]> {
  const file = await readVaultFile();
  if (!file) throw new NoVaultError();
  return decryptVault(file, opts.key ?? (await getVaultKey(file)));
}

// 계정만 바꾼다. lock·wrappedKeys·lockChangedAt 은 그대로 넘긴다.
export function updateAccounts(
  mutate: (accounts: Account[]) => Account[] | Promise<Account[]>,
  opts: KeyOption = {},
): Promise<Account[]> {
  return withVaultWriteLock(async () => {
    const file = await readVaultFile();
    if (!file) throw new NoVaultError();
    const key = opts.key ?? (await getVaultKey(file));
    const next = await mutate(await decryptVault(file, key));
    const encrypted = await encryptVault(next, key, file.lock, file.wrappedKeys);
    if (file.lockChangedAt !== undefined) encrypted.lockChangedAt = file.lockChangedAt;
    await commitVaultFile(encrypted);
    return next;
  });
}

export function replaceVaultFile(
  build: (current: VaultFile | null) => Promise<VaultFile>,
): Promise<VaultFile> {
  return withVaultWriteLock(async () => {
    const next = await build(await readVaultFile());
    await commitVaultFile(next);
    return next;
  });
}

export async function addDrafts(
  drafts: AccountDraft[],
  meta?: ImportMeta[],
  now: number = Date.now(),
  opts: KeyOption = {},
): Promise<{ added: Account[]; duplicates: number }> {
  let added: Account[] = [];
  let duplicates = 0;
  await updateAccounts((accounts) => {
    // dedupe 와 같은 규칙으로 직접 돌아 drafts 인덱스로 meta 를 짝짓는다.
    const seen = new Set<string>();
    for (const a of accounts) if (a.deletedAt === undefined) seen.add(duplicateKey(a));
    added = [];
    duplicates = 0;
    drafts.forEach((draft, index) => {
      const key = duplicateKey(draft);
      if (seen.has(key)) {
        duplicates++;
        return;
      }
      seen.add(key);
      const account = newAccount(draft, now);
      const m = meta?.[index];
      if (m) {
        if (m.pinned !== undefined) account.pinned = m.pinned;
        if (m.group !== undefined) account.group = m.group;
        if (m.note !== undefined) account.note = m.note;
        if (m.matchHosts !== undefined) account.matchHosts = m.matchHosts;
      }
      added.push(account);
    });
    return [...accounts, ...added];
  }, opts);
  return { added, duplicates };
}

export function onVaultChanged(cb: (file: VaultFile | null) => void): () => void {
  const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area !== 'local' || !(KEY in changes)) return;
    cb((changes[KEY].newValue as VaultFile | undefined) ?? null);
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
