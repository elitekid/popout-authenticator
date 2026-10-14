import { describe, expect, it } from 'vitest';
import { encodeHex } from '../../src/core/base32';
import { CorruptVaultError, WrongSecretError } from '../../src/core/crypto';
import {
  buildCxf,
  buildEncryptedBackup,
  buildOtpauthText,
  buildPlainBackup,
  isCxf,
  isOwnBackup,
  qrMatrix,
  readCxf,
  readOwnBackup,
  verifyExport,
} from '../../src/core/export';
import { encodeMigration } from '../../src/core/migration';
import { buildOtpauth } from '../../src/core/uri';
import type { Account } from '../../src/core/types';

// 시험용 작은 Argon2 값
const FAST = { iterations: 1, memoryKiB: 64, parallelism: 1 };

const FAKE_KEY = Uint8Array.from([0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x21, 0xde, 0xad, 0xbe, 0xef]);

function account(n: number, over: Partial<Account> = {}): Account {
  const secret = Uint8Array.from({ length: 10 }, (_, i) => (n * 17 + i * 3 + 1) & 0xff);
  return {
    id: `id-${n}`,
    type: 'totp',
    issuer: `Issuer${n}`,
    label: `user${n}@example.com`,
    secret,
    algorithm: 'SHA-1',
    digits: 6,
    period: 30,
    note: '',
    pinned: false,
    matchHosts: [],
    createdAt: 1700000000000 + n,
    updatedAt: 1700000001000 + n,
    ...over,
  };
}

function sample(): Account[] {
  return [
    account(1, {
      secret: FAKE_KEY,
      group: 'Work',
      note: 'memo',
      pinned: true,
      matchHosts: ['example.com'],
      lastUsedAt: 1700000005000,
    }),
    account(2, { type: 'hotp', counter: 3, algorithm: 'SHA-256', digits: 8 }),
    account(3, { deletedAt: 1700000009000 }),
  ];
}

const sameAccount = (a: Account, b: Account) => {
  expect(b).toEqual({ ...a, secret: a.secret });
  expect(encodeHex(b.secret)).toBe(encodeHex(a.secret));
};

describe('own backup', () => {
  it('round-trips a plain file without the trashed account', async () => {
    const input = sample();
    const text = buildPlainBackup(input);
    expect(isOwnBackup(text)).toBe(true);
    expect(text).toContain('\n  "format"');
    expect(text).toContain('"secret": "JBSWY3DPEHPK3PXP"');
    expect(text).not.toContain('id-3');
    const out = await readOwnBackup(text);
    expect(out).toHaveLength(2);
    sameAccount(input[0]!, out[0]!);
    sameAccount(input[1]!, out[1]!);
    expect(out[1]!.counter).toBe(3);
    expect(out[0]).toMatchObject({ group: 'Work', note: 'memo', pinned: true, matchHosts: ['example.com'] });
  });

  it('round-trips an encrypted file and hides the contents', async () => {
    const input = sample();
    const text = await buildEncryptedBackup(input, 'fake-pass-1234', FAST);
    expect(isOwnBackup(text)).toBe(true);
    for (const hidden of ['user1@example.com', 'Issuer1', '"Work"', '"memo"', '"accounts"', '"secret"']) {
      expect(text).not.toContain(hidden);
    }
    expect(JSON.parse(text)).toMatchObject({ encrypted: true, kdf: { name: 'argon2id', ...FAST } });
    const out = await readOwnBackup(text, 'fake-pass-1234');
    expect(out).toHaveLength(2);
    sameAccount(input[0]!, out[0]!);
    sameAccount(input[1]!, out[1]!);
  });

  it('rejects a wrong password, a missing password and garbage', async () => {
    const text = await buildEncryptedBackup(sample(), 'fake-pass-1234', FAST);
    await expect(readOwnBackup(text, 'nope')).rejects.toBeInstanceOf(WrongSecretError);
    await expect(readOwnBackup(text)).rejects.toThrow('needs password');
    await expect(readOwnBackup('{"format":"other"}')).rejects.toBeInstanceOf(CorruptVaultError);
    expect(isOwnBackup('not json')).toBe(false);
  });
});

