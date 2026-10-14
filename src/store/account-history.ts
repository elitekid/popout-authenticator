import { checkDraft, duplicateKey } from '../core/account';
import { utf8Encode } from '../core/crypto/bytes';
import { WrongSecretError } from '../core/crypto/errors';
import { decryptVault, encryptVault, verifyVaultFile } from '../core/crypto/vault';
import type { Account } from '../core/types';
import { LockedError } from './errors';
import { removeFieldButton, releaseUnusedOrigins, syncFieldScripts } from './field-buttons';
import { withSessionLock } from './session';
import { getSnapshot, listSnapshotPage, type SnapshotCursor, type SnapshotInfo } from './snapshots';
import { commitVaultFile, getVaultKey, keyFromFile, readVaultFile, withVaultWriteLock } from './vault';

const DISPLAY_FIELDS = ['issuer', 'label', 'group', 'note', 'pinned', 'matchHosts'] as const;
const AUTH_FIELDS = ['type', 'algorithm', 'digits', 'period', 'counter', 'secret'] as const;
export type HistoryField = typeof DISPLAY_FIELDS[number] | typeof AUTH_FIELDS[number];
export type HistoryProblem = 'locked' | 'passwordNeeded' | 'wrongPassword' | 'corrupt' | 'missing' | 'absent' | 'stale' | 'duplicate';
export class AccountHistoryError extends Error {
  constructor(public readonly reason: HistoryProblem) { super(reason); this.name = 'AccountHistoryError'; }
}
export type HistoryEntry = SnapshotInfo & {
  status: 'changed' | 'passwordNeeded' | 'corrupt' | 'missing' | 'absent';
  fields: HistoryField[];
  hotp: boolean;
};
export type HistoryChange = { field: HistoryField; before?: string | boolean; after?: string | boolean };
export type HistoryPreview = { id: number; changes: HistoryChange[]; hotp: boolean };
export type AccountHistorySession = {
  readPage(): Promise<{ entries: HistoryEntry[]; hasMore: boolean }>;
  preview(id: number, password?: string): Promise<HistoryPreview>;
  restore(id: number, password?: string): Promise<void>;
  dispose(): void;
};

function value(account: Account, field: HistoryField): unknown {
  if (field === 'secret') return Array.from(account.secret);
  if (field === 'matchHosts') return [...account.matchHosts].sort();
  if (field === 'group') return account.group ?? '';
  return account[field];
}
function changes(current: Account, past: Account): HistoryField[] {
  return [...DISPLAY_FIELDS, ...AUTH_FIELDS].filter((field) =>
    JSON.stringify(value(current, field)) !== JSON.stringify(value(past, field)));
}
async function fingerprint(account: Account, revision = false): Promise<string> {
  const data = [...DISPLAY_FIELDS, ...AUTH_FIELDS].map((field) => value(account, field));
  if (revision) data.push(account.id, account.createdAt, account.updatedAt, account.deletedAt);
  const digest = await crypto.subtle.digest('SHA-256', utf8Encode(JSON.stringify(data)) as BufferSource);
  // 이 값은 세션 안에서만 쓴다. 저장소·DOM·로그에는 내보내지 않는다.
  return Array.from(new Uint8Array(digest), (n) => n.toString(16).padStart(2, '0')).join('');
}
function visibleValue(account: Account, field: HistoryField): string | boolean | undefined {
  if (field === 'secret') return undefined;
  if (field === 'matchHosts') return account.matchHosts.join(', ');
  if (field === 'pinned') return account.pinned;
  return String(account[field] ?? '');
}
function target(list: Account[], id: string): Account {
  const account = list.find((a) => a.id === id && a.deletedAt === undefined);
  if (!account) throw new AccountHistoryError('stale');
  return account;
}
async function currentVault() {
  const file = await readVaultFile();
  if (!file) throw new AccountHistoryError('stale');
  try {
    const key = await getVaultKey(file);
    return { file, key, accounts: await decryptVault(file, key) };
  } catch (error) {
    if (error instanceof LockedError) throw new AccountHistoryError('locked');
    throw error;
  }
}
async function oldAccount(id: number, accountId: string, currentKey: Uint8Array, password?: string): Promise<Account> {
  const file = await getSnapshot(id);
  if (!file) throw new AccountHistoryError('missing');
  try { await verifyVaultFile(file); } catch { throw new AccountHistoryError('corrupt'); }
  let accounts: Account[] | undefined;
  try { accounts = await decryptVault(file, currentKey); } catch { /* 옛 금고의 키로 다시 연다. */ }
  if (!accounts) {
    let key: Uint8Array;
    try { key = await keyFromFile(file, password === undefined ? {} : { password }); }
    catch (error) {
      if (error instanceof WrongSecretError) throw new AccountHistoryError('wrongPassword');
      if (error instanceof LockedError) throw new AccountHistoryError('passwordNeeded');
      throw new AccountHistoryError('corrupt');
    }
    try { accounts = await decryptVault(file, key); }
    catch { throw new AccountHistoryError('corrupt'); }
  }
  const account = accounts.find((a) => a.id === accountId && a.deletedAt === undefined);
  if (!account) throw new AccountHistoryError('absent');
  try {
    checkDraft(account);
    if (!['totp', 'hotp', 'steam', 'battle'].includes(account.type) ||
        !['SHA-1', 'SHA-256', 'SHA-512'].includes(account.algorithm) ||
        !Array.isArray(account.matchHosts) || !account.matchHosts.every((s) => typeof s === 'string') ||
        !['issuer', 'label', 'note'].every((field) => typeof account[field as 'issuer'] === 'string') ||
        typeof account.pinned !== 'boolean' || (account.group !== undefined && typeof account.group !== 'string')) {
      throw new Error('invalid account');
    }
  } catch { throw new AccountHistoryError('corrupt'); }
  return account;
}

