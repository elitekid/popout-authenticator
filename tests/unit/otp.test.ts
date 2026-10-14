import { describe, expect, it } from 'vitest';
import { decodeBase32 } from '../../src/core/base32';
import {
  generateCode,
  hotp,
  secondsRemaining,
  splitTypePrefix,
  totpCounter,
} from '../../src/core/otp';
import type { Account } from '../../src/core/types';

const ascii = (s: string) => new TextEncoder().encode(s);
const FAKE = decodeBase32('JBSWY3DPEHPK3PXP');

type Calc = Pick<Account, 'type' | 'secret' | 'algorithm' | 'digits' | 'period' | 'counter'>;
const fake = (over: Partial<Calc>): Calc => ({
  type: 'totp',
  secret: FAKE,
  algorithm: 'SHA-1',
  digits: 6,
  period: 30,
  ...over,
});

describe('hotp (RFC 4226 appendix D)', () => {
  const expected = [
    '755224', '287082', '359152', '969429', '338314',
    '254676', '287922', '162583', '399871', '520489',
  ];
  it('matches the test vectors', async () => {
    const secret = ascii('12345678901234567890');
    for (let i = 0; i < expected.length; i++) {
      expect(await hotp(secret, i, 'SHA-1', 6)).toBe(expected[i]);
    }
  });

  it('rejects bad digits and counters', async () => {
    await expect(hotp(FAKE, 0, 'SHA-1', 5)).rejects.toBeInstanceOf(RangeError);
    await expect(hotp(FAKE, 0, 'SHA-1', 11)).rejects.toBeInstanceOf(RangeError);
    await expect(hotp(FAKE, 0, 'SHA-1', 7.5)).rejects.toBeInstanceOf(RangeError);
    await expect(hotp(FAKE, -1, 'SHA-1', 6)).rejects.toBeInstanceOf(RangeError);
    await expect(hotp(FAKE, 1.5, 'SHA-1', 6)).rejects.toBeInstanceOf(RangeError);
  });
});

describe('totp (RFC 6238 appendix B)', () => {
  const seeds = {
    'SHA-1': ascii('12345678901234567890'),
    'SHA-256': ascii('12345678901234567890123456789012'),
    'SHA-512': ascii('1234567890123456789012345678901234567890123456789012345678901234'),
  } as const;
  const rows: [number, string, string, string][] = [
    [59, '94287082', '46119246', '90693936'],
    [1111111109, '07081804', '68084774', '25091201'],
    [1111111111, '14050471', '67062674', '99943326'],
    [1234567890, '89005924', '91819424', '93441116'],
    [2000000000, '69279037', '90698825', '38618901'],
    [20000000000, '65353130', '77737706', '47863826'],
  ];
  for (const [sec, sha1, sha256, sha512] of rows) {
    it(`t=${sec}`, async () => {
      const base = { type: 'totp', digits: 8, period: 30 } as const;
      const at = (algorithm: keyof typeof seeds) =>
        generateCode({ ...base, algorithm, secret: seeds[algorithm] }, sec * 1000);
      expect(await at('SHA-1')).toBe(sha1);
      expect(await at('SHA-256')).toBe(sha256);
      expect(await at('SHA-512')).toBe(sha512);
    });
  }
});

describe('generateCode with a fake account', () => {
  it('totp 6 and 10 digits', async () => {
    expect(await generateCode(fake({}), 59_000)).toBe('996554');
    expect(await generateCode(fake({ digits: 10 }), 59_000)).toBe('2041996554');
    expect(await generateCode(fake({}), 1111111109_000)).toBe('071271');
    expect(await generateCode(fake({ digits: 10 }), 1111111109_000)).toBe('1733071271');
    expect(await generateCode(fake({}), 2000000000_000)).toBe('890699');
    expect(await generateCode(fake({ digits: 10 }), 2000000000_000)).toBe('0828890699');
  });

  it('battle ignores account digits, algorithm and period', async () => {
    const odd = { digits: 6, algorithm: 'SHA-512', period: 60 } as const;
    expect(await generateCode(fake({ type: 'battle', ...odd }), 59_000)).toBe('41996554');
    expect(await generateCode(fake({ type: 'battle' }), 1111111109_000)).toBe('33071271');
    expect(await generateCode(fake({ type: 'battle' }), 2000000000_000)).toBe('28890699');
  });

  it('steam', async () => {
    const odd = { digits: 8, algorithm: 'SHA-256', period: 60 } as const;
    expect(await generateCode(fake({ type: 'steam', ...odd }), 59_000)).toBe('2YXGV');
    expect(await generateCode(fake({ type: 'steam' }), 1111111109_000)).toBe('CWDGV');
    expect(await generateCode(fake({ type: 'steam' }), 2000000000_000)).toBe('HNCVQ');
  });

  it('hotp uses the account counter and ignores time', async () => {
    const codes: string[] = [];
    for (const counter of [0, 1, 2]) {
      codes.push(await generateCode(fake({ type: 'hotp', counter }), 123_456_789));
    }
    expect(codes).toEqual(['282760', '996554', '602287']);
    expect(await generateCode(fake({ type: 'hotp', counter: 0 }), 0, 0, 1)).toBe('996554');
  });

  it('step=1 gives the next code and offsetMs shifts the clock', async () => {
    expect(await generateCode(fake({}), 29_000, 0, 1)).toBe('996554');
    expect(await generateCode(fake({}), 29_000, 30_000)).toBe('996554');
    expect(await generateCode(fake({}), 0, 59_000)).toBe('996554');
  });

  it('rejects bad digits and period', async () => {
    await expect(generateCode(fake({ digits: 5 }), 0)).rejects.toBeInstanceOf(RangeError);
    await expect(generateCode(fake({ digits: 11 }), 0)).rejects.toBeInstanceOf(RangeError);
    await expect(generateCode(fake({ digits: 7.5 }), 0)).rejects.toBeInstanceOf(RangeError);
    await expect(generateCode(fake({ period: 0 }), 0)).rejects.toBeInstanceOf(RangeError);
    await expect(generateCode(fake({ period: 3601 }), 0)).rejects.toBeInstanceOf(RangeError);
  });
});

describe('time helpers', () => {
  it('totpCounter', () => {
    expect(totpCounter(59_999, 30)).toBe(1);
    expect(totpCounter(60_000, 30)).toBe(2);
    expect(() => totpCounter(0, 0)).toThrow(RangeError);
    expect(() => totpCounter(0, 3601)).toThrow(RangeError);
  });

  it('secondsRemaining is 1..period', () => {
    expect(secondsRemaining(0, 30)).toBe(30);
    expect(secondsRemaining(1_000, 30)).toBe(29);
    expect(secondsRemaining(29_999, 30)).toBe(1);
    expect(secondsRemaining(30_000, 30)).toBe(30);
  });
});

describe('splitTypePrefix', () => {
  it('recognises the three prefixes', () => {
    expect(splitTypePrefix('blz-ABC')).toEqual({ type: 'battle', rest: 'ABC' });
    expect(splitTypePrefix('bliz-ABC')).toEqual({ type: 'battle', rest: 'ABC' });
    expect(splitTypePrefix('stm-ABC')).toEqual({ type: 'steam', rest: 'ABC' });
  });
  it('leaves plain secrets alone', () => {
    expect(splitTypePrefix('JBSWY3DP')).toEqual({ rest: 'JBSWY3DP' });
  });
});
