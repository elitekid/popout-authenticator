// 우리 백업 파일. 마스터 키와 무관하게 비밀번호만으로 열린다. 브라우저 API 를 쓰지 않는다.
import { checkDraft } from '../account';
import { decodeBase32, encodeBase32 } from '../base32';
import {
  aesGcmDecrypt,
  aesGcmEncrypt,
  argon2idKey,
  CorruptVaultError,
  DEFAULT_ARGON2,
  fromBase64,
  randomBytes,
  toBase64,
  WrongSecretError,
  type Argon2Params,
} from '../crypto';
import type { Account, AccountType, Algorithm } from '../types';

export const BACKUP_FORMAT = 'popout-authenticator-backup';
const SALT_BYTES = 16;

type StoredAccount = {
  id: string;
  type: AccountType;
  issuer: string;
  label: string;
  secret: string; // 패딩 없는 base32
  algorithm: Algorithm;
  digits: number;
  period: number;
  counter?: number;
  group?: string;
  note: string;
  pinned: boolean;
  matchHosts: string[];
  lastUsedAt?: number;
  createdAt: number;
  updatedAt: number;
};

type Head = { format: typeof BACKUP_FORMAT; version: 1; exportedAt: string };

type PlainFile = Head & { encrypted: false; accounts: StoredAccount[] };
type EncryptedFile = Head & {
  encrypted: true;
  kdf: { name: 'argon2id'; salt: string; iterations: number; memoryKiB: number; parallelism: number };
  iv: string;
  data: string;
};

function store(a: Account): StoredAccount {
  return {
    id: a.id,
    type: a.type,
    issuer: a.issuer,
    label: a.label,
    secret: encodeBase32(a.secret),
    algorithm: a.algorithm,
    digits: a.digits,
    period: a.period,
    ...(a.counter !== undefined ? { counter: a.counter } : {}),
    ...(a.group !== undefined ? { group: a.group } : {}),
    note: a.note,
    pinned: a.pinned,
    matchHosts: [...a.matchHosts],
    ...(a.lastUsedAt !== undefined ? { lastUsedAt: a.lastUsedAt } : {}),
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  };
}

function live(accounts: Account[]): StoredAccount[] {
  return accounts.filter((a) => a.deletedAt === undefined).map(store);
}

function head(): Head {
  return { format: BACKUP_FORMAT, version: 1, exportedAt: new Date().toISOString() };
}

export function buildPlainBackup(accounts: Account[]): string {
  const file: PlainFile = { ...head(), encrypted: false, accounts: live(accounts) };
  return JSON.stringify(file, null, 2);
}

export async function buildEncryptedBackup(
  accounts: Account[],
  password: string,
  params: Argon2Params = DEFAULT_ARGON2,
): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await argon2idKey(password, salt, params);
  const plain = new TextEncoder().encode(JSON.stringify({ accounts: live(accounts) }));
  const { iv, ciphertext } = await aesGcmEncrypt(key, plain);
  const file: EncryptedFile = {
    ...head(),
    encrypted: true,
    kdf: {
      name: 'argon2id',
      salt: toBase64(salt),
      iterations: params.iterations,
      memoryKiB: params.memoryKiB,
      parallelism: params.parallelism,
    },
    iv: toBase64(iv),
    data: toBase64(ciphertext),
  };
  return JSON.stringify(file, null, 2);
}

function parseHead(text: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(text);
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
    const obj = value as Record<string, unknown>;
    return obj.format === BACKUP_FORMAT ? obj : null;
  } catch {
    return null;
  }
}

export function isOwnBackup(text: string): boolean {
  return parseHead(text) !== null;
}

const TYPES: AccountType[] = ['totp', 'hotp', 'steam', 'battle'];
const ALGORITHMS: Algorithm[] = ['SHA-1', 'SHA-256', 'SHA-512'];

function str(value: unknown): string {
  if (typeof value !== 'string') throw new CorruptVaultError('invalid backup field');
  return value;
}

function num(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new CorruptVaultError('invalid backup field');
  }
  return value;
}

