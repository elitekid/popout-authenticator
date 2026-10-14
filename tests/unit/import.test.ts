import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { AccountDraft } from '../../src/core/account';
import { encodeHex } from '../../src/core/base32';
import { WrongSecretError } from '../../src/core/crypto';
import { importText, ImportRejectedError, NeedsPasswordError } from '../../src/core/import';
import { generateCode } from '../../src/core/otp';

const fixture = (name: string): string =>
  readFileSync(fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url)), 'utf8');

const formats = JSON.parse(fixture('2fa-import-formats.json')) as Record<string, unknown>;
const text = (key: string): string => JSON.stringify(formats[key]);

const T59 = 59_000;
const code = (d: AccountDraft, now = T59): Promise<string> => generateCode(d, now);
const find = (drafts: AccountDraft[], issuer: string, label?: string): AccountDraft => {
  const d = drafts.find((x) => x.issuer === issuer && (label === undefined || x.label === label));
  if (!d) throw new Error(`draft not found: ${issuer}/${label}`);
  return d;
};

const RFC_SHA1_8 = '94287082';
const RFC_SHA256_8 = '46119246';
const RFC_SHA512_8 = '90693936';

describe('original backup', () => {
  it('reads an encrypted v3 backup', async () => {
    const out = await importText(fixture('orig-enc-backup.json'), 'test-pass-1234');
    expect(out.drafts).toHaveLength(1);
    expect(out.failed).toHaveLength(0);
    const d = out.drafts[0]!;
    expect(d.issuer).toBe('Dummy-SHA256');
    expect(d.label).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    expect(d.type).toBe('totp');
    expect(d.algorithm).toBe('SHA-1');
    expect(encodeHex(d.secret)).toBe('48656c6c6f21deadbeef');
  }, 60_000);

  it('rejects a wrong password', async () => {
    await expect(importText(fixture('orig-enc-backup.json'), 'wrong-pass')).rejects.toBeInstanceOf(
      WrongSecretError,
    );
  }, 60_000);

  it('asks for a password', async () => {
    await expect(importText(fixture('orig-enc-backup.json'))).rejects.toBeInstanceOf(NeedsPasswordError);
  });

  it('reads a plain backup and keeps going past a GOST entry', async () => {
    const out = await importText(fixture('orig-plain-backup.json'));
    expect(out.drafts).toHaveLength(6);
    expect(out.failed).toHaveLength(1);
    expect(out.failed[0]!.source).toMatch(/gost/i);
    expect(out.failed[0]!.reason).toContain('unsupported algorithm');
    expect(out.meta).toHaveLength(6);

    expect(await code(find(out.drafts, 'Example', 'alice@example.com'))).toBe('996554');
    expect(out.meta![0]!.pinned).toBe(true);
    expect(await code(find(out.drafts, 'Corp', 'ops'))).toBe('18920136');
    expect(await code(find(out.drafts, 'Counter', 'hotp-test'))).toBe('254676');
    expect(await code(find(out.drafts, 'HexCo', 'hex-test'))).toBe('996554');
    expect(await code(find(out.drafts, 'Battle.net', 'battle-test'))).toBe('41996554');
    expect(await code(find(out.drafts, 'Steam', 'steam-test'))).toBe('2YXGV');
  });
});

describe('own backup', () => {
  it('reads a plain backup with groups', async () => {
    const out = await importText(fixture('2fa-plain-backup.json'));
    expect(out.drafts).toHaveLength(2);
    expect(out.failed).toHaveLength(0);
    expect(out.meta![0]!.group).toBe('Work');
    expect(out.meta![1]!.group).toBeUndefined();
    expect(await code(out.drafts[1]!)).toBe('18920136');
  });

  it('reads an encrypted backup', async () => {
    const out = await importText(fixture('2fa-enc-backup.json'), 'fake-pass-5678');
    expect(out.drafts).toHaveLength(2);
    expect(out.meta![0]!.group).toBe('Work');
    expect(await code(out.drafts[1]!)).toBe('18920136');
  }, 60_000);

  it('rejects a wrong password', async () => {
    await expect(importText(fixture('2fa-enc-backup.json'), 'nope')).rejects.toBeInstanceOf(WrongSecretError);
  }, 60_000);

  it('asks for a password', async () => {
    await expect(importText(fixture('2fa-enc-backup.json'))).rejects.toBeInstanceOf(NeedsPasswordError);
  });
});

