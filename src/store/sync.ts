// 크롬 동기화: local 이 주 저장, sync 는 계정별로 마스터 키로 암호화한 보조 사본.
import { duplicateKey } from '../core/account';
import { aesGcmDecrypt, aesGcmEncrypt } from '../core/crypto/aes';
import { concat, fromBase64, toBase64, toHex, utf8Decode, utf8Encode } from '../core/crypto/bytes';
import { WrongSecretError } from '../core/crypto/errors';
import { decryptVault, encryptVault } from '../core/crypto/vault';
import type { Account, Settings, VaultFile, WrappedKey } from '../core/types';
import { syncConsentGranted } from '../core/browser';
import { LockedError, NoVaultError } from './errors';
import type { RecoverySource } from './recover';
import { setSessionKey, withSessionLock } from './session';
import { loadSettings } from './settings';
import { mergeTombstones, readTombstones, saveTombstones, type Tombstones } from './tombstones';
import {
  commitVaultFile,
  getVaultKey,
  keyFromFile,
  readVaultFile,
  withVaultWriteLock,
  type Credentials,
} from './vault';

export type SyncStatus = 'off' | 'locked' | 'held' | 'needs-join' | 'overflow' | 'ok';

type SyncMeta = {
  v: 1;
  keyId: string;
  lock: VaultFile['lock'];
  wrappedKeys: WrappedKey[];
  lockChangedAt: number;
  chunks: number;
  pushedAt: number;
};

type SyncRecord = { id: string; u: number; iv: string; d: string };
type SyncArea = Record<string, unknown>;

const PREFIX = 'pa_';
const META_KEY = 'pa_meta';
const TOMB_KEY = 'pa_tomb';
const CHUNK_PREFIX = 'pa_acc_';
const CHUNK_RE = /^pa_acc_(\d+)$/;
const MAX_CHUNKS = 12;
const CHUNK_BYTES = 7000;
const TRUST_AFTER_MS = 2 * 60_000;
const KEY_ID_LABEL = 'popout-authenticator key id v1';

export function isSyncActive(settings: Settings, file: Pick<VaultFile, 'lock'>): boolean {
  return settings.syncEnabled && (file.lock !== 'none' || settings.syncPlaintextAllowed);
}

async function keyIdOf(key: Uint8Array): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    concat(utf8Encode(KEY_ID_LABEL), key) as BufferSource,
  );
  return toHex(new Uint8Array(digest)).slice(0, 16);
}

function metaWrappedKeys(file: Pick<VaultFile, 'lock' | 'wrappedKeys'>): WrappedKey[] {
  if (file.lock === 'none') return file.wrappedKeys;
  return file.wrappedKeys.filter((k) => k.kind !== 'none');
}

function readMeta(area: SyncArea): SyncMeta | null {
  const m = area[META_KEY] as Partial<SyncMeta> | undefined;
  if (!m || typeof m !== 'object' || m.v !== 1) return null;
  if (typeof m.keyId !== 'string' || !Array.isArray(m.wrappedKeys)) return null;
  if (m.lock !== 'none' && m.lock !== 'password' && m.lock !== 'password+prf') return null;
  return {
    v: 1,
    keyId: m.keyId,
    lock: m.lock,
    wrappedKeys: m.wrappedKeys,
    lockChangedAt: typeof m.lockChangedAt === 'number' ? m.lockChangedAt : 0,
    chunks: typeof m.chunks === 'number' ? m.chunks : NaN,
    pushedAt: typeof m.pushedAt === 'number' ? m.pushedAt : 0,
  };
}

function readRemoteTombs(area: SyncArea): Tombstones {
  const t = area[TOMB_KEY];
  if (typeof t !== 'object' || t === null || Array.isArray(t)) return {};
  return mergeTombstones(t as Tombstones, {});
}

function chunkKeys(area: SyncArea): string[] {
  return Object.keys(area)
    .filter((k) => CHUNK_RE.test(k))
    .sort((x, y) => Number(CHUNK_RE.exec(x)?.[1]) - Number(CHUNK_RE.exec(y)?.[1]));
}

