import { describe, expect, it } from 'vitest';
import {
  algorithmFrom,
  dedupe,
  makeDraft,
  newAccount,
  UnsupportedAlgorithmError,
  type AccountDraft,
} from '../../src/core/account';
import { decodeBase32, encodeHex } from '../../src/core/base32';
import { buildOtpauth, parseLinks, parseOtpauth } from '../../src/core/uri';

const FAKE = 'JBSWY3DPEHPK3PXP';
const FAKE_HEX = '48656c6c6f21deadbeef';

const draft = (over: Partial<AccountDraft> = {}): AccountDraft => ({
  type: 'totp',
  issuer: 'Example',
  label: 'alice',
  secret: decodeBase32(FAKE),
  algorithm: 'SHA-1',
  digits: 6,
  period: 30,
  ...over,
});

describe('parseOtpauth', () => {
  it('reads a basic totp link', () => {
    const d = parseOtpauth(`otpauth://totp/Example:alice@example.com?secret=${FAKE}&issuer=Example`);
    expect(d.type).toBe('totp');
    expect(d.issuer).toBe('Example');
    expect(d.label).toBe('alice@example.com');
    expect(d.algorithm).toBe('SHA-1');
    expect(d.digits).toBe(6);
    expect(d.period).toBe(30);
    expect(encodeHex(d.secret)).toBe(FAKE_HEX);
  });

  it.each([
    ['SHA256', 'SHA-256'],
    ['sha-256', 'SHA-256'],
    ['SHA512', 'SHA-512'],
    ['SHA1', 'SHA-1'],
  ])('reads algorithm=%s exactly (#1593)', (value, expected) => {
    const d = parseOtpauth(`otpauth://totp/x?secret=${FAKE}&algorithm=${value}`);
    expect(d.algorithm).toBe(expected);
  });

  it.each(['MD5', 'GOST3411_2012_256', 'foo'])('rejects algorithm=%s', (value) => {
    expect(() => parseOtpauth(`otpauth://totp/x?secret=${FAKE}&algorithm=${value}`)).toThrow();
  });

  it.each(['digits=5', 'digits=11', 'period=0', 'period=3601'])('rejects %s', (param) => {
    expect(() => parseOtpauth(`otpauth://totp/x?secret=${FAKE}&${param}`)).toThrow();
  });

  it('accepts padded and lowercase secrets', () => {
    expect(encodeHex(parseOtpauth(`otpauth://totp/x?secret=${FAKE.toLowerCase()}`).secret)).toBe(
      FAKE_HEX,
    );
    expect(encodeHex(parseOtpauth('otpauth://totp/x?secret=MZXW6YQ=').secret)).toBe('666f6f62');
  });

  it('reads the hotp counter, defaulting to 0', () => {
    const d = parseOtpauth(`otpauth://hotp/x?secret=${FAKE}&counter=42`);
    expect(d.type).toBe('hotp');
    expect(d.counter).toBe(42);
    expect(parseOtpauth(`otpauth://hotp/x?secret=${FAKE}`).counter).toBe(0);
  });

  it('detects steam by encoder and by issuer with 5 digits', () => {
    const byEncoder = parseOtpauth(`otpauth://totp/Steam:me?secret=${FAKE}&encoder=steam`);
    expect(byEncoder.type).toBe('steam');
    expect(byEncoder.digits).toBe(6);
    expect(byEncoder.period).toBe(30);
    expect(parseOtpauth(`otpauth://totp/me?secret=${FAKE}&issuer=Steam&digits=5`).type).toBe(
      'steam',
    );
  });

  it('detects battle.net from the secret prefix', () => {
    const d = parseOtpauth(`otpauth://totp/x?secret=blz-${FAKE}`);
    expect(d.type).toBe('battle');
    expect(d.digits).toBe(8);
    expect(encodeHex(d.secret)).toBe(FAKE_HEX);
  });

  it('decodes %20 and %3A in the label', () => {
    const d = parseOtpauth(`otpauth://totp/My%20Corp%3Aa%20b?secret=${FAKE}`);
    expect(d.issuer).toBe('My Corp');
    expect(d.label).toBe('a b');
  });

  it('prefers the issuer parameter', () => {
    const d = parseOtpauth(`otpauth://totp/Old:me?secret=${FAKE}&issuer=New`);
    expect(d.issuer).toBe('New');
    expect(d.label).toBe('me');
  });

  it('rejects a missing secret and unknown types', () => {
    expect(() => parseOtpauth('otpauth://totp/x')).toThrow();
    expect(() => parseOtpauth(`otpauth://foo/x?secret=${FAKE}`)).toThrow();
  });
});

