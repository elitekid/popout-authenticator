// Red Hat FreeOTP 의 백업(FreeOTP+ JSON 은 apps.ts).
// - FreeOTP 2: 늘 비밀번호가 걸린 Java 직렬화 HashMap<String,String>(이름은 .xml).
//   masterKey(JSON): PBKDF2(mAlgorithm·mSalt·mIterations) 로 만든 AES 키가 mEncryptedKey 를 연다(AES-GCM,
//   nonce 는 DER 로 적은 mParameters, mToken 을 덧붙인 인증 데이터로). "<id>-token" 은 비밀키 없는 토큰 JSON,
//   "<id>" 는 {key: "<JSON>"} 로 그 토큰의 비밀키가 마스터 키로 같은 방식으로 봉인돼 있다.
// - FreeOTP 1.x: 같은 토큰을 안드로이드 설정 파일(shared_prefs/tokens.xml)에 평문으로 둔다.
// 형식 해석은 기준 확장 2FA Authenticator 1.16.3 freeotp.ts(MIT, Copyright (c) authenticator.sh)를 따랐다.
import { algorithmFrom, makeDraft, type AccountDraft } from '../account';
import { aesGcmOpen, pbkdf2Key, WrongSecretError } from '../crypto';
import { asInt, asString, Collector, ImportRejectedError, isObject, NeedsPasswordError, type ImportOutcome, type Json } from './types';

const APP = 'FreeOTP';
const STREAM_MAGIC = 0xaced;
const STREAM_VERSION = 5;
const TC_NULL = 0x70;
const TC_REFERENCE = 0x71;
const TC_CLASSDESC = 0x72;
const TC_OBJECT = 0x73;
const TC_STRING = 0x74;
const TC_BLOCKDATA = 0x77;
const TC_ENDBLOCKDATA = 0x78;
const TC_LONGSTRING = 0x7c;
const BASE_HANDLE = 0x7e0000;
const PRIMITIVE_SIZE: Record<string, number> = { B: 1, C: 2, D: 8, F: 4, I: 4, J: 8, S: 2, Z: 1 };
// 파일이 정하는 반복 수: 지나치면 멈춘 것처럼 보인다.
const MAX_ITERATIONS = 5_000_000;
const MAX_ENTRIES = 10_000;
const KDF_HASH: Record<string, 'SHA-1' | 'SHA-512'> = {
  PBKDF2withHmacSHA1: 'SHA-1',
  PBKDF2withHmacSHA512: 'SHA-512',
};

const name = (issuer: string, label: string) => (issuer && label ? `${issuer}:${label}` : issuer || label || 'entry');

// Java 의 부호 있는 바이트 배열.
function javaBytes(value: unknown): Uint8Array {
  if (!Array.isArray(value) || !value.every((b) => Number.isInteger(b) && b >= -128 && b <= 255)) {
    throw new Error('not a byte array');
  }
  return Uint8Array.from(value as number[], (b) => b & 0xff);
}

// FreeOTP·FreeOTP+ 토큰 하나. Steam 종류가 없어 발급자가 "Steam" 인 TOTP 를 Steam 으로 본다(Aegis 와 같다).
export function freeOtpTokenDraft(t: Json, secret?: Uint8Array): { draft: AccountDraft; source: string } | { error: unknown; source: string } {
  const issuer = asString(t.issuerExt) || asString(t.issuerInt);
  const label = asString(t.label);
  const source = name(issuer, label);
  try {
    const raw = asString(t.type).toLowerCase() || 'totp';
    if (raw !== 'totp' && raw !== 'hotp') throw new Error(`unsupported type: ${raw}`);
    const type = raw === 'totp' && issuer === 'Steam' ? 'steam' : raw;
    const digits = asInt(t.digits);
    const period = asInt(t.period);
    const counter = asInt(t.counter);
    const algo = t.algo;
    const draft = makeDraft({
      type,
      issuer,
      label,
      secret: secret ?? javaBytes(t.secret),
      algorithm: algo === undefined || algo === null || algo === '' ? 'SHA-1' : algorithmFrom(asString(algo)),
      ...(digits !== undefined ? { digits } : {}),
      ...(period !== undefined ? { period } : {}),
      ...(counter !== undefined ? { counter } : {}),
    });
    return { draft, source };
  } catch (error) {
    return { error, source };
  }
}

