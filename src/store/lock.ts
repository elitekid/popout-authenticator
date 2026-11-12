// 잠금: 마스터 키 하나를 비밀번호·복구 코드·PRF 가 각각 감싼다. 풀린 키는 session 에만 둔다.
import { fromBase64, randomBytes, toBase64, toBase64Url } from '../core/crypto/bytes';
import { WrongSecretError } from '../core/crypto/errors';
import type { Argon2Params } from '../core/crypto/kdf';
import {
  newMasterKey,
  unwrapWithPrf,
  unwrapWithRecoveryCode,
  wrapWithPassword,
  wrapWithPrf,
  wrapWithRecoveryCode,
} from '../core/crypto/keys';
import { newRecoveryCode } from '../core/crypto/recovery';
import { decryptVault, encryptVault } from '../core/crypto/vault';
import type { VaultFile, WrappedKey } from '../core/types';
import { LockedError, NoVaultError } from './errors';
import { readCodeProtection } from './code-access';
import {
  bumpLockEpoch,
  clearLastActivityAt,
  clearSessionKey,
  getOneTimeKeys,
  getSessionKey,
  setOneTimeKeys,
  setSessionKey,
  withSessionLock,
} from './session';
import { clearSnapshots, rewriteNoneSnapshots } from './snapshots';
import { commitVaultFile, keyFromFile, readVaultFile, replaceVaultFile, withVaultWriteLock } from './vault';

const MIN_PASSWORD = 8;

type LockPart = Pick<VaultFile, 'lock' | 'wrappedKeys'>;

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

// 금고 data 는 그대로 두고 lock·wrappedKeys·lockChangedAt 만 바꾼다.
function withLockMeta(cur: VaultFile, part: LockPart): VaultFile {
  return { ...cur, lock: part.lock, wrappedKeys: part.wrappedKeys, lockChangedAt: Date.now() };
}

// 풀린 상태(세션 키)에서만 잠금 메타를 바꾼다. 쓰기 잠금 안에서 읽고 쓴다.
async function changeLockMeta(
  build: (cur: VaultFile, key: Uint8Array) => Promise<LockPart>,
): Promise<VaultFile> {
  return replaceVaultFile(async (cur) => {
    if (!cur) throw new NoVaultError();
    const key = await getSessionKey();
    if (!key) throw new LockedError();
    await decryptVault(cur, key);
    return withLockMeta(cur, await build(cur, key));
  });
}

export async function isLocked(): Promise<boolean> {
  const file = await readVaultFile();
  if (!file || file.lock === 'none') return false;
  return (await getSessionKey()) === null;
}

// 잠금 전 스냅샷(방금 남긴 직전 판 포함)은 none 키가 그대로라 새 마스터 키로 다시 암호화한다.
// 다시 쓰지 못한 스냅샷은 남기지 않고 지운다. 저장소 자체가 막히면 스냅샷을 모두 비운다.
async function protectSnapshots(locked: VaultFile, next: Uint8Array): Promise<void> {
  try {
    await rewriteNoneSnapshots(async (old) => {
      const accounts = await decryptVault(old, await keyFromFile(old));
      const file = await encryptVault(accounts, next, locked.lock, locked.wrappedKeys);
      if (locked.lockChangedAt !== undefined) file.lockChangedAt = locked.lockChangedAt;
      return file;
    });
  } catch {
    await clearSnapshots().catch((error: unknown) => console.warn('snapshots clear', error));
  }
}

export async function enableLock(
  password: string,
  params?: Argon2Params,
): Promise<{ recoveryCode: string }> {
  const recoveryCode = newRecoveryCode();
  await withVaultWriteLock(() => withSessionLock(async () => {
    const cur = await readVaultFile();
    if (!cur) throw new NoVaultError();
    if (cur.lock !== 'none') throw new Error('lock already enabled');
    if (password.length < MIN_PASSWORD) throw new Error('password too short');
    // 옛 스냅샷·원시 사본에 평문 키가 남아 있으니 새 마스터 키로 바꾼다.
    const accounts = await decryptVault(cur, await keyFromFile(cur));
    const next = newMasterKey();
    try {
      const wrapped: WrappedKey[] = [
        await wrapWithPassword(next, password, params),
        await wrapWithRecoveryCode(next, recoveryCode),
      ];
      const file = await encryptVault(accounts, next, 'password', wrapped);
      file.lockChangedAt = Date.now();
      await commitVaultFile(file);
      await setSessionKey(next);
      await protectSnapshots(file, next);
    } finally { next.fill(0); }
  }));
  // 잠금을 켜면 방문 사이트 기록을 디스크에 남기지 않는다(이후는 session 에만).
  await chrome.storage.local.remove('siteUsage');
  return { recoveryCode };
}

