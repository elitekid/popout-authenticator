// base32(RFC 4648)·16진수 비밀키 해석. 브라우저 API 를 쓰지 않는다.

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const BASE32_BODY = /^[A-Z2-7]+$/;
const HEX_BODY = /^[0-9a-f]+$/i;

export function decodeBase32(input: string): Uint8Array {
  const text = input
    .replace(/[\s-]+/g, '')
    .toUpperCase()
    .replace(/=+$/, '');
  if (text.length === 0) throw new Error('empty base32 input');
  if (!BASE32_BODY.test(text)) throw new Error('invalid base32 character');
  const rem = text.length % 8;
  if (rem === 1 || rem === 3 || rem === 6) throw new Error('invalid base32 length');

  const out = new Uint8Array(Math.floor((text.length * 5) / 8));
  let buffer = 0;
  let bits = 0;
  let pos = 0;
  for (const ch of text) {
    buffer = (buffer << 5) | ALPHABET.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out[pos++] = (buffer >> bits) & 0xff;
      buffer &= (1 << bits) - 1;
    }
  }
  return out;
}

export function encodeBase32(bytes: Uint8Array, opts?: { padding?: boolean }): string {
  let out = '';
  let buffer = 0;
  let bits = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += ALPHABET[(buffer >> bits) & 31];
    }
    buffer &= (1 << bits) - 1;
  }
  if (bits > 0) out += ALPHABET[(buffer << (5 - bits)) & 31];
  if (opts?.padding) {
    while (out.length % 8 !== 0) out += '=';
  }
  return out;
}

export function decodeHex(input: string): Uint8Array {
  let text = input.replace(/\s+/g, '');
  if (text.length === 0) throw new Error('empty hex input');
  if (!HEX_BODY.test(text)) throw new Error('invalid hex character');
  if (text.length % 2 === 1) {
    // 원본 인증 도구 호환: 마지막이 '0' 이면 버리고, 아니면 '0' 을 붙인다.
    text = text.endsWith('0') ? text.slice(0, -1) : text + '0';
  }
  const out = new Uint8Array(text.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(text.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function encodeHex(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes) out += byte.toString(16).padStart(2, '0');
  return out;
}

export function parseSecret(input: string): Uint8Array {
  const text = input.replace(/\s+/g, '');
  if (/^[A-Za-z2-7]+=*$/.test(text)) {
    try {
      return decodeBase32(text);
    } catch {
      // 길이가 안 맞으면 16진수 가능성을 본다.
    }
  }
  if (HEX_BODY.test(text)) return decodeHex(text);
  throw new Error('secret is neither base32 nor hex');
}