function isRecord(r: unknown): r is SyncRecord {
  if (typeof r !== 'object' || r === null) return false;
  const x = r as Partial<SyncRecord>;
  return (
    typeof x.id === 'string' && Number.isFinite(x.u) && typeof x.iv === 'string' && typeof x.d === 'string'
  );
}

function readRecords(area: SyncArea, keys: string[]): SyncRecord[] {
  const out: SyncRecord[] = [];
  for (const k of keys) {
    const chunk = area[k];
    if (Array.isArray(chunk)) for (const r of chunk) if (isRecord(r)) out.push(r);
  }
  return out;
}

async function encryptRecord(account: Account, key: Uint8Array): Promise<SyncRecord> {
  const stored = { ...account, secret: toBase64(account.secret) };
  const { iv, ciphertext } = await aesGcmEncrypt(key, utf8Encode(JSON.stringify(stored)));
  return { id: account.id, u: account.updatedAt, iv: toBase64(iv), d: toBase64(ciphertext) };
}

async function decryptRecord(record: SyncRecord, key: Uint8Array): Promise<Account> {
  const plain = await aesGcmDecrypt(key, fromBase64(record.iv), fromBase64(record.d));
  const raw = JSON.parse(utf8Decode(plain)) as Omit<Account, 'secret'> & { secret: unknown };
  if (raw.id !== record.id || raw.updatedAt !== record.u || typeof raw.secret !== 'string') {
    throw new Error('bad sync record');
  }
  return { ...raw, secret: fromBase64(raw.secret) } as Account;
}

// 못 푸는 기록이 있으면 failed 가 0 보다 크다. 그때는 덮어쓰지 않고 기다린다(옛 키 조각이 섞여 도착한 경우).
async function decryptRecords(
  records: SyncRecord[],
  key: Uint8Array,
): Promise<{ accounts: Account[]; reusable: Map<string, SyncRecord>; failed: number }> {
  const accounts: Account[] = [];
  const reusable = new Map<string, SyncRecord>();
  let failed = 0;
  for (const record of records) {
    try {
      const account = await decryptRecord(record, key);
      accounts.push(account);
      reusable.set(`${account.id}:${account.updatedAt}`, record);
    } catch (error) {
      failed++;
      console.warn('sync: undecryptable record', error);
    }
  }
  return { accounts, reusable, failed };
}

// meta 가 말하는 조각이 다 있고 다 풀리면 계정을, 아니면 null(보류).
async function readRemote(
  area: SyncArea,
  meta: SyncMeta,
  key: Uint8Array,
): Promise<{ records: SyncRecord[]; accounts: Account[]; reusable: Map<string, SyncRecord> } | null> {
  if (!Number.isInteger(meta.chunks) || meta.chunks < 0 || meta.chunks > MAX_CHUNKS) return null;
  const keys: string[] = [];
  for (let i = 0; i < meta.chunks; i++) {
    const name = `${CHUNK_PREFIX}${i}`;
    const chunk = area[name];
    if (!Array.isArray(chunk) || !chunk.every(isRecord)) return null;
    keys.push(name);
  }
  const records = readRecords(area, keys);
  const { accounts, reusable, failed } = await decryptRecords(records, key);
  return failed > 0 ? null : { records, accounts, reusable };
}

async function hold(): Promise<SyncStatus> {
  await chrome.storage.local.set({ syncPending: true });
  return 'held';
}

// local 순서를 유지하고 remote 에만 있던 것은 뒤에 붙인다.
export function mergeAccounts(local: Account[], remote: Account[], tombs: Tombstones): Account[] {
  const byId = new Map<string, Account>();
  for (const a of local) if (!byId.has(a.id)) byId.set(a.id, a);
  for (const r of remote) {
    const cur = byId.get(r.id);
    if (!cur || r.updatedAt > cur.updatedAt) byId.set(r.id, r);
  }
  const alive = [...byId.values()].filter((a) => {
    const t = tombs[a.id];
    return t === undefined || t < a.updatedAt;
  });
  // 휴지통 밖 계정끼리 같은 비밀키면 createdAt 이 작은 것(같으면 id 가 작은 것)만 남긴다.
  const winners = new Map<string, Account>();
  for (const a of alive) {
    if (a.deletedAt !== undefined) continue;
    const k = duplicateKey(a);
    const w = winners.get(k);
    if (!w || a.createdAt < w.createdAt || (a.createdAt === w.createdAt && a.id < w.id)) winners.set(k, a);
  }
  return alive.filter((a) => a.deletedAt !== undefined || winners.get(duplicateKey(a)) === a);
}