describe('other apps', () => {
  it('aegis', async () => {
    const out = await importText(text('aegis'));
    expect(out.format).toBe('aegis');
    expect(out.drafts).toHaveLength(5);
    expect(await code(find(out.drafts, 'GitHub'))).toBe(RFC_SHA1_8);
    expect(await code(find(out.drafts, 'Bank'))).toBe(RFC_SHA256_8);
    expect(await code(find(out.drafts, 'AWS'))).toBe(RFC_SHA512_8);
    expect(find(out.drafts, 'Corp').counter).toBe(12);
    expect(find(out.drafts, 'Steam').type).toBe('steam');
    expect(out.meta![0]!.group).toBe('Work');
  });

  it('2fas', async () => {
    const out = await importText(text('twoFas'));
    expect(out.drafts).toHaveLength(4);
    expect(await code(find(out.drafts, 'GitHub'))).toBe(RFC_SHA1_8);
    expect(await code(find(out.drafts, 'Bank'))).toBe(RFC_SHA256_8);
    expect(find(out.drafts, 'Corp VPN').counter).toBe(3);
    expect(find(out.drafts, 'Steam').type).toBe('steam');
    expect(out.meta![0]!.group).toBe('Work');
  });

  it('bitwarden skips items without a totp', async () => {
    const out = await importText(text('bitwarden'));
    expect(out.drafts).toHaveLength(3);
    expect(await code(find(out.drafts, 'GitHub'))).toBe(RFC_SHA1_8);
    expect(find(out.drafts, 'Steam').type).toBe('steam');
  });

  it('freeotp+ reads signed byte secrets', async () => {
    const out = await importText(text('freeOtpPlus'));
    expect(out.drafts).toHaveLength(3);
    expect(await code(find(out.drafts, 'GitHub'))).toBe(RFC_SHA1_8);
    expect(await code(find(out.drafts, 'Example'))).toBe('996554');
    expect(find(out.drafts, 'Corp').counter).toBe(7);
  });

  it('andotp', async () => {
    const out = await importText(text('andOtp'));
    expect(out.drafts).toHaveLength(4);
    expect(await code(find(out.drafts, 'GitHub'))).toBe(RFC_SHA1_8);
    expect(find(out.drafts, 'Bank').period).toBe(60);
    expect(find(out.drafts, 'Legacy').counter).toBe(5);
    expect(out.meta![0]!.group).toBe('Work');
  });

  it('raivo', async () => {
    const out = await importText(text('raivo'));
    expect(out.drafts).toHaveLength(3);
    expect(await code(find(out.drafts, 'GitHub'))).toBe(RFC_SHA1_8);
    expect(find(out.drafts, 'Bank').algorithm).toBe('SHA-256');
    expect(find(out.drafts, 'VPN').counter).toBe(12);
  });

  it('authy dump', async () => {
    const out = await importText(text('authyDump'));
    expect(out.drafts).toHaveLength(3);
    expect(await code(find(out.drafts, 'GitHub'))).toBe(RFC_SHA1_8);
    const twitch = find(out.drafts, 'Twitch');
    expect(twitch.digits).toBe(7);
    expect(twitch.period).toBe(10);
    expect(find(out.drafts, 'VPN').counter).toBe(4);
  });

  it.each([
    ['aegisEncrypted', 'Aegis'],
    ['twoFasEncrypted', '2FAS'],
    ['bitwardenEncrypted', 'Bitwarden'],
  ])('refuses encrypted %s', async (key, app) => {
    const err = await importText(text(key)).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ImportRejectedError);
    expect((err as ImportRejectedError).reason).toBe('encrypted');
    expect((err as ImportRejectedError).app).toBe(app);
  });

  it('does not guess at an unknown shape', async () => {
    const err = await importText(text('alibabaLike')).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ImportRejectedError);
    expect((err as ImportRejectedError).reason).toBe('unknown');
  });
});

describe('importText fallbacks', () => {
  it('does not truncate an otpauth text backup after 500 accounts', async () => {
    const text = Array.from({ length: 501 }, (_, i) =>
      `otpauth://totp/Example:user${i}?secret=JBSWY3DPEHPK3PXP&issuer=Example`,
    ).join('\n');
    const out = await importText(text);
    expect(out.drafts).toHaveLength(501);
    expect(out.drafts[500].label).toBe('user500');
    expect(out.failed).toEqual([]);
  });

  it('reads otpauth lines', async () => {
    const out = await importText(
      [
        'otpauth://totp/A:one?secret=JBSWY3DPEHPK3PXP&issuer=A',
        'otpauth://totp/B:two?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=B',
      ].join('\n'),
    );
    expect(out.drafts).toHaveLength(2);
    expect(out.format).toBe('links');
  });

  it('rejects plain prose', async () => {
    const err = await importText('아무 글').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ImportRejectedError);
    expect((err as ImportRejectedError).reason).toBe('unknown');
  });
});

describe('own backup and CXF through importText', () => {
  it('reads our own files and CXF', async () => {
    const { buildPlainBackup, buildEncryptedBackup, buildCxf } = await import('../../src/core/export');
    const { decodeBase32 } = await import('../../src/core/base32');
    const acct = {
      id: 'x', type: 'totp' as const, issuer: 'Example', label: 'alice', secret: decodeBase32('JBSWY3DPEHPK3PXP'),
      algorithm: 'SHA-1' as const, digits: 6, period: 30, note: 'memo', pinned: true, matchHosts: ['example.com'],
      group: 'Work', createdAt: 1, updatedAt: 1,
    };
    const plain = await importText(buildPlainBackup([acct]));
    expect(plain.format).toBe('own');
    expect(plain.meta![0]).toMatchObject({ pinned: true, group: 'Work', note: 'memo', matchHosts: ['example.com'] });
    const enc = await buildEncryptedBackup([acct], 'fake-pass', { iterations: 1, memoryKiB: 64, parallelism: 1 });
    await expect(importText(enc)).rejects.toBeInstanceOf(NeedsPasswordError);
    expect((await importText(enc, 'fake-pass')).drafts).toHaveLength(1);
    const cxf = await importText(buildCxf([acct]).text);
    expect(cxf.format).toBe('cxf');
    expect(cxf.drafts[0]).toMatchObject({ issuer: 'Example', label: 'alice' });
  });
});
