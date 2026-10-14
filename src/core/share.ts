// 코드 공유 링크 봉투 만들기·풀기. 받는 쪽 정적 페이지가 같은 파일을 빌드해 쓴다.
// 비밀키는 봉투에 넣지 않는다(미래 코드만). 브라우저 API 를 쓰지 않는다.
//
// 봉투(base64url, '#' 없이): [버전 1][flags 1: bit0 비밀번호][링크 고유 16][nonce 12][AES-GCM 암호문]
// 페이로드: period(2 BE) digits(1) 첫 counter(4 BE) 코드 수(2 BE)
//           issuer 길이(1)+UTF-8, name 길이(1)+UTF-8, 코드들(⌈log2(10^digits)⌉ 비트씩, MSB 먼저)
import type { AccountDraft } from './account';
import {
  CorruptVaultError,
  fromBase64Url,
  hkdfKey,
  pbkdf2Key,
  randomBytes,
  toBase64Url,
  WrongSecretError,
} from './crypto';
import { concat, utf8Encode } from './crypto/bytes';
import { generateCode, totpCounter } from './otp';

// 받는 쪽 페이지 주소(2026-10-13 결정): 출시용 공개 저장소의 GitHub Pages. 비어 있으면 호출자가 base 를 넘겨야 한다.
export const SHARE_PAGE_URL = 'https://elitekid.github.io/popout-authenticator/share/';

export const MAX_SHARE_SECONDS = 3600;
export const MIN_SHARE_SECONDS = 300;
// 공유 창에서 고르는 열리는 시간(초)
export const SHARE_DURATIONS = [300, 900, 1800, 3600] as const;

const VERSION = 1;
const FLAG_PASSWORD = 1;
const LINK_ID_BYTES = 16;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const HEADER_BYTES = 2 + LINK_ID_BYTES + NONCE_BYTES;
const FIELD_MAX_BYTES = 64;

// 키 유도와 봉투는 기준 확장(2FA Authenticator, MIT)의 share.ts 와 같다. 그 시험 벡터로 확인한다.
// 비밀번호 없음: HKDF-SHA256(링크 고유 16바이트, salt 없음, info), 있음: PBKDF2-SHA256(NFKC 비밀번호, 링크 고유 16바이트).
// AES-256-GCM 의 추가 인증 데이터는 머리 2바이트(버전·flags).
const HKDF_INFO = 'authenticator.sh/s v1';
const PBKDF2_ITERATIONS = 600_000;

export type OpenedShare = {
  issuer: string;
  name: string;
  period: number;
  digits: number;
  firstCounter: number;
  codes: string[];
};

async function shareKey(linkId: Uint8Array, password: string | undefined): Promise<Uint8Array> {
  return password
    ? pbkdf2Key(password.normalize('NFKC'), linkId, PBKDF2_ITERATIONS)
    : hkdfKey(linkId, new Uint8Array(0), HKDF_INFO);
}

async function gcm(
  mode: 'encrypt' | 'decrypt',
  key: Uint8Array,
  nonce: Uint8Array,
  aad: Uint8Array,
  data: Uint8Array,
): Promise<Uint8Array> {
  const k = await globalThis.crypto.subtle.importKey('raw', key as BufferSource, 'AES-GCM', false, [mode]);
  const params = { name: 'AES-GCM', iv: nonce as BufferSource, additionalData: aad as BufferSource };
  return new Uint8Array(await globalThis.crypto.subtle[mode](params, k, data as BufferSource));
}

function bitsFor(digits: number): number {
  let bits = 0;
  while (2 ** bits < 10 ** digits) bits++;
  return bits;
}

// 코드 점 경계에서 UTF-8 64바이트 이하로 자른다.
function clip(text: string): Uint8Array {
  let out = '';
  let size = 0;
  for (const ch of text) {
    const n = utf8Encode(ch).length;
    if (size + n > FIELD_MAX_BYTES) break;
    out += ch;
    size += n;
  }
  return utf8Encode(out);
}

export function shareCodeCount(period: number, durationSec: number): number {
  return Math.ceil(durationSec / period);
}