export async function changePassword(newPassword: string, params?: Argon2Params): Promise<void> {
  if (newPassword.length < MIN_PASSWORD) throw new Error('password too short');
  await changeLockMeta(async (cur, key) => {
    if (cur.lock === 'none') throw new Error('lock not enabled');
    const others = cur.wrappedKeys.filter((k) => k.kind !== 'password');
    return {
      lock: cur.lock,
      wrappedKeys: [await wrapWithPassword(key, newPassword, params), ...others],
    };
  });
}

export async function disableLock(): Promise<void> {
  const file = await readVaultFile();
  if (!file) throw new NoVaultError();
  if (file.lock === 'none') return;
  await changeLockMeta(async (_cur, key) => {
    if (await readCodeProtection()) throw new Error('codeProtection.disableFirst');
    return { lock: 'none', wrappedKeys: [{ kind: 'none', iv: '', data: toBase64(key) }] };
  });
  await lockNow();
}

export async function unlockWithPassword(password: string): Promise<void> {
  await withVaultWriteLock(() => withSessionLock(async () => {
    const file = await readVaultFile();
    if (!file) throw new NoVaultError();
    const key = await keyFromFile(file, { password });
    try {
      await decryptVault(file, key);
      await setSessionKey(key);
    } finally { key.fill(0); }
  }));
}

// 복구 코드 감싸기는 이어 붙은 채 둘 수 있는 개수의 한도(확정된 것 하나 + 확정 전 새 코드들).
const MAX_RECOVERY = 4;

// 복구 코드로 풀고 새 코드를 덧붙인다. 새 코드를 사용자가 받았다고 확인하기(confirmRecoveryCode) 전에는
// 쓴 옛 코드도 그대로 둔다(팝업이 닫혀 새 코드를 잃어도 잠기지 않게).
// 확인부터 덧붙이기까지 쓰기 잠금 하나 안에서 한다.
export async function unlockWithRecoveryCode(code: string): Promise<{ recoveryCode: string }> {
  const recoveryCode = newRecoveryCode();
  await withVaultWriteLock(() => withSessionLock(async () => {
    const cur = await readVaultFile();
    if (!cur) throw new NoVaultError();
    if (cur.lock === 'none') throw new Error('lock not enabled');
    const recovery = cur.wrappedKeys.filter((k) => k.kind === 'recovery');
    if (recovery.length === 0) throw new LockedError();
    const opened = await openWithAnyRecovery(recovery, code);
    try {
      await decryptVault(cur, opened);
      const others = cur.wrappedKeys.filter((k) => k.kind !== 'recovery');
      // 한도를 넘으면 맨 앞(확정된 것)과 가장 최근 것만 남긴다.
      const kept = recovery.length >= MAX_RECOVERY
        ? [...recovery.slice(0, 1), ...recovery.slice(-(MAX_RECOVERY - 2))]
        : recovery;
      await commitVaultFile(withLockMeta(cur, {
        lock: cur.lock,
        wrappedKeys: [...others, ...kept, await wrapWithRecoveryCode(opened, recoveryCode)],
      }));
      await setSessionKey(opened);
    } finally { opened.fill(0); }
  }));
  return { recoveryCode };
}

async function openWithAnyRecovery(recovery: WrappedKey[], code: string): Promise<Uint8Array> {
  let wrong: unknown = new WrongSecretError('wrong recovery code');
  for (const wk of recovery) {
    try {
      return await unwrapWithRecoveryCode(wk, code);
    } catch (error) {
      if (!(error instanceof WrongSecretError)) throw error;
      wrong = error;
    }
  }
  throw wrong;
}

// 사용자가 새 복구 코드를 받았다고 확인하면 그 코드만 남기고 나머지 복구 감싸기를 없앤다.
// 풀린 상태에서만 하고, 넘긴 코드가 실제로 풀리는 감싸기가 있을 때만 바꾼다.
export async function confirmRecoveryCode(recoveryCode: string): Promise<void> {
  await changeLockMeta(async (cur, key) => {
    if (cur.lock === 'none') throw new Error('lock not enabled');
    const recovery = cur.wrappedKeys.filter((k) => k.kind === 'recovery');
    let mine: WrappedKey | undefined;
    for (const wk of recovery) {
      let check: Uint8Array | null = null;
      try {
        check = await unwrapWithRecoveryCode(wk, recoveryCode);
      } catch (error) {
        if (!(error instanceof WrongSecretError)) throw error;
      }
      if (check && sameBytes(check, key)) mine = wk;
      check?.fill(0);
      if (mine) break;
    }
    if (!mine) throw new WrongSecretError('unknown recovery code');
    return {
      lock: cur.lock,
      wrappedKeys: [...cur.wrappedKeys.filter((k) => k.kind !== 'recovery'), mine],
    };
  });
}