// 이 객체에는 원문 키/금고/계정 배열을 붙들어 두지 않는다. 현재 계정의 비교값과 페이지 커서만 남긴다.
export async function createAccountHistory(accountId: string, options: { signal?: AbortSignal } = {}): Promise<AccountHistorySession> {
  let disposed = false;
  let running = false;
  let cursor: SnapshotCursor | undefined;
  let ended = false;
  const seen = new Set<string>();
  const assertActive = () => {
    if (disposed || options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  };
  // 초기 평문 계정은 이 좁은 호출 안에서만 쓰고 세션 클로저에 남기지 않는다.
  const seed = await (async () => {
    const initial = await currentVault();
    assertActive();
    const account = target(initial.accounts, accountId);
    return { revision: await fingerprint(account, true), signature: await fingerprint(account) };
  })();
  const revision = seed.revision;
  seen.add(seed.signature);
  const fresh = async () => {
    assertActive();
    const state = await currentVault();
    assertActive();
    const account = target(state.accounts, accountId);
    if (await fingerprint(account, true) !== revision) throw new AccountHistoryError('stale');
    return { ...state, account };
  };
  const serial = async <T>(fn: () => Promise<T>): Promise<T> => {
    assertActive();
    if (running) throw new DOMException('Busy', 'InvalidStateError');
    running = true;
    try { return await fn(); } finally { running = false; }
  };
  return {
    dispose() { disposed = true; seen.clear(); },
    readPage: () => serial(async () => {
      if (ended) return { entries: [], hasMore: false };
      const state = await fresh();
      const page = await listSnapshotPage(cursor);
      const entries: HistoryEntry[] = [];
      for (const info of page.items) {
        assertActive();
        try {
          const past = await oldAccount(info.id, accountId, state.key);
          assertActive();
          const signature = await fingerprint(past);
          if (seen.has(signature)) continue;
          seen.add(signature);
          entries.push({ ...info, status: 'changed', fields: changes(state.account, past), hotp: state.account.type === 'hotp' || past.type === 'hotp' });
        } catch (error) {
          if (!(error instanceof AccountHistoryError)) throw error;
          const status = error.reason;
          if (status !== 'passwordNeeded' && status !== 'missing' && status !== 'absent' && status !== 'corrupt') throw error;
          entries.push({ ...info, status, fields: [], hotp: false });
        }
      }
      await fresh(); // 읽는 중 잠기거나 대상이 바뀌었으면 결과를 반환하지 않는다.
      assertActive();
      cursor = page.next;
      ended = !cursor;
      return { entries, hasMore: !ended };
    }),
    preview: (id, password) => serial(async () => {
      const state = await fresh();
      const past = await oldAccount(id, accountId, state.key, password);
      const hotp = state.account.type === 'hotp' || past.type === 'hotp';
      const fields = changes(state.account, past).filter((field) => !hotp || !(AUTH_FIELDS as readonly string[]).includes(field));
      const safe = fields.map((field) => ({ field, before: visibleValue(state.account, field), after: visibleValue(past, field) }));
      await fresh();
      assertActive();
      return { id, changes: safe, hotp };
    }),
    restore: (id, password) => serial(async () => {
      const state = await fresh();
      // KDF와 과거 파일 해독은 현재 금고 쓰기 잠금을 잡기 전에 한다.
      const past = await oldAccount(id, accountId, state.key, password);
      assertActive();
      let hostsChanged = false;
      await withVaultWriteLock(() => withSessionLock(async () => {
        const latest = await fresh();
        const current = latest.account;
        const hotp = current.type === 'hotp' || past.type === 'hotp';
        const next: Account = { ...current, updatedAt: Date.now() };
        for (const field of DISPLAY_FIELDS) Object.assign(next, { [field]: past[field] });
        if (!hotp) for (const field of AUTH_FIELDS) Object.assign(next, { [field]: past[field] });
        checkDraft(next);
        const key = duplicateKey(next);
        const authChanged = changes(current, next).some((field) => (AUTH_FIELDS as readonly string[]).includes(field));
        if (authChanged && latest.accounts.some((a) => a.id !== accountId && a.deletedAt === undefined && duplicateKey(a) === key)) {
          throw new AccountHistoryError('duplicate');
        }
        const accounts = latest.accounts.map((a) => a.id === accountId ? next : a);
        const encrypted = await encryptVault(accounts, latest.key, latest.file.lock, latest.file.wrappedKeys);
        if (latest.file.lockChangedAt !== undefined) encrypted.lockChangedAt = latest.file.lockChangedAt;
        hostsChanged = JSON.stringify(value(current, 'matchHosts')) !== JSON.stringify(value(next, 'matchHosts'));
        assertActive();
        // 복원으로 허락하지 않은 사이트에 단추 범위를 넓히지 않는다. 실패해도 꺼진 상태로 둔다.
        if (hostsChanged) await removeFieldButton(accountId);
        assertActive();
        await getVaultKey(latest.file); // 세션 잠금 안에서 쓰기 직전의 잠금 상태도 확인한다.
        await commitVaultFile(encrypted);
      }));
      if (hostsChanged) { await syncFieldScripts(); await releaseUnusedOrigins(); }
    }),
  };
}
