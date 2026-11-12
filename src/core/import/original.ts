// 원본 인증 도구 백업(평문 OTPStorage 맵, 암호화 v3, v1·v2 시도) 해석.
import { argon2id, argon2Verify } from 'hash-wasm';
import { algorithmFrom, makeDraft, type AccountDraft } from '../account';
import { decodeHex, parseSecret } from '../base32';
import { decryptOpenSslSalted, utf8Decode, WrongSecretError } from '../crypto';
import { splitTypePrefix } from '../otp';
import type { AccountType } from '../types';
import {
  asInt,
  asString,
  Collector,
  isObject,
  NeedsPasswordError,
  type ImportOutcome,
  type Json,
} from './types';

const ARGON2_MEMORY_KIB = 19456;
const ARGON2_ITERATIONS = 2;

export function isOriginalBackup(value: unknown): value is Json {
  if (!isObject(value)) return false;
  return Object.values(value).some(
    (v) =>
      isObject(v) &&
      (v.dataType === 'OTPStorage' || v.dataType === 'EncOTPStorage' || v.dataType === 'Key'),
  );
}

function needsPassword(map: Json): boolean {
  const values = Object.values(map).filter(isObject);
  return (
    values.some((v) => v.dataType === 'EncOTPStorage' || v.dataType === 'Key') ||
    isObject(map.key) ||
    values.some((v) => v.dataType === 'OTPStorage' && v.encrypted === true)
  );
}

// OTPStorage 항목 하나 → 초안. 실패는 예외.
function parseEntry(entry: Json): { draft: AccountDraft; pinned: boolean } {
  const typeName = asString(entry.type).toLowerCase();
  const split = splitTypePrefix(asString(entry.secret).trim());

  let type: AccountType;
  let secret: Uint8Array;
  switch (typeName) {
    case 'hex':
      type = 'totp';
      secret = decodeHex(split.rest);
      break;
    case 'hhex':
      type = 'hotp';
      secret = decodeHex(split.rest);
      break;
    case 'totp':
    case 'hotp':
    case 'battle':
    case 'steam':
      type = typeName;
      secret = parseSecret(split.rest);
      break;
    default:
      throw new Error(`unsupported type: ${typeName || 'none'}`);
  }
  if (split.type) type = split.type;

  const named = entry.algorithm;
  const algorithm =
    named === undefined || named === null || named === ''
      ? 'SHA-1'
      : algorithmFrom(typeof named === 'number' ? named : asString(named));

  const digits = asInt(entry.digits);
  const period = asInt(entry.period);
  const counter = asInt(entry.counter);
  const draft = makeDraft({
    type,
    issuer: asString(entry.issuer),
    label: asString(entry.account),
    secret,
    algorithm,
    ...(digits !== undefined ? { digits } : {}),
    ...(period !== undefined ? { period } : {}),
    ...(counter !== undefined ? { counter } : {}),
  });
  return { draft, pinned: entry.pinned === true };
}

function sourceOf(entry: Json): string {
  const issuer = asString(entry.issuer);
  const account = asString(entry.account);
  return issuer && account ? `${issuer}:${account}` : issuer || account || asString(entry.hash) || 'entry';
}

// 암호화 v3 의 키 항목 하나를 푼다. 비밀번호가 틀리면 null.
async function unlockKey(password: string, key: Json): Promise<string | null> {
  const salt = asString(key.salt);
  const hash = asString(key.hash);
  if (!salt || !hash) throw new Error('malformed key entry');
  const encoded = await argon2id({
    password,
    salt,
    iterations: ARGON2_ITERATIONS,
    memorySize: ARGON2_MEMORY_KIB,
    parallelism: 1,
    hashLength: 32,
    outputType: 'encoded',
  });
  const k = encoded.split('$')[5];
  if (!k) throw new Error('unexpected argon2 output');
  const ok = await argon2Verify({ password: k, hash });
  return ok ? k : null;
}

export async function parseOriginal(map: Json, password?: string): Promise<ImportOutcome> {
  if (needsPassword(map) && !password) throw new NeedsPasswordError();

  type Parsed = { draft: AccountDraft; pinned: boolean; index: number };
  const parsed: Parsed[] = [];
  const out = new Collector();

  const take = (entry: Json, fallbackIndex: number): void => {
    try {
      parsed.push({ ...parseEntry(entry), index: asInt(entry.index) ?? fallbackIndex });
    } catch (e) {
      out.fail(sourceOf(entry), e);
    }
  };

  const entries = Object.values(map).filter(isObject);

  // 평문 항목. v1·v2 의 encrypted:true 항목은 비밀키 칸만 OpenSSL 암호문이다.
  for (const [i, entry] of entries.entries()) {
    if (entry.dataType !== 'OTPStorage') continue;
    if (entry.encrypted !== true) {
      take(entry, i);
      continue;
    }
    try {
      const plain = utf8Decode(await decryptOpenSslSalted(asString(entry.secret), password!));
      take({ ...entry, secret: plain, encrypted: false }, i);
    } catch (e) {
      out.fail(sourceOf(entry), e);
    }
  }

  // v3: 키 항목 + EncOTPStorage
  const keys = new Map<string, Json>();
  for (const entry of entries) {
    if (entry.dataType === 'Key') keys.set(asString(entry.id), entry);
  }
  const encrypted = entries.filter((e) => e.dataType === 'EncOTPStorage');
  if (encrypted.length > 0 || keys.size > 0) {
    const unlocked = new Map<string, string | null>();
    for (const [id, key] of keys) {
      try {
        unlocked.set(id, key.version === 3 || key.version === undefined ? await unlockKey(password!, key) : null);
      } catch (e) {
        out.fail(`key ${id}`, e);
        unlocked.set(id, null);
      }
    }
    if (keys.size > 0 && ![...unlocked.values()].some((k) => k !== null)) {
      throw new WrongSecretError();
    }
    for (const [i, entry] of encrypted.entries()) {
      const source = `encrypted entry ${i + 1}`;
      const k = unlocked.get(asString(entry.keyId));
      if (!k) {
        out.fail(source, new Error('no matching key'));
        continue;
      }
      try {
        const plain: unknown = JSON.parse(utf8Decode(await decryptOpenSslSalted(asString(entry.data), k)));
        if (!isObject(plain)) throw new Error('decrypted data is not an entry');
        take(plain, asInt(entry.index) ?? i);
      } catch (e) {
        out.fail(source, e);
      }
    }
  }

  parsed.sort((a, b) => a.index - b.index);
  for (const p of parsed) out.add(p.draft, p.pinned ? { pinned: true } : {});
  return out.outcome(keys.size > 0 || encrypted.length > 0 ? 'original-encrypted' : 'original');
}