// 풀린 상태에서 복구 코드 감싸기만 새 코드로 바꾼다. 옛 코드는 바로 못 쓰게 된다.
// 새 코드는 화면이 먼저 만들어 보여 주고, 사용자가 다시 입력해 맞춘 뒤에 넘긴다(받기 전에 옛 코드가 사라지지 않게).
export async function replaceRecoveryCode(recoveryCode: string): Promise<void> {
  const file = await readVaultFile();
  if (!file) throw new NoVaultError();
  if (file.lock === 'none') throw new Error('lock not enabled');
  await changeLockMeta(async (cur, key) => {
    if (cur.lock === 'none') throw new Error('lock not enabled');
    const others = cur.wrappedKeys.filter((k) => k.kind !== 'recovery');
    return {
      lock: cur.lock,
      wrappedKeys: [...others, await wrapWithRecoveryCode(key, recoveryCode)],
    };
  });
}

export async function addPrfKey(prfOutput: Uint8Array, credId: string): Promise<void> {
  await changeLockMeta(async (cur, key) => {
    if (cur.lock === 'none') throw new Error('lock not enabled');
    const wk = await wrapWithPrf(key, prfOutput, credId);
    // 바로 풀어 보아 같은 키가 나올 때만 추가한다.
    let check: Uint8Array | null = null;
    try {
      check = await unwrapWithPrf(wk, prfOutput);
    } catch {
      check = null;
    }
    if (!check || !sameBytes(check, key)) throw new Error('prf check failed');
    const others = cur.wrappedKeys.filter((k) => !(k.kind === 'prf' && k.credId === credId));
    return { lock: 'password+prf', wrappedKeys: [...others, wk] };
  });
}

export async function removePrfKey(credId: string): Promise<void> {
  await changeLockMeta(async (cur) => {
    const rest = cur.wrappedKeys.filter((k) => !(k.kind === 'prf' && k.credId === credId));
    const hasPrf = rest.some((k) => k.kind === 'prf');
    if (!hasPrf && await readCodeProtection()) throw new Error('codeProtection.disableFirst');
    return { lock: hasPrf ? 'password+prf' : cur.lock === 'none' ? 'none' : 'password', wrappedKeys: rest };
  });
}

export async function unlockWithPrf(
  credId: string, prfOutput: Uint8Array, options: { signal?: AbortSignal } = {},
): Promise<void> {
  await withVaultWriteLock(() => withSessionLock(async () => {
    options.signal?.throwIfAborted();
    const file = await readVaultFile();
    if (!file) throw new NoVaultError();
    const wk = file.wrappedKeys.find((k) => k.kind === 'prf' && k.credId === credId);
    if (!wk) throw new WrongSecretError('unknown credential');
    const key = await unwrapWithPrf(wk, prfOutput);
    try {
      await decryptVault(file, key);
      options.signal?.throwIfAborted();
      await setSessionKey(key);
      // 저장 응답을 기다리던 동안 화면이 닫혔다면 같은 세션 잠금 안에서 바로 거둔다.
      if (options.signal?.aborted) {
        await clearSessionKey();
        options.signal.throwIfAborted();
      }
    } finally { key.fill(0); }
  }));
}

export function lockNow(): Promise<void> {
  return withSessionLock(async () => {
    await bumpLockEpoch();
    await clearSessionKey();
    await chrome.storage.session.remove('codeAccessRequests');
    await clearLastActivityAt();
    await setOneTimeKeys({});
  });
}

// '매번' 잠금 중 카메라 화면처럼 팝업이 닫혀 잠기는 곳에서 받아 쓰는 1회용 키.
// 발급·사용·lockNow 는 세션 잠금으로 줄을 세운다(같은 토큰 두 번 사용, 잠근 뒤 되살아남 방지).
export function issueOneTimeKey(ttlMs: number = 10 * 60_000): Promise<string> {
  return withSessionLock(() => issueInner(ttlMs));
}

async function issueInner(ttlMs: number): Promise<string> {
  const key = await getSessionKey();
  if (!key) throw new LockedError();
  const token = toBase64Url(randomBytes(16));
  const now = Date.now();
  const live = Object.fromEntries(
    Object.entries(await getOneTimeKeys()).filter(([, v]) => v.expiresAt > now),
  );
  live[token] = { key: toBase64(key), expiresAt: now + ttlMs };
  await setOneTimeKeys(live);
  return token;
}

export function redeemOneTimeKey(token: string, now: number = Date.now()): Promise<Uint8Array> {
  return withSessionLock(() => redeemInner(token, now));
}

async function redeemInner(token: string, now: number): Promise<Uint8Array> {
  const all = await getOneTimeKeys();
  const entry = Object.prototype.hasOwnProperty.call(all, token) ? all[token] : undefined;
  if (!entry) throw new LockedError();
  delete all[token];
  await setOneTimeKeys(all);
  if (entry.expiresAt <= now) throw new LockedError();
  return fromBase64(entry.key);
}
