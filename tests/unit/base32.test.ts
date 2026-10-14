import { describe, expect, it } from 'vitest';
import {
  decodeBase32,
  decodeHex,
  encodeBase32,
  encodeHex,
  parseSecret,
} from '../../src/core/base32';

const ascii = (s: string) => new TextEncoder().encode(s);
const FAKE_HEX = '48656c6c6f21deadbeef';

describe('base32 RFC 4648', () => {
  const vectors: [string, string][] = [
    ['f', 'MY======'],
    ['fo', 'MZXQ===='],
    ['foo', 'MZXW6==='],
    ['foob', 'MZXW6YQ='],
    ['fooba', 'MZXW6YTB'],
    ['foobar', 'MZXW6YTBOI======'],
  ];

  it('encodes the empty input as empty', () => {
    expect(encodeBase32(new Uint8Array(0))).toBe('');
    expect(encodeBase32(new Uint8Array(0), { padding: true })).toBe('');
  });

  it('rejects empty decode input', () => {
    expect(() => decodeBase32('')).toThrow(Error);
    expect(() => decodeBase32('===')).toThrow(Error);
  });

  for (const [plain, encoded] of vectors) {
    it(`round-trips "${plain}"`, () => {
      expect(encodeBase32(ascii(plain), { padding: true })).toBe(encoded);
      expect(encodeBase32(ascii(plain))).toBe(encoded.replace(/=+$/, ''));
      const bare = encoded.replace(/=+$/, '');
      expect(decodeBase32(encoded)).toEqual(ascii(plain));
      expect(decodeBase32(bare)).toEqual(ascii(plain));
      expect(decodeBase32(encoded.toLowerCase())).toEqual(ascii(plain));
      expect(decodeBase32(bare.split('').join(' '))).toEqual(ascii(plain));
      expect(decodeBase32(bare.split('').join('-'))).toEqual(ascii(plain));
    });
  }

  it('accepts any number of padding characters (#1546)', () => {
    for (let pad = 0; pad <= 6; pad++) {
      const out = decodeBase32('JBSWY3DPEHPK3PXP' + '='.repeat(pad));
      expect(encodeHex(out)).toBe(FAKE_HEX);
    }
  });

  it('rejects impossible lengths and bad characters', () => {
    expect(() => decodeBase32('A')).toThrow(Error);
    expect(() => decodeBase32('AAA')).toThrow(Error);
    expect(() => decodeBase32('AAAAAA')).toThrow(Error);
    expect(() => decodeBase32('AAAAAAAAA')).toThrow(Error);
    expect(() => decodeBase32('A1B')).toThrow(Error);
    expect(() => decodeBase32('AB!D')).toThrow(Error);
  });
});

describe('hex', () => {
  it('encodes lowercase and decodes both cases', () => {
    expect(encodeHex(new Uint8Array([0, 15, 255]))).toBe('000fff');
    expect(decodeHex('00 0F Ff')).toEqual(new Uint8Array([0, 15, 255]));
  });

  it('handles odd length like the original authenticator', () => {
    expect(decodeHex('abc')).toEqual(new Uint8Array([0xab, 0xc0]));
    expect(decodeHex('ab0')).toEqual(new Uint8Array([0xab]));
  });

  it('rejects non-hex', () => {
    expect(() => decodeHex('xyz')).toThrow(Error);
  });
});

describe('parseSecret', () => {
  it('reads base32 and hex to the same bytes', () => {
    const fromBase32 = parseSecret('JBSWY3DPEHPK3PXP');
    const fromHex = parseSecret(FAKE_HEX);
    expect(encodeHex(fromBase32)).toBe(FAKE_HEX);
    expect(fromHex).toEqual(fromBase32);
  });

  it('ignores case and whitespace for base32', () => {
    expect(parseSecret('jbsw y3dp ehpk 3pxp')).toEqual(parseSecret('JBSWY3DPEHPK3PXP'));
  });

  it('rejects garbage', () => {
    expect(() => parseSecret('!!')).toThrow(Error);
  });
});