// tokenOrder(JSON 배열) 순서, 빠진 것은 뒤에.
// FreeOTP 2 는 항목마다 "<id>"(봉인 키)·"<id>-token"(설정) 두 키라 id 로 묶는다. 한쪽만 있어도 id 로 남겨 실패로 보인다.
// FreeOTP 1.x 는 키가 "발급자:이름" 그대로라 -token 으로 끝나는 이름도 계정이다.
function inOrder(map: Map<string, string>, paired: boolean): string[] {
  const keys = [...map.keys()].filter((k) => k !== 'masterKey' && k !== 'tokenOrder');
  // id 자체가 -token 으로 끝나도("a-token" + "a-token-token") 짝을 먼저 보고 묶는다.
  const pairedId = (k: string): string | null => {
    if (map.has(`${k}-token`)) return k;
    if (!k.endsWith('-token')) return k;
    const base = k.slice(0, -'-token'.length);
    return map.has(base) ? null : base;
  };
  const ids = paired
    ? [...new Set(keys.map(pairedId).filter((k): k is string => k !== null))]
    : keys;
  let order: unknown = null;
  try {
    order = JSON.parse(map.get('tokenOrder') ?? 'null');
  } catch {
    // 순서는 덤이다.
  }
  if (!Array.isArray(order)) return ids;
  const rank = new Map(order.map((id, i) => [String(id), i]));
  return ids
    .map((id, i) => ({ id, i, r: rank.get(id) ?? Number.MAX_SAFE_INTEGER }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.id);
}

function parseObject(json: string | undefined): Json | null {
  if (json === undefined) return null;
  try {
    const value: unknown = JSON.parse(json);
    return isObject(value) ? value : null;
  } catch {
    return null;
  }
}

function xmlText(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|quot|apos|lt|gt|amp);/gi, (_, entity: string) => {
    const lower = entity.toLowerCase();
    try {
      if (lower.startsWith('#x')) return String.fromCodePoint(parseInt(lower.slice(2), 16));
      if (lower.startsWith('#')) return String.fromCodePoint(parseInt(lower.slice(1), 10));
    } catch {
      return '';
    }
    return ({ quot: '"', apos: "'", lt: '<', gt: '>', amp: '&' } as Record<string, string>)[lower] ?? '';
  });
}

export function isFreeOtpPreferences(text: string): boolean {
  return /^\s*(<\?xml[^>]*>\s*)?<map\s*>/.test(text);
}

// FreeOTP 1.x tokens.xml. 다른 앱의 설정 파일이면 null(다음 형식을 본다).
export function parseFreeOtpPreferences(text: string): ImportOutcome | null {
  if (!isFreeOtpPreferences(text)) return null;
  const map = new Map<string, string>();
  for (const m of text.matchAll(/<string name="([^"]*)">([\s\S]*?)<\/string>/g)) {
    map.set(xmlText(m[1]!), xmlText(m[2]!));
  }
  const out = new Collector();
  let tokens = 0;
  for (const key of inOrder(map, false)) {
    const token = parseObject(map.get(key));
    if (!token || !('secret' in token)) continue;
    tokens++;
    const r = freeOtpTokenDraft(token);
    if ('draft' in r) out.add(r.draft);
    else out.fail(r.source, r.error);
  }
  if (tokens === 0) return null;
  return out.outcome('freeotp');
}

// ---- FreeOTP 2 ----

export function isFreeOtpBackup(bytes: Uint8Array): boolean {
  if (bytes.length < 24 || ((bytes[0]! << 8) | bytes[1]!) !== STREAM_MAGIC) return false;
  const len = (bytes[6]! << 8) | bytes[7]!;
  if (8 + len > bytes.length) return false;
  const cls = modifiedUtf8(bytes.subarray(8, 8 + len));
  return bytes[4] === TC_OBJECT && bytes[5] === TC_CLASSDESC && cls === 'java.util.HashMap';
}

