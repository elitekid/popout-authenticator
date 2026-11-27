// 비밀번호를 건 Aegis·2FAS 백업을 그 비밀번호로 연다. 비밀번호는 여는 데만 쓰고 남기지 않는다.
// 열면 평문 백업과 같은 모양을 돌려줘 apps.ts 의 해석을 그대로 탄다.
//
// 형식(기준 확장 2FA Authenticator 1.16.3 sealed-backups.ts, MIT, Copyright (c) authenticator.sh 를 참고):
// - Aegis: db 는 볼트 JSON 을 임의 마스터 키로 AES-GCM 한 Base64(nonce·tag 는 header.params).
//   header.slots 의 비밀번호 칸(type 1)마다 그 마스터 키가 scrypt(비밀번호, salt, n, r, p) 키로 AES-GCM 돼 있다.
//   다른 종류 칸은 폰 키 저장소의 키로만 열린다.
// - 2FAS: servicesEncrypted 는 "암호문+태그:salt:iv"(각 Base64), PBKDF2-HMAC-SHA256(비밀번호, salt, 10000) 키로 AES-GCM,
//   안에는 services 배열. reference 는 2FAS 가 비밀번호를 확인하는 값이라 여기서는 GCM 태그가 그 일을 한다.
import { aesGcmOpen, fromBase64, pbkdf2Key, scryptKey, utf8Decode, utf8Encode, WrongSecretError } from '../crypto';
import { ImportRejectedError, isObject, NeedsPasswordError, type Json } from './types';

const AEGIS_PASSWORD_SLOT = 1;
const TWOFAS_ITERATIONS = 10_000;
// 파일이 정하는 scrypt 값의 상한. Aegis 는 N=2^15, r=8, p=1(32MB)을 쓴다. 메모리 4배·작업 32배까지 받는다.
const MAX_SCRYPT_MEMORY = 128 * 1024 * 1024;
const MAX_SCRYPT_WORK = 32 * 128 * 8 * 32768; // 파일 하나의 모든 비밀번호 칸을 더한 값
// r·p 가 크면 n 과 따로 128·r·p 바이트를 더 잡는다. 표준 값과 거리가 먼 값은 받지 않는다.
const MAX_SCRYPT_R = 32;
const MAX_SCRYPT_P = 64;
const MAX_AEGIS_SLOTS = 8;

export function isSealedAegis(file: Json): boolean {
  return isObject(file.header) && typeof file.db === 'string';
}

export function isSealed2fas(file: Json): boolean {
  const services = Array.isArray(file.services) ? file.services : [];
  return services.length === 0 && typeof file.servicesEncrypted === 'string' && file.servicesEncrypted !== '';
}