function accountSig(accounts: { id: string; updatedAt: number }[]): string {
  return accounts
    .map((a) => `${a.id}:${a.updatedAt}`)
    .sort()
    .join('|');
}

function recordSig(records: SyncRecord[]): string {
  return accountSig(records.map((r) => ({ id: r.id, updatedAt: r.u })));
}

function tombSig(t: Tombstones): string {
  return Object.entries(t)
    .sort((x, y) => (x[0] < y[0] ? -1 : 1))
    .map(([id, at]) => `${id}:${at}`)
    .join('|');
}

function byteLength(value: unknown): number {
  return utf8Encode(JSON.stringify(value)).length;
}

// sync 항목 하나는 8192바이트까지라, 삭제 표시는 최신 것부터 CHUNK_BYTES 안에 드는 만큼만 올린다.
function fitTombs(tombs: Tombstones): Tombstones {
  const out: Tombstones = {};
  for (const [id, at] of Object.entries(tombs).sort((x, y) => y[1] - x[1])) {
    out[id] = at;
    if (byteLength(out) > CHUNK_BYTES) {
      delete out[id];
      break;
    }
  }
  return out;
}

// 조각 하나의 JSON 크기가 CHUNK_BYTES 이하가 되게 나눈다. 못 나누면 null.
function splitChunks(records: SyncRecord[]): SyncRecord[][] | null {
  const chunks: SyncRecord[][] = [];
  let cur: SyncRecord[] = [];
  for (const r of records) {
    if (cur.length > 0 && byteLength([...cur, r]) > CHUNK_BYTES) {
      chunks.push(cur);
      cur = [];
    }
    if (byteLength([r]) > CHUNK_BYTES) return null;
    cur.push(r);
  }
  if (cur.length > 0) chunks.push(cur);
  return chunks.length > MAX_CHUNKS ? null : chunks;
}

type PushInput = {
  key: Uint8Array;
  file: Pick<VaultFile, 'lock' | 'wrappedKeys' | 'lockChangedAt'>;
  accounts: Account[];
  tombs: Tombstones;
  area: SyncArea;
  reusable?: Map<string, SyncRecord>;
  now: number;
};

async function push(input: PushInput): Promise<'ok' | 'overflow' | 'off'> {
  const records: SyncRecord[] = [];
  for (const a of input.accounts) {
    records.push(input.reusable?.get(`${a.id}:${a.updatedAt}`) ?? (await encryptRecord(a, input.key)));
  }
  const chunks = splitChunks(records);
  if (!chunks) {
    await chrome.storage.local.set({ syncOverflow: true });
    return 'overflow';
  }
  const meta: SyncMeta = {
    v: 1,
    keyId: await keyIdOf(input.key),
    lock: input.file.lock,
    wrappedKeys: metaWrappedKeys(input.file),
    lockChangedAt: input.file.lockChangedAt ?? 0,
    chunks: chunks.length,
    pushedAt: input.now,
  };
  const items: SyncArea = { [META_KEY]: meta, [TOMB_KEY]: fitTombs(input.tombs) };
  chunks.forEach((c, i) => {
    items[`${CHUNK_PREFIX}${i}`] = c;
  });
  // 암호화·합류 중에도 설정은 바뀔 수 있다. 모든 업로드 경로에서 실제 쓰기 직전에 확인한다.
  if (!isSyncActive(await loadSettings(), input.file) || !(await syncConsentGranted())) return 'off';
  await chrome.storage.sync.set(items);
  const stale = Object.keys(input.area).filter((k) => {
    const m = CHUNK_RE.exec(k);
    return m !== null && Number(m[1]) >= chunks.length;
  });
  if (stale.length > 0) await chrome.storage.sync.remove(stale);
  await chrome.storage.local.set({ syncOverflow: false, syncPending: false, syncObserved: true });
  return 'ok';
}

async function finish(status: SyncStatus, now: number): Promise<SyncStatus> {
  await chrome.storage.local.set({ syncStatus: { status, at: now } });
  return status;
}