type Sealed = { cipherText: Uint8Array; nonce: Uint8Array; tagLength: number; additionalData: Uint8Array };

function readSealed(value: unknown): Sealed {
  if (!isObject(value) || value.mCipher !== 'AES/GCM/NoPadding') throw new Error('unexpected cipher');
  const { nonce, tagLength } = gcmParameters(javaBytes(value.mParameters));
  return {
    cipherText: javaBytes(value.mCipherText),
    nonce,
    tagLength,
    additionalData: new TextEncoder().encode(asString(value.mToken)),
  };
}

function openSealed(sealed: Sealed, key: Uint8Array): Promise<Uint8Array> {
  return aesGcmOpen(key, sealed.nonce, sealed.cipherText, {
    additionalData: sealed.additionalData,
    tagLength: sealed.tagLength,
  });
}

// Java GCMParameters: SEQUENCE { OCTET STRING nonce, INTEGER tagBytes }(없으면 12바이트). 맨 nonce(0x04)만 있으면 128비트.
export function gcmParameters(der: Uint8Array): { nonce: Uint8Array; tagLength: number } {
  let pos = 0;
  const header = () => {
    if (pos + 2 > der.length) throw new Error('truncated parameters');
    const tag = der[pos++]!;
    let length = der[pos++]!;
    if (length & 0x80) {
      let size = length & 0x7f;
      if (size > 2) throw new Error('parameters too long');
      for (length = 0; size > 0; size--) {
        if (pos >= der.length) throw new Error('truncated parameters');
        length = (length << 8) | der[pos++]!;
      }
    }
    if (pos + length > der.length) throw new Error('truncated parameters');
    return { tag, length };
  };
  const value = (length: number) => der.subarray(pos, (pos += length));

  let { tag, length } = header();
  if (tag === 0x04) return { nonce: value(length), tagLength: 128 };
  if (tag !== 0x30) throw new Error('unexpected parameters');
  ({ tag, length } = header());
  if (tag !== 0x04) throw new Error('no nonce in parameters');
  const nonce = value(length);
  let tagBytes = 12;
  if (pos < der.length) {
    ({ tag, length } = header());
    if (tag === 0x02) tagBytes = value(length).reduce((n, b) => (n << 8) | b, 0);
  }
  if (![12, 13, 14, 15, 16].includes(tagBytes)) throw new Error('unsupported tag length');
  if (nonce.length < 1) throw new Error('empty nonce');
  return { nonce, tagLength: tagBytes * 8 };
}

// Java 의 "수정 UTF-8": NUL 이 2바이트, U+FFFF 너머는 UTF-16 반쪽 둘을 3바이트씩.
function modifiedUtf8(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; ) {
    const a = bytes[i++]!;
    let unit: number;
    if (a < 0x80) unit = a;
    else if ((a & 0xe0) === 0xc0) unit = ((a & 0x1f) << 6) | ((bytes[i++] ?? 0) & 0x3f);
    else unit = ((a & 0x0f) << 12) | (((bytes[i++] ?? 0) & 0x3f) << 6) | ((bytes[i++] ?? 0) & 0x3f);
    out += String.fromCharCode(unit);
  }
  return out;
}

