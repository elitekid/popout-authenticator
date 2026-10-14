// 풀린 금고 키는 chrome.storage.session 에만 둔다.
import { fromBase64, toBase64 } from '../core/crypto/bytes';

export async function setSessionKey(key: Uint8Array): Promise<void> {
  await chrome.storage.session.set({ vaultKey: toBase64(key), unlockedAt: Date.now() });
}

export async function getSessionKey(): Promise<Uint8Array | null> {
  const got = await chrome.storage.session.get('vaultKey');
  const value = got.vaultKey;
  if (typeof value !== 'string') return null;
  try {
    return fromBase64(value);
  } catch {
    return null;
  }
}

export async function clearSessionKey(): Promise<void> {
  await chrome.storage.session.remove(['vaultKey', 'unlockedAt']);
}

async function getNumber(name: string): Promise<number | null> {
  const got = await chrome.storage.session.get(name);
  const value = got[name];
  return typeof value === 'number' ? value : null;
}

export function getUnlockedAt(): Promise<number | null> {
  return getNumber('unlockedAt');
}

export function getLastActivityAt(): Promise<number | null> {
  return getNumber('lastActivityAt');
}

export async function setLastActivityAt(at: number): Promise<void> {
  await chrome.storage.session.set({ lastActivityAt: at });
}

export async function clearLastActivityAt(): Promise<void> {
  await chrome.storage.session.remove('lastActivityAt');
}

// 1회용 키: { [토큰]: { key: base64, expiresAt } }
export type OneTimeKeys = Record<string, { key: string; expiresAt: number }>;

export async function getOneTimeKeys(): Promise<OneTimeKeys> {
  const got = await chrome.storage.session.get('otk');
  const value = got.otk;
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as OneTimeKeys)
    : {};
}

export async function setOneTimeKeys(keys: OneTimeKeys): Promise<void> {
  if (Object.keys(keys).length === 0) await chrome.storage.session.remove('otk');
  else await chrome.storage.session.set({ otk: keys });
}

let chain: Promise<unknown> = Promise.resolve();

// 1회용 키 발급·사용과 lockNow 를 모든 창·서비스 워커에서 한 줄로 세운다.
export function withSessionLock<T>(fn: () => Promise<T>): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.locks) {
    return navigator.locks.request('popout-session', fn) as Promise<T>;
  }
  const run = chain.then(() => fn());
  chain = run.catch(() => undefined);
  return run;
}