// 금고 쓰기 잠금 하나 안에서 끝까지 돈다. 키·잠금 메타·삭제 표시가 같은 판을 보게 하려는 것이다.
export function syncNow(now: number = Date.now()): Promise<SyncStatus> {
  return withVaultWriteLock(async () => finish(await runSync(now), now));
}

// 잠금 안에서만 부른다. 계정만 바꾸고 lock·wrappedKeys·lockChangedAt 은 그대로.
async function commitAccounts(file: VaultFile, key: Uint8Array, accounts: Account[]): Promise<VaultFile> {
  const next = await encryptVault(accounts, key, file.lock, file.wrappedKeys);
  if (file.lockChangedAt !== undefined) next.lockChangedAt = file.lockChangedAt;
  await commitVaultFile(next);
  return next;
}

async function runSync(now: number): Promise<SyncStatus> {
  const settings = await loadSettings();
  const file = await readVaultFile();
  if (!file || !isSyncActive(settings, file)) return 'off';
  // Firefox 는 사용자가 데이터 전송에 동의해야 내려받거나 올린다.
  if (!(await syncConsentGranted())) return 'off';
  let key: Uint8Array;
  try {
    key = await getVaultKey(file);
  } catch (error) {
    if (error instanceof LockedError) return 'locked';
    if (error instanceof NoVaultError) return 'off';
    throw error;
  }

  const area: SyncArea = await chrome.storage.sync.get(null);
  const meta = readMeta(area);
  const local = await decryptVault(file, key);
  const localTombs = await readTombstones();

  if (!meta) {
    if (META_KEY in area) return hold();
    return pushWhenTrusted(file, key, local, localTombs, area, now);
  }

  await chrome.storage.local.set({ syncObserved: true });
  const myKeyId = await keyIdOf(key);
  if (meta.keyId !== myKeyId) {
    if (file.lock === 'none' && meta.wrappedKeys.some((k) => k.kind === 'none')) {
      return joinInner({}, now);
    }
    // sync 가 평문(none 키)인데 이 기기는 잠겨 있다: 이 기기에서 잠금을 켜 마스터 키를 바꾼 경우.
    // sync 계정을 이 기기 금고로 합친 뒤 이 기기 키·잠금으로 sync 를 덮는다(잠금이 평문으로 풀리지 않게).
    const plainKey = meta.wrappedKeys.find((k) => k.kind === 'none');
    if (plainKey) {
      const remote = await readRemote(area, meta, fromBase64(plainKey.data));
      if (!remote) return hold();
      const tombs = mergeTombstones(localTombs, readRemoteTombs(area));
      await saveTombstones(tombs);
      const merged = mergeAccounts(local, remote.accounts, tombs);
      const current = await commitAccounts(file, key, merged);
      return push({ key, file: current, accounts: merged, tombs, area, now });
    }
    return 'needs-join';
  }

  // 아직 다 내려오지 않았거나 못 푸는 조각이 있으면 덮어쓰지 않고 기다린다.
  const remote = await readRemote(area, meta, key);
  if (!remote) return hold();

  const remoteTombs = readRemoteTombs(area);
  const tombs = mergeTombstones(localTombs, remoteTombs);
  if (tombSig(tombs) !== tombSig(localTombs)) await saveTombstones(tombs);

  const merged = mergeAccounts(local, remote.accounts, tombs);
  let current = file;
  if (meta.lockChangedAt > (file.lockChangedAt ?? 0)) {
    // 다른 기기에서 잠금 설정을 바꿨다. 마스터 키가 같으니 메타만 받아들이고 세션 키는 건드리지 않는다.
    current = { ...file, lock: meta.lock, wrappedKeys: meta.wrappedKeys, lockChangedAt: meta.lockChangedAt };
  }
  if (current !== file || accountSig(merged) !== accountSig(local)) {
    current = await commitAccounts(current, key, merged);
  }

  // lock·lockChangedAt 이 같으면 wrappedKeys 는 같다고 본다(서로 덮어쓰는 반복 방지).
  const metaDiffers =
    meta.lock !== current.lock || meta.lockChangedAt !== (current.lockChangedAt ?? 0);
  const needsPush =
    recordSig(remote.records) !== accountSig(merged) ||
    tombSig(remoteTombs) !== tombSig(fitTombs(tombs)) ||
    metaDiffers;
  if (!needsPush) {
    await chrome.storage.local.set({ syncPending: false });
    return 'ok';
  }
  return push({ key, file: current, accounts: merged, tombs, area, reusable: remote.reusable, now });
}