describe('buildOtpauth', () => {
  it('round-trips totp SHA-256 8 digits 60 s', () => {
    const src = draft({ algorithm: 'SHA-256', digits: 8, period: 60, label: 'a b:c' });
    const uri = buildOtpauth(src)!;
    expect(uri).toContain('algorithm=SHA256');
    expect(parseOtpauth(uri)).toEqual(src);
  });

  it('round-trips colons in issuer and account name', () => {
    const src = draft({ issuer: 'Corp: Prod', label: 'a:b@example.com' });
    expect(buildOtpauth(src)).toContain('Corp%3A%20Prod:a%3Ab%40example.com');
    expect(parseOtpauth(buildOtpauth(src)!)).toEqual(src);
  });

  it('strips an encoded issuer prefix from other apps', () => {
    for (const query of ['&issuer=Example', '']) {
      const d = parseOtpauth(`otpauth://totp/Example%3Aalice?secret=${FAKE}${query}`);
      expect(d.issuer).toBe('Example');
      expect(d.label).toBe('alice');
    }
  });

  it('round-trips hotp with counter 7', () => {
    const src = draft({ type: 'hotp', counter: 7 });
    const back = parseOtpauth(buildOtpauth(src)!);
    expect(back).toEqual(src);
    expect(back.counter).toBe(7);
  });

  it('omits steam and battle', () => {
    expect(buildOtpauth(draft({ type: 'steam' }))).toBeNull();
    expect(buildOtpauth(draft({ type: 'battle' }))).toBeNull();
  });
});

describe('parseLinks', () => {
  it('separates good, broken and unrelated text', () => {
    const text = [
      `otpauth://totp/A:one?secret=${FAKE}`,
      'otpauth://totp/B:two?secret=!!!!',
      'just some words',
      `otpauth://hotp/C:three?secret=${FAKE}&counter=1`,
    ].join('\n');
    const r = parseLinks(text);
    expect(r.drafts).toHaveLength(2);
    expect(r.failed).toHaveLength(1);
    expect(r.failed[0]!.source.length).toBeLessThanOrEqual(40);
    expect(r.truncated).toBe(false);
  });

  it('truncates at the limit', () => {
    const text = ['a', 'b', 'c'].map((n) => `otpauth://totp/${n}?secret=${FAKE}`).join(' ');
    const r = parseLinks(text, 2);
    expect(r.drafts).toHaveLength(2);
    expect(r.truncated).toBe(true);
  });
});

describe('algorithmFrom', () => {
  it('maps the backup enumeration numbers', () => {
    expect(algorithmFrom(1)).toBe('SHA-1');
    expect(algorithmFrom(2)).toBe('SHA-256');
    expect(algorithmFrom(3)).toBe('SHA-512');
  });

  it('refuses unsupported values instead of falling back to SHA-1', () => {
    expect(() => algorithmFrom(4)).toThrow(UnsupportedAlgorithmError);
    expect(() => algorithmFrom(5)).toThrow(UnsupportedAlgorithmError);
    expect(() => algorithmFrom('MD5')).toThrow(/MD5/);
    expect(() => algorithmFrom('GOST3411_2012_512')).toThrow(UnsupportedAlgorithmError);
    expect(() => algorithmFrom('nope')).toThrow();
  });
});

describe('dedupe', () => {
  it('keeps one of two identical incoming drafts', () => {
    const r = dedupe([], [draft(), draft({ label: 'again' })]);
    expect(r.fresh).toHaveLength(1);
    expect(r.duplicates).toBe(1);
  });

  it('counts a match with a live account but not with a trashed one', () => {
    const live = { type: 'totp' as const, secret: decodeBase32(FAKE), deletedAt: undefined };
    const trashed = { ...live, deletedAt: 1 };
    expect(dedupe([live], [draft()]).duplicates).toBe(1);
    expect(dedupe([trashed], [draft()])).toEqual({ fresh: [draft()], duplicates: 0 });
  });

  it('treats a different type as different', () => {
    expect(dedupe([], [draft(), draft({ type: 'hotp', counter: 0 })]).fresh).toHaveLength(2);
  });
});

describe('makeDraft / newAccount', () => {
  it('fixes steam and battle values', () => {
    const base = { issuer: '', label: 'x', secret: decodeBase32(FAKE), algorithm: 'SHA-256' as const };
    expect(makeDraft({ ...base, type: 'steam', digits: 5 })).toMatchObject({
      digits: 6,
      period: 30,
      algorithm: 'SHA-1',
    });
    expect(makeDraft({ ...base, type: 'battle' })).toMatchObject({ digits: 8, period: 30 });
  });

  it('builds an account with defaults', () => {
    const a = newAccount(draft(), 1000);
    expect(a).toMatchObject({
      note: '',
      pinned: false,
      matchHosts: [],
      createdAt: 1000,
      updatedAt: 1000,
    });
    expect(a.id).toMatch(/^[0-9a-f-]{36}$/);
    expect('group' in a).toBe(false);
  });
});
