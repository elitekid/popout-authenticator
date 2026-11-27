// Steam Desktop Authenticator(SDA) .maFile·manifest.json, Base64·Base32 어느 쪽으로 온 Steam 비밀키.
// 판별 규칙은 기준 확장 2FA Authenticator 1.16.3 import-formats.ts(MIT, Copyright (c) authenticator.sh)를 따랐다.
import { makeDraft } from '../account';
import { decodeBase32 } from '../base32';
import { asString, Collector, ImportRejectedError, isObject, type ImportOutcome, type Json } from './types';

export const SDA = 'Steam Desktop Authenticator';
const STEAM_SECRET_BYTES = 20;

function base32Bytes(value: string): Uint8Array | null {
  try {
    return decodeBase32(value);
  } catch {
    return null;
  }
}

// 줄바꿈·URL 안전 문자(-, _)를 받아 준다. 10바이트 미만은 키가 아니다.
function base64Bytes(value: string): Uint8Array | null {
  const text = value.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(text)) return null;
  const padded = text.replace(/=+$/, '');
  if (padded.length % 4 === 1) return null;
  let bin: string;
  try {
    bin = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  } catch {
    return null;
  }
  if (bin.length < 10) return null;
  return Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
}

// "ABCD EFGH …"·"ABCD-EFGH-…" 처럼 같은 길이(3~8)로 나눠 보여 주는 Base32.
function groupedBase32(value: string): boolean {
  const groups = value.trim().replace(/=+$/, '').split(/[\s-]+/);
  if (groups.length < 2 || !groups.every((g) => /^[A-Za-z2-7]+$/.test(g))) return false;
  const size = groups[0]!.length;
  return (
    size >= 3 &&
    size <= 8 &&
    groups.slice(0, -1).every((g) => g.length === size) &&
    groups[groups.length - 1]!.length <= size
  );
}

// maFile 은 Base64, 다른 앱은 Base32 로 준다. 두 표기가 겹칠 수 있어(+ / 0 1 8 9 가 없는 Base64)
// Steam 키 길이(20바이트: Base32 32자, Base64 27~28자)에 맞는 쪽을 고른다.
export function parseSteamSecret(value: string): Uint8Array {
  const b32 = base32Bytes(value);
  if (b32 && b32.length === STEAM_SECRET_BYTES) return b32;
  if (b32 && groupedBase32(value)) return b32;
  const b64 = base64Bytes(value);
  if (b64 && b64.length === STEAM_SECRET_BYTES) return b64;
  const found = b32 ?? b64;
  if (!found) throw new Error('secret is neither base32 nor base64');
  return found;
}

// SDA 가 암호화한 maFile: JSON 이 아니라 AES 블록 단위 Base64 한 덩어리. 다른 앱의 암호 파일과 헷갈리지 않게 파일 이름도 본다.
export function isEncryptedMaFile(text: string, fileName?: string): boolean {
  if (!fileName || !/\.mafile$/i.test(fileName.trim())) return false;
  const body = text.replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(body) || body.length % 4 !== 0) return false;
  const bytes = (body.length / 4) * 3 - (body.match(/=*$/)?.[0].length ?? 0);
  return bytes >= 64 && bytes % 16 === 0;
}

export function isMaFile(file: Json): boolean {
  return typeof file.shared_secret === 'string' && 'account_name' in file;
}

// manifest.json 은 비밀키가 없고 maFile 목록만 있다. encrypted 가 있어 Bitwarden 보다 먼저 본다.
export function isSteamManifest(file: Json): boolean {
  return (
    typeof file.encrypted === 'boolean' &&
    Array.isArray(file.entries) &&
    file.entries.some((e) => isObject(e) && typeof e.filename === 'string' && /\.mafile$/i.test(e.filename))
  );
}

// identity_secret·revocation_code·세션 같은 다른 값은 읽지 않는다.
export function parseMaFile(file: Json): ImportOutcome {
  const out = new Collector();
  const label = asString(file.account_name).trim();
  try {
    out.add(
      makeDraft({
        type: 'steam',
        issuer: 'Steam',
        label,
        secret: parseSteamSecret(asString(file.shared_secret)),
        algorithm: 'SHA-1',
      }),
    );
  } catch (e) {
    out.fail(label || 'Steam', e);
  }
  return out.outcome('steam-mafile');
}

export function rejectSteamManifest(file: Json): never {
  throw new ImportRejectedError(file.encrypted === true ? 'encrypted' : 'steamManifest', SDA);
}