describe('otpauth text and cxf', () => {
  const withSteam = () => [...sample(), account(4, { type: 'steam', algorithm: 'SHA-1' })];

  it('writes one link per line and skips steam', () => {
    const { text, skipped } = buildOtpauthText(withSteam());
    expect(skipped).toEqual(['user4@example.com']);
    const lines = text.split('\n');
    expect(lines.at(-1)).toBe('');
    expect(lines.filter((l) => l !== '')).toHaveLength(2);
    expect(lines[0]).toBe(buildOtpauth(sample()[0]!));
  });

  it('round-trips cxf and skips hotp and steam', () => {
    const input = withSteam();
    const { text, skipped } = buildCxf(input);
    expect(isCxf(text)).toBe(true);
    expect(isCxf(buildPlainBackup(input))).toBe(false);
    expect(skipped.sort()).toEqual(['user2@example.com', 'user4@example.com']);
    const drafts = readCxf(text);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({
      type: 'totp',
      issuer: 'Issuer1',
      label: 'user1@example.com',
      algorithm: 'SHA-1',
      digits: 6,
      period: 30,
    });
    expect(encodeHex(drafts[0]!.secret)).toBe(encodeHex(FAKE_KEY));
  });

  it('reads every credential of an item', () => {
    const text = JSON.stringify({
      version: { major: 1, minor: 0 },
      accounts: [
        {
          items: [
            {
              title: 'Multi',
              credentials: [
                { type: 'password', value: 'x' },
                { type: 'totp', secret: 'JBSWY3DPEHPK3PXP', username: 'a', algorithm: 'sha256' },
                { type: 'totp', secret: 'JBSWY3DPEHPK3PXQ', digits: 8, period: 60 },
              ],
            },
          ],
        },
      ],
    });
    const drafts = readCxf(text);
    expect(drafts.map((d) => [d.label, d.algorithm, d.digits, d.period])).toEqual([
      ['a', 'SHA-256', 6, 30],
      ['Multi', 'SHA-1', 8, 60],
    ]);
  });
});

describe('verifyExport', () => {
  const accounts = [...sample(), account(4, { type: 'steam' }), account(5, { period: 60 })];

  it('finds everything in every kind', async () => {
    const live = accounts.filter((a) => a.deletedAt === undefined);

    const plain = await verifyExport(accounts, 'own-plain', buildPlainBackup(accounts));
    expect(plain).toEqual({ expected: live.length, found: live.length, missing: [] });

    const enc = await buildEncryptedBackup(accounts, 'pw', FAST);
    const encResult = await verifyExport(accounts, 'own-encrypted', enc, 'pw');
    expect(encResult.found).toBe(encResult.expected);
    expect(encResult.expected).toBe(live.length);

    const links = await verifyExport(accounts, 'otpauth-text', buildOtpauthText(accounts).text);
    expect(links.expected).toBe(3);
    expect(links.found).toBe(3);

    const cxf = await verifyExport(accounts, 'cxf', buildCxf(accounts).text);
    expect(cxf.expected).toBe(2);
    expect(cxf.found).toBe(2);
  });

  it('names the line that was removed', async () => {
    const lines = buildOtpauthText(accounts).text.split('\n').filter((l) => l !== '');
    const removed = lines.shift()!;
    expect(removed).toContain('Issuer1');
    const result = await verifyExport(accounts, 'otpauth-text', lines.join('\n'));
    expect(result.found).toBe(result.expected - 1);
    expect(result.missing).toEqual(['user1@example.com']);
  });

  it('verifies a Google batch of 12 across two links', async () => {
    const twelve = Array.from({ length: 12 }, (_, i) => account(i + 10));
    const { uris, skipped } = encodeMigration(twelve, 7);
    expect(uris).toHaveLength(2);
    expect(skipped).toEqual([]);
    expect(await verifyExport(twelve, 'google-batch', uris)).toEqual({
      expected: 12,
      found: 12,
      missing: [],
    });
  });
});

describe('qrMatrix', () => {
  it('is a deterministic square of at least 21 modules', () => {
    const link = buildOtpauth(account(1))!;
    const a = qrMatrix(link);
    expect(a.length).toBeGreaterThanOrEqual(21);
    for (const row of a) expect(row).toHaveLength(a.length);
    expect(qrMatrix(link)).toEqual(a);
  });
});

describe('cxf from 2FA Authenticator 1.13 (flat shape)', () => {
  it('reads items at the root with subtitle and title fallbacks', () => {
    const text = JSON.stringify({
      version: 1,
      exporter: 'authenticator.sh',
      timestamp: 1,
      id: 'x',
      userName: '',
      email: '',
      collections: [],
      items: [
        {
          id: 'a',
          creationAt: 1,
          modifiedAt: 1,
          type: 'login',
          title: 'GitHub',
          subtitle: 'alice@example.com',
          credentials: [{ type: 'totp', secret: 'JBSWY3DPEHPK3PXP', period: 30, digits: 6, algorithm: 'sha1' }],
        },
      ],
    });
    expect(isCxf(text)).toBe(true);
    const drafts = readCxf(text);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({ issuer: 'GitHub', label: 'alice@example.com' });
  });
});