function restore(raw: unknown): Account {
  if (typeof raw !== 'object' || raw === null) throw new CorruptVaultError('invalid account');
  const o = raw as Record<string, unknown>;
  const type = o.type as AccountType;
  const algorithm = o.algorithm as Algorithm;
  if (!TYPES.includes(type) || !ALGORITHMS.includes(algorithm)) {
    throw new CorruptVaultError('invalid account');
  }
  if (!Array.isArray(o.matchHosts) || !o.matchHosts.every((h) => typeof h === 'string')) {
    throw new CorruptVaultError('invalid account');
  }
  let secret: Uint8Array;
  try {
    secret = decodeBase32(str(o.secret));
  } catch {
    throw new CorruptVaultError('invalid secret');
  }
  const account: Account = {
    id: str(o.id),
    type,
    issuer: str(o.issuer),
    label: str(o.label),
    secret,
    algorithm,
    digits: num(o.digits),
    period: num(o.period),
    ...(o.counter !== undefined ? { counter: num(o.counter) } : {}),
    ...(o.group !== undefined ? { group: str(o.group) } : {}),
    note: str(o.note),
    pinned: o.pinned === true,
    matchHosts: o.matchHosts as string[],
    ...(o.lastUsedAt !== undefined ? { lastUsedAt: num(o.lastUsedAt) } : {}),
    createdAt: num(o.createdAt),
    updatedAt: num(o.updatedAt),
  };
  try {
    checkDraft(account);
  } catch {
    throw new CorruptVaultError('invalid account');
  }
  return account;
}

function restoreAll(list: unknown): Account[] {
  if (!Array.isArray(list)) throw new CorruptVaultError('invalid accounts');
  return list.map(restore);
}

function kdfParams(raw: unknown): { salt: Uint8Array; params: Argon2Params } {
  if (typeof raw !== 'object' || raw === null) throw new CorruptVaultError('missing kdf');
  const k = raw as Record<string, unknown>;
  if (k.name !== 'argon2id') throw new CorruptVaultError('unsupported kdf');
  const params: Argon2Params = {
    iterations: num(k.iterations),
    memoryKiB: num(k.memoryKiB),
    parallelism: num(k.parallelism),
  };
  // 파일이 요구하는 비용에 상한을 둔다(악성 파일이 메모리를 다 쓰지 못하게).
  const ok =
    Number.isInteger(params.iterations) &&
    params.iterations >= 1 &&
    params.iterations <= 64 &&
    Number.isInteger(params.memoryKiB) &&
    params.memoryKiB >= 8 &&
    params.memoryKiB <= 1048576 &&
    Number.isInteger(params.parallelism) &&
    params.parallelism >= 1 &&
    params.parallelism <= 16 &&
    params.memoryKiB >= 8 * params.parallelism;
  if (!ok) throw new CorruptVaultError('invalid kdf parameters');
  try {
    return { salt: fromBase64(str(k.salt)), params };
  } catch {
    throw new CorruptVaultError('invalid kdf salt');
  }
}

export async function readOwnBackup(text: string, password?: string): Promise<Account[]> {
  const file = parseHead(text);
  if (!file || file.version !== 1) throw new CorruptVaultError('not a backup file');

  if (file.encrypted === false) return restoreAll(file.accounts);
  if (file.encrypted !== true) throw new CorruptVaultError('invalid backup file');

  if (password === undefined) throw new Error('needs password');
  const { salt, params } = kdfParams(file.kdf);
  let iv: Uint8Array;
  let data: Uint8Array;
  try {
    iv = fromBase64(str(file.iv));
    data = fromBase64(str(file.data));
  } catch {
    throw new CorruptVaultError('invalid backup encoding');
  }
  const key = await argon2idKey(password, salt, params);
  let plain: Uint8Array;
  try {
    plain = await aesGcmDecrypt(key, iv, data);
  } catch {
    // AES-GCM 은 틀린 키와 깨진 파일을 구별하지 못한다. 비밀번호가 틀린 것으로 본다.
    throw new WrongSecretError();
  }
  let inner: unknown;
  try {
    inner = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(plain));
  } catch {
    throw new CorruptVaultError('invalid backup contents');
  }
  if (typeof inner !== 'object' || inner === null) throw new CorruptVaultError('invalid backup contents');
  return restoreAll((inner as Record<string, unknown>).accounts);
}