function hex(value: unknown): Uint8Array {
  if (typeof value !== 'string' || value.length === 0 || !/^(?:[0-9a-f]{2})+$/i.test(value)) {
    throw new Error('expected hex');
  }
  const out = new Uint8Array(value.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(value.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a);
  out.set(b, a.length);
  return out;
}

async function tryOpen(key: Uint8Array, iv: Uint8Array, data: Uint8Array): Promise<Uint8Array | null> {
  try {
    return await aesGcmOpen(key, iv, data);
  } catch {
    return null;
  }
}

function parseJson(bytes: Uint8Array): unknown {
  try {
    return JSON.parse(utf8Decode(bytes));
  } catch {
    return undefined;
  }
}

type Slot = { key: Uint8Array; nonce: Uint8Array; salt: Uint8Array; n: number; r: number; p: number };

export function scryptWithinBounds({ n, r, p }: { n: number; r: number; p: number }): boolean {
  if (![n, r, p].every((v) => Number.isSafeInteger(v) && v >= 1)) return false;
  if (n < 2 || (n & (n - 1)) !== 0 || n > 2 ** 30 || r > MAX_SCRYPT_R || p > MAX_SCRYPT_P) return false;
  return 128 * r * n <= MAX_SCRYPT_MEMORY && 128 * r * n * p <= MAX_SCRYPT_WORK;
}

// 열린 db 를 넣은 같은 파일. 틀린 비밀번호는 WrongSecretError, 모양이 다르거나 손상은 ImportRejectedError('damaged').
export async function openAegis(file: Json, password?: string): Promise<Json> {
  let slots: Slot[];
  let sealed: { data: Uint8Array; nonce: Uint8Array };
  try {
    const header = file.header as Json;
    const params = isObject(header.params) ? header.params : {};
    slots = (Array.isArray(header.slots) ? header.slots : [])
      .filter((s): s is Json => isObject(s) && s.type === AEGIS_PASSWORD_SLOT)
      .map((s) => {
        const kp = isObject(s.key_params) ? s.key_params : {};
        return {
          key: concat(hex(s.key), hex(kp.tag)),
          nonce: hex(kp.nonce),
          salt: hex(s.salt),
          n: Number(s.n),
          r: Number(s.r),
          p: Number(s.p),
        };
      });
    sealed = { data: concat(fromBase64(String(file.db)), hex(params.tag)), nonce: hex(params.nonce) };
  } catch (e) {
    throw new ImportRejectedError('damaged', 'Aegis', e instanceof Error ? e.message : undefined);
  }
  // 비밀번호 칸이 없으면 폰 키 저장소로만 열린다. Aegis 내보내기에는 늘 비밀번호 칸이 있다.
  if (slots.length === 0) throw new ImportRejectedError('damaged', 'Aegis', 'no password slot');
  if (slots.length > MAX_AEGIS_SLOTS) throw new ImportRejectedError('damaged', 'Aegis', 'too many slots');
  for (const slot of slots) {
    if (!scryptWithinBounds(slot)) {
      throw new ImportRejectedError('damaged', 'Aegis', `scrypt n=${slot.n} r=${slot.r} p=${slot.p}`);
    }
  }
  // 틀린 비밀번호는 모든 칸을 돌므로 칸마다가 아니라 합으로 막는다.
  if (slots.reduce((sum, s) => sum + 128 * s.r * s.n * s.p, 0) > MAX_SCRYPT_WORK) {
    throw new ImportRejectedError('damaged', 'Aegis', 'scrypt work over all slots');
  }
  if (!password) throw new NeedsPasswordError();

  // 비밀번호가 여럿일 수 있다(백업 전용 비밀번호 등). 어느 것이든 열면 된다.
  const pw = utf8Encode(password);
  let master: Uint8Array | null = null;
  for (const slot of slots) {
    const derived = await scryptKey(pw, slot.salt, slot.n, slot.r, slot.p);
    master = await tryOpen(derived, slot.nonce, slot.key);
    if (master) break;
  }
  if (!master) throw new WrongSecretError();

  // 마스터 키가 열렸는데 볼트가 안 열리면 비밀번호가 아니라 파일이 손상된 것이다.
  const plain = await tryOpen(master, sealed.nonce, sealed.data);
  const db = plain ? parseJson(plain) : undefined;
  if (!isObject(db)) throw new ImportRejectedError('damaged', 'Aegis', 'vault does not open with its key');
  return { ...file, db };
}

// 열린 services 를 넣은 같은 파일(servicesEncrypted·reference 는 뺀다).
export async function open2fas(file: Json, password?: string): Promise<Json> {
  let data: Uint8Array;
  let salt: Uint8Array;
  let iv: Uint8Array;
  try {
    const parts = String(file.servicesEncrypted).split(':');
    if (parts.length < 3) throw new Error(`${parts.length} parts`);
    [data, salt, iv] = parts.slice(0, 3).map((part) => fromBase64(part)) as [Uint8Array, Uint8Array, Uint8Array];
    if (data.length < 17 || salt.length < 1 || iv.length < 1) throw new Error('short field');
  } catch (e) {
    throw new ImportRejectedError('damaged', '2FAS', e instanceof Error ? e.message : undefined);
  }
  if (!password) throw new NeedsPasswordError();
  const key = await pbkdf2Key(password, salt, TWOFAS_ITERATIONS, 'SHA-256');
  // 목록 전체가 한 키라 태그가 안 맞으면 거의 틀린 비밀번호다.
  const plain = await tryOpen(key, iv, data);
  if (!plain) throw new WrongSecretError();
  const services = parseJson(plain);
  if (!Array.isArray(services)) throw new ImportRejectedError('damaged', '2FAS', 'services are not a list');
  const { servicesEncrypted: _sealed, reference: _reference, ...rest } = file;
  return { ...rest, services };
}