// java.util.HashMap<String,String> 하나만 읽는다. 다른 것이 나오면 오류.
export function readSerializedStringMap(bytes: Uint8Array): Map<string, string> {
  let pos = 0;
  const handles: unknown[] = [];
  const need = (n: number) => {
    if (pos + n > bytes.length) throw new Error('truncated');
  };
  const u8 = () => {
    need(1);
    return bytes[pos++]!;
  };
  const u16 = () => (u8() << 8) | u8();
  const u32 = () => ((u16() << 16) | u16()) >>> 0;
  const utf = (length: number) => {
    need(length);
    const text = modifiedUtf8(bytes.subarray(pos, pos + length));
    pos += length;
    return text;
  };

  if (u16() !== STREAM_MAGIC || u16() !== STREAM_VERSION) throw new Error('not a Java object stream');
  if (u8() !== TC_OBJECT || u8() !== TC_CLASSDESC) throw new Error('not an object');
  if (utf(u16()) !== 'java.util.HashMap') throw new Error('not a HashMap');
  need(8);
  pos += 8; // serialVersionUID
  handles.push('class');
  u8(); // flags
  let fieldBytes = 0;
  for (let fields = u16(); fields > 0; fields--) {
    const size = PRIMITIVE_SIZE[String.fromCharCode(u8())];
    if (!size) throw new Error('unexpected field');
    utf(u16());
    fieldBytes += size;
  }
  if (u8() !== TC_ENDBLOCKDATA || u8() !== TC_NULL) throw new Error('unexpected class');
  handles.push('map');
  need(fieldBytes);
  pos += fieldBytes; // loadFactor, threshold

  if (u8() !== TC_BLOCKDATA || u8() !== 8) throw new Error('unexpected map header');
  u32(); // capacity
  const size = u32();
  if (size > MAX_ENTRIES * 2 + 2) throw new Error('too many entries');

  const string = (): string => {
    const tag = u8();
    if (tag === TC_REFERENCE) {
      const value = handles[u32() - BASE_HANDLE];
      if (typeof value !== 'string') throw new Error('bad reference');
      return value;
    }
    let text: string;
    if (tag === TC_STRING) text = utf(u16());
    else if (tag === TC_LONGSTRING) {
      if (u32() !== 0) throw new Error('string too long');
      text = utf(u32());
    } else throw new Error('not a string');
    handles.push(text);
    return text;
  };

  const map = new Map<string, string>();
  for (let i = 0; i < size; i++) {
    const key = string();
    map.set(key, string());
  }
  return map;
}

// 틀린 비밀번호는 WrongSecretError, 모양이 다르면 ImportRejectedError('damaged').
export async function parseFreeOtpBackup(bytes: Uint8Array, password?: string): Promise<ImportOutcome> {
  let map: Map<string, string>;
  let master: Sealed;
  let kdf: { hash: 'SHA-1' | 'SHA-512' | undefined; salt: Uint8Array; iterations: number };
  try {
    map = readSerializedStringMap(bytes);
    const m = JSON.parse(map.get('masterKey') ?? '') as unknown;
    if (!isObject(m)) throw new Error('no master key');
    master = readSealed(m.mEncryptedKey);
    kdf = { hash: KDF_HASH[asString(m.mAlgorithm)], salt: javaBytes(m.mSalt), iterations: Number(m.mIterations) };
  } catch (e) {
    throw new ImportRejectedError('damaged', APP, e instanceof Error ? e.message : undefined);
  }
  if (!kdf.hash) throw new ImportRejectedError('damaged', APP, 'unknown key derivation');
  if (!Number.isInteger(kdf.iterations) || kdf.iterations < 1 || kdf.iterations > MAX_ITERATIONS) {
    throw new ImportRejectedError('damaged', APP, `iterations ${kdf.iterations}`);
  }
  if (!password) throw new NeedsPasswordError();

  const passwordKey = await pbkdf2Key(password, kdf.salt, kdf.iterations, kdf.hash);
  let masterKey: Uint8Array;
  try {
    masterKey = await openSealed(master, passwordKey);
  } catch {
    throw new WrongSecretError();
  }
  if (![16, 24, 32].includes(masterKey.length)) throw new ImportRejectedError('damaged', APP, 'master key length');

  const out = new Collector();
  for (const id of inOrder(map, true)) {
    const token = parseObject(map.get(`${id}-token`));
    const sealed = parseObject(map.get(id));
    if (!token || !sealed) {
      out.fail(id, new Error('entry is incomplete'));
      continue;
    }
    let secret: Uint8Array;
    try {
      secret = await openSealed(readSealed(JSON.parse(asString(sealed.key))), masterKey);
    } catch (e) {
      // 마스터 키는 열렸으니 이 항목 하나가 손상된 것이다.
      out.fail(name(asString(token.issuerExt) || asString(token.issuerInt), asString(token.label)), e);
      continue;
    }
    const r = freeOtpTokenDraft(token, secret);
    if ('draft' in r) out.add(r.draft);
    else out.fail(r.source, r.error);
  }
  return out.outcome('freeotp2');
}
