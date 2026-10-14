import { describe, expect, it } from 'vitest';
import type { AccountDraft } from '../../src/core/account';
import { encodeHex } from '../../src/core/base32';
import { decodeMigration, encodeMigration } from '../../src/core/migration';
import { generateCode } from '../../src/core/otp';

const FIXED =
  'otpauth-migration://offline?data=Ci4KCkhlbGxvId6tvu8SEWFsaWNlQGV4YW1wbGUuY29tGgdFeGFtcGxlIAEoATACCjgKIDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDEyEghDb3JwOm9wcxoEQ29ycCACKAIwAgouChQxMjM0NTY3ODkwMTIzNDU2Nzg5MBIMY291bnRlci10ZXN0GgAgASgBMAE4BRABGAEgACiy8hk%3D';

const ascii = (s: string) => new TextEncoder().encode(s);

describe('decodeMigration', () => {
  const result = decodeMigration(FIXED);

  it('reads the batch header', () => {
    expect(result.batch).toEqual({ size: 1, index: 0, id: 424242 });
    expect(result.failed).toEqual([]);
    expect(result.drafts).toHaveLength(3);
  });

  it('reads a plain totp entry', () => {
    const d = result.drafts[0]!;
    expect(encodeHex(d.secret)).toBe('48656c6c6f21deadbeef');
    expect(d).toMatchObject({
      label: 'alice@example.com',
      issuer: 'Example',
      algorithm: 'SHA-1',
      digits: 6,
      type: 'totp',
      period: 30,
    });
  });

  it('strips the issuer prefix and reads SHA-256 / 8 digits', () => {
    const d = result.drafts[1]!;
    expect(d.secret).toEqual(ascii('12345678901234567890123456789012'));
    expect(d).toMatchObject({
      label: 'ops',
      issuer: 'Corp',
      algorithm: 'SHA-256',
      digits: 8,
      type: 'totp',
    });
  });

  it('reads an hotp entry that generates the RFC 4226 code', async () => {
    const d = result.drafts[2]!;
    expect(d.secret).toEqual(ascii('12345678901234567890'));
    expect(d).toMatchObject({
      label: 'counter-test',
      issuer: '',
      algorithm: 'SHA-1',
      digits: 6,
      type: 'hotp',
      counter: 5,
    });
    expect(await generateCode(d, 0)).toBe('254676');
  });

  it('accepts a data parameter whose "+" became a space', () => {
    const { uris } = encodeMigration(
      [
        {
          type: 'totp',
          issuer: '',
          label: 'plus',
          secret: new Uint8Array(10).fill(0xfb),
          algorithm: 'SHA-1',
          digits: 6,
          period: 30,
        },
      ],
      1,
    );
    expect(uris[0]).toContain('%2B');
    const mangled = uris[0]!.replace(/%2B/g, '+').replace(/%2F/g, '/').replace(/%3D/g, '=');
    const d = decodeMigration(mangled).drafts[0]!;
    expect(encodeHex(d.secret)).toBe('fb'.repeat(10));
  });

  it('rejects links without data', () => {
    expect(() => decodeMigration('otpauth-migration://offline')).toThrow();
  });
});

describe('encodeMigration', () => {
  const fakes: AccountDraft[] = Array.from({ length: 23 }, (_, i) => ({
    type: i % 5 === 0 ? 'hotp' : 'totp',
    issuer: i % 2 === 0 ? `Issuer${i}` : '',
    label: `user${i}@example.com`,
    secret: Uint8Array.from({ length: 10 }, (_, j) => (i * 7 + j * 13 + 1) & 0xff),
    algorithm: (['SHA-1', 'SHA-256', 'SHA-512'] as const)[i % 3]!,
    digits: i % 4 === 0 ? 8 : 6,
    period: 30,
    ...(i % 5 === 0 ? { counter: i } : {}),
  }));

  it('splits 23 accounts into 3 links and round-trips them', () => {
    const { uris, skipped } = encodeMigration(fakes, 777);
    expect(skipped).toEqual([]);
    expect(uris).toHaveLength(3);

    const decoded = uris.map((u) => decodeMigration(u));
    expect(decoded.map((d) => d.batch.index)).toEqual([0, 1, 2]);
    expect(decoded.every((d) => d.batch.size === 3 && d.batch.id === 777)).toBe(true);

    const all = decoded.flatMap((d) => d.drafts);
    expect(all).toHaveLength(23);
    all.forEach((d, i) => {
      const src = fakes[i]!;
      expect(encodeHex(d.secret)).toBe(encodeHex(src.secret));
      expect(d.label).toBe(src.label);
      expect(d.issuer).toBe(src.issuer);
      expect(d.algorithm).toBe(src.algorithm);
      expect(d.digits).toBe(src.digits);
      expect(d.type).toBe(src.type);
      expect(d.counter).toBe(src.counter);
    });
  });

  it('skips steam and non-30-second entries', () => {
    const steam: AccountDraft = { ...fakes[1]!, type: 'steam', label: 'steam-one' };
    const slow: AccountDraft = { ...fakes[1]!, period: 60, label: 'slow-one' };
    const { uris, skipped } = encodeMigration([fakes[1]!, steam, slow], 1);
    expect(uris).toHaveLength(1);
    expect(skipped.map((s) => s.label)).toEqual(['steam-one', 'slow-one']);
    expect(decodeMigration(uris[0]!).drafts).toHaveLength(1);
  });
});