export async function createShareFragment(
  account: AccountDraft,
  nowMs: number,
  durationSec: number,
  password?: string,
): Promise<string> {
  if (account.type !== 'totp') throw new Error('only totp accounts can be shared');
  if (!Number.isInteger(durationSec) || durationSec < MIN_SHARE_SECONDS || durationSec > MAX_SHARE_SECONDS) {
    throw new RangeError(`duration must be ${MIN_SHARE_SECONDS}~${MAX_SHARE_SECONDS} seconds`);
  }
  const { period, digits } = account;
  const current = totpCounter(nowMs, period);
  // 시계가 조금 어긋난 받는 쪽을 위해 지금 칸 바로 앞 칸부터 담는다.
  const first = Math.max(0, current - 1);
  // 받는 쪽 페이지는 한 시간 + 앞 칸 하나를 넘는 묶음을 거절한다(기준과 같은 상한).
  const end = Math.min(current + shareCodeCount(period, durationSec), first + Math.floor(MAX_SHARE_SECONDS / period) + 1);
  const count = end - first;

  const bits = bitsFor(digits);
  const packed = new Uint8Array(Math.ceil((count * bits) / 8));
  let bitPos = 0;
  for (let i = 0; i < count; i++) {
    const value = Number(await generateCode(account, nowMs, 0, first - current + i));
    for (let b = bits - 1; b >= 0; b--) {
      if (Math.floor(value / 2 ** b) % 2 === 1) packed[bitPos >> 3]! |= 0x80 >> (bitPos & 7);
      bitPos++;
    }
  }

  const issuer = clip(account.issuer);
  const name = clip(account.label);
  const head = new Uint8Array(9);
  const view = new DataView(head.buffer);
  view.setUint16(0, period);
  head[2] = digits;
  view.setUint32(3, first);
  view.setUint16(7, count);
  const payload = concat(head, Uint8Array.of(issuer.length), issuer, Uint8Array.of(name.length), name, packed);

  const linkId = randomBytes(LINK_ID_BYTES);
  const key = await shareKey(linkId, password);
  const nonce = randomBytes(NONCE_BYTES);
  const header = Uint8Array.of(VERSION, password ? FLAG_PASSWORD : 0);
  const sealed = await gcm('encrypt', key, nonce, header, payload);
  return toBase64Url(concat(header, linkId, nonce, sealed));
}

export function buildShareLink(base: string, fragment: string): string {
  if (base === '') throw new Error('share page address is not set');
  return `${base}#${fragment}`;
}

export async function openShareFragment(fragment: string, password?: string): Promise<OpenedShare> {
  let bytes: Uint8Array;
  try {
    bytes = fromBase64Url(fragment.replace(/^#/, '').trim());
  } catch {
    throw new CorruptVaultError('invalid share link');
  }
  if (bytes.length < HEADER_BYTES + TAG_BYTES) throw new CorruptVaultError('share link too short');
  if (bytes[0] !== VERSION) throw new CorruptVaultError('unsupported share link version');
  const hasPassword = (bytes[1]! & FLAG_PASSWORD) !== 0;
  if (hasPassword && !password) throw new Error('needs password');

  const linkId = bytes.slice(2, 2 + LINK_ID_BYTES);
  const nonce = bytes.slice(2 + LINK_ID_BYTES, HEADER_BYTES);
  const key = await shareKey(linkId, hasPassword ? password : undefined);
  let payload: Uint8Array;
  try {
    payload = await gcm('decrypt', key, nonce, bytes.slice(0, 2), bytes.slice(HEADER_BYTES));
  } catch {
    if (hasPassword) throw new WrongSecretError();
    throw new CorruptVaultError('share link cannot be opened');
  }
  return parsePayload(payload);
}

function parsePayload(p: Uint8Array): OpenedShare {
  const bad = () => new CorruptVaultError('invalid share payload');
  if (p.length < 11) throw bad();
  const view = new DataView(p.buffer, p.byteOffset, p.byteLength);
  const period = view.getUint16(0);
  const digits = p[2]!;
  const firstCounter = view.getUint32(3);
  const count = view.getUint16(7);
  if (period < 1 || period > 3600 || digits < 6 || digits > 10) throw bad();

  const decoder = new TextDecoder('utf-8', { fatal: true });
  let pos = 9;
  const text = (): string => {
    if (pos >= p.length) throw bad();
    const len = p[pos++]!;
    if (pos + len > p.length) throw bad();
    const out = decoder.decode(p.subarray(pos, pos + len));
    pos += len;
    return out;
  };
  let issuer: string;
  let name: string;
  try {
    issuer = text();
    name = text();
  } catch (e) {
    throw e instanceof CorruptVaultError ? e : bad();
  }

  const bits = bitsFor(digits);
  if (p.length !== pos + Math.ceil((count * bits) / 8)) throw bad();
  const codes: string[] = [];
  let bitPos = pos * 8;
  for (let i = 0; i < count; i++) {
    let value = 0;
    for (let b = 0; b < bits; b++) {
      value = value * 2 + ((p[bitPos >> 3]! >> (7 - (bitPos & 7))) & 1);
      bitPos++;
    }
    if (value >= 10 ** digits) throw bad();
    codes.push(String(value).padStart(digits, '0'));
  }
  return { issuer, name, period, digits, firstCounter, codes };
}

export function codeAt(opened: OpenedShare, nowMs: number): string | null {
  const index = totpCounter(nowMs, opened.period) - opened.firstCounter;
  return index >= 0 && index < opened.codes.length ? opened.codes[index]! : null;
}
