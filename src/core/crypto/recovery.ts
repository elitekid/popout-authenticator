// 복구 코드: 160비트 무작위 → Crockford Base32 32글자(5비트씩 그대로라 편향 없음).
import { randomBytes } from './bytes';

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function encodeBase32(bytes: Uint8Array): string {
  let out = '';
  let bits = 0;
  let acc = 0;
  for (const b of bytes) {
    acc = (acc << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(acc >> (bits - 5)) & 31];
      bits -= 5;
    }
    acc &= (1 << bits) - 1;
  }
  return out;
}

function decodeBase32(text: string): Uint8Array {
  const out = new Uint8Array(Math.floor((text.length * 5) / 8));
  let bits = 0;
  let acc = 0;
  let n = 0;
  for (const ch of text) {
    acc = (acc << 5) | ALPHABET.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out[n++] = (acc >> (bits - 8)) & 255;
      bits -= 8;
    }
    acc &= (1 << bits) - 1;
  }
  return out;
}

// 표시용: XXXX-XXXX-... (4글자씩 8묶음)
export function newRecoveryCode(): string {
  return encodeBase32(randomBytes(20)).match(/.{4}/g)!.join('-');
}

// 공백·하이픈 제거, 대문자, I·L→1, O→0. 32글자·글자 집합이 아니면 Error.
export function normalizeRecoveryCode(input: string): string {
  const s = input
    .replace(/[\s-]+/g, '')
    .toUpperCase()
    .replace(/[IL]/g, '1')
    .replace(/O/g, '0');
  if (s.length !== 32) throw new Error('recovery code must be 32 characters');
  for (const ch of s) {
    if (!ALPHABET.includes(ch)) throw new Error('recovery code has invalid characters');
  }
  return s;
}

// 표시 문자열이든 정규화된 문자열이든 받아 20바이트를 되돌린다.
export function recoveryCodeBytes(input: string): Uint8Array {
  return decodeBase32(normalizeRecoveryCode(input));
}