// 빈 sync 영역은 크롬이 늦게 내려받는 중일 수 있어, 믿을 만할 때만 밀어 올린다.
async function pushWhenTrusted(
  file: VaultFile,
  key: Uint8Array,
  local: Account[],
  tombs: Tombstones,
  area: SyncArea,
  now: number,
): Promise<SyncStatus> {
  const st = await chrome.storage.local.get(['syncObserved', 'syncFirstEmptyAt']);
  let observed = st.syncObserved === true;
  let first = typeof st.syncFirstEmptyAt === 'number' ? st.syncFirstEmptyAt : undefined;
  if (observed) {
    // 내용이 있던 영역이 비었다(로그아웃·계정 바꿈·내려받기 전). 계정 수와 무관하게 다시 기다린다.
    observed = false;
    first = now;
  } else if (first === undefined || first > now) {
    first = now;
  }
  await chrome.storage.local.set({ syncObserved: observed, syncFirstEmptyAt: first });
  if (now - first < TRUST_AFTER_MS) return hold();
  return push({ key, file, accounts: local, tombs, area, now });
}

export function joinSync(creds: Credentials): Promise<SyncStatus> {
  return withVaultWriteLock(async () => {
    const now = Date.now();
    return finish(await joinInner(creds, now), now);
  });
}

// 잠금 안에서만 부른다.
async function joinInner(creds: Credentials, now: number): Promise<SyncStatus> {
  return withSessionLock(() => joinWithSessionLock(creds, now));
}

// 합류한 금고 키를 세션에 쓰는 동안 들어온 잠금은 합류가 끝난 뒤 실행되어야 한다.
async function joinWithSessionLock(creds: Credentials, now: number): Promise<SyncStatus> {
  const file = await readVaultFile();
  if (!file) throw new NoVaultError();
  const settings = await loadSettings();
  if (!(await syncConsentGranted())) return 'off';
  const area: SyncArea = await chrome.storage.sync.get(null);
  const meta = readMeta(area);
  if (!meta) return 'off';
  // 합류 뒤의 잠금 상태로 동기화가 허용되는지 먼저 본다(평문 금고를 몰래 올리지 않게).
  if (!settings.syncEnabled || (meta.lock === 'none' && !settings.syncPlaintextAllowed)) return 'off';

  const remoteKey = await keyFromFile({ ...file, lock: meta.lock, wrappedKeys: meta.wrappedKeys }, creds);
  if ((await keyIdOf(remoteKey)) !== meta.keyId) throw new WrongSecretError();
  const localKey = await getVaultKey(file);

  const remote = await readRemote(area, meta, remoteKey);
  if (!remote) return hold();
  const tombs = mergeTombstones(await readTombstones(), readRemoteTombs(area));

  const merged = mergeAccounts(await decryptVault(file, localKey), remote.accounts, tombs);
  const next = await encryptVault(merged, remoteKey, meta.lock, meta.wrappedKeys);
  next.lockChangedAt = meta.lockChangedAt;
  await commitVaultFile(next);
  await saveTombstones(tombs);
  if (next.lock !== 'none') await setSessionKey(remoteKey);
  return push({ key: remoteKey, file: next, accounts: merged, tombs, area, reusable: remote.reusable, now });
}

// active 와 무관하게 읽기만 한다. 빈 금고 복구 화면의 후보로 쓴다.
export async function syncRecoverySources(): Promise<RecoverySource[]> {
  const area: SyncArea = await chrome.storage.sync.get(null);
  const count = readRecords(area, chunkKeys(area)).length;
  return count > 0 ? [{ kind: 'sync', count }] : [];
}

// 사용자가 명시적으로 부를 때만 쓴다.
export async function clearSyncArea(): Promise<void> {
  const area: SyncArea = await chrome.storage.sync.get(null);
  const keys = Object.keys(area).filter((k) => k.startsWith(PREFIX));
  if (keys.length > 0) await chrome.storage.sync.remove(keys);
}
