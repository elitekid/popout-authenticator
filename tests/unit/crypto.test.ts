import { describe, expect, it } from 'vitest';
import type { Account, VaultFile } from '../../src/core/types';
import {
  CorruptVaultError,
  DEFAULT_ARGON2,
  UnsupportedFormatError,
  WrongSecretError,
  concat,
  decryptOpenSslSalted,
  decryptVault,
  encryptVault,
  fromBase64,
  fromBase64Url,
  fromHex,
  md5,
  newMasterKey,
  newRecoveryCode,
  normalizeRecoveryCode,
  recoveryCodeBytes,
  toBase64,
  toBase64Url,
  toHex,
  unwrapWithPassword,
  unwrapWithPrf,
  unwrapWithRecoveryCode,
  utf8Decode,
  utf8Encode,
  verifyVaultFile,
  wrapWithPassword,
  wrapWithPrf,
  wrapWithRecoveryCode,
} from '../../src/core/crypto';

const FAST = { iterations: 1, memoryKiB: 1024, parallelism: 1 };
const md5Hex = (s: string) => toHex(md5(utf8Encode(s)));

describe('bytes', () => {
  it('round-trips base64, base64url, hex', () => {
    const b = fromHex('48656c6c6f21deadbeef');
    expect(toHex(b)).toBe('48656c6c6f21deadbeef');
    expect(fromBase64(toBase64(b))).toEqual(b);
    expect(fromBase64Url(toBase64Url(b))).toEqual(b);
    expect(toBase64Url(new Uint8Array([0xfb, 0xff]))).toBe('-_8');
    expect(concat(new Uint8Array([1]), new Uint8Array([2, 3]))).toEqual(new Uint8Array([1, 2, 3]));
    expect(utf8Decode(utf8Encode('가나'))).toBe('가나');
  });
});

describe('md5 (RFC 1321)', () => {
  it('matches the test suite', () => {
    expect(md5Hex('')).toBe('d41d8cd98f00b204e9800998ecf8427e');
    expect(md5Hex('a')).toBe('0cc175b9c0f1b6a831c399e269772661');
    expect(md5Hex('abc')).toBe('900150983cd24fb0d6963f7d28e17f72');
    expect(md5Hex('message digest')).toBe('f96b697d7cb7938d525a2f31aaf161d0');
    expect(md5Hex('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789')).toBe(
      'd174ab98d277d9f5a5611c2c9f419d9f',
    );
    expect(md5Hex('1234567890'.repeat(8))).toBe('57edf4a22be3c955ac49da2e2107b67a');
  });
});

describe('openssl salted', () => {
  const sample = 'U2FsdGVkX18BAgMEBQYHCC/rZvfnkxRwemaGTFF+1x0zw82FJzqaSxDdPAMIA/GL';

  it('decrypts the openssl enc sample', async () => {
    const plain = await decryptOpenSslSalted(sample, 'fake-pass');
    expect(utf8Decode(plain)).toBe('popout fake plaintext');
  });

  it('rejects a wrong passphrase', async () => {
    await expect(decryptOpenSslSalted(sample, 'other-pass')).rejects.toBeInstanceOf(WrongSecretError);
  });

  it('rejects data without the header', async () => {
    const noHeader = toBase64(utf8Encode('not salted data, just some bytes here'));
    await expect(decryptOpenSslSalted(noHeader, 'fake-pass')).rejects.toBeInstanceOf(UnsupportedFormatError);
  });
});

describe('key wrapping', () => {
  it('has strong default argon2 params', () => {
    expect(DEFAULT_ARGON2.iterations).toBeGreaterThanOrEqual(2);
    expect(DEFAULT_ARGON2.memoryKiB).toBeGreaterThanOrEqual(19456);
  });

  it('wraps with a password', async () => {
    const master = newMasterKey();
    expect(master.length).toBe(32);
    const wk = await wrapWithPassword(master, 'fake-password', FAST);
    expect(wk.kind).toBe('password');
    expect(wk.kdf).toMatchObject({ name: 'argon2id', ...FAST });
    expect(fromBase64(wk.kdf!.salt).length).toBe(16);
    expect(await unwrapWithPassword(wk, 'fake-password')).toEqual(master);
    await expect(unwrapWithPassword(wk, 'wrong')).rejects.toBeInstanceOf(WrongSecretError);
  });

  it('wraps with a recovery code', async () => {
    const master = newMasterKey();
    const code = newRecoveryCode();
    const wk = await wrapWithRecoveryCode(master, code);
    expect(wk.kind).toBe('recovery');
    expect(wk.kdf?.name).toBe('hkdf');
    expect(await unwrapWithRecoveryCode(wk, code.toLowerCase().replace(/-/g, ' '))).toEqual(master);
    await expect(unwrapWithRecoveryCode(wk, newRecoveryCode())).rejects.toBeInstanceOf(WrongSecretError);
    await expect(unwrapWithRecoveryCode(wk, 'short')).rejects.toBeInstanceOf(WrongSecretError);
  });

  it('wraps with a PRF output', async () => {
    const master = newMasterKey();
    const prf = new Uint8Array(32).fill(7);
    const wk = await wrapWithPrf(master, prf, 'fake-cred-id');
    expect(wk.kind).toBe('prf');
    expect(wk.credId).toBe('fake-cred-id');
    expect(await unwrapWithPrf(wk, prf)).toEqual(master);
    await expect(unwrapWithPrf(wk, new Uint8Array(32).fill(8))).rejects.toBeInstanceOf(WrongSecretError);
  });
});

describe('recovery code', () => {
  it('has the display format', () => {
    const code = newRecoveryCode();
    expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){7}$/);
    expect(code.length).toBe(32 + 7);
    expect(code.split('-').length).toBe(8);
  });

  it('normalizes sloppy input to the same bytes', () => {
    const bytes = recoveryCodeBytes('0123-4567-89AB-CDEF-GHJK-MNPQ-RSTV-WXYZ');
    expect(bytes.length).toBe(20);
    const sloppy = 'o123 4567 89ab cdef ghjk mnpq rstv wxyz';
    expect(normalizeRecoveryCode(sloppy)).toBe('0123456789ABCDEFGHJKMNPQRSTVWXYZ');
    expect(recoveryCodeBytes(sloppy)).toEqual(bytes);
    expect(recoveryCodeBytes('I123-4567-89AB-CDEF-GHJK-MNPQ-RSTV-WXYZ')).toEqual(
      recoveryCodeBytes('1123-4567-89AB-CDEF-GHJK-MNPQ-RSTV-WXYZ'),
    );
    expect(recoveryCodeBytes('L123-4567-89AB-CDEF-GHJK-MNPQ-RSTV-WXYZ')).toEqual(
      recoveryCodeBytes('1123-4567-89AB-CDEF-GHJK-MNPQ-RSTV-WXYZ'),
    );
  });

  it('rejects wrong length and characters', () => {
    expect(() => normalizeRecoveryCode('0123-4567-89AB-CDEF-GHJK-MNPQ-RSTV-WXY')).toThrow(Error);
    expect(() => normalizeRecoveryCode('0123-4567-89AB-CDEF-GHJK-MNPQ-RSTV-WXY!')).toThrow(Error);
  });

  it('never repeats in 1000 draws', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) seen.add(newRecoveryCode());
    expect(seen.size).toBe(1000);
  });
});

describe('vault', () => {
  const fakeSecret = fromHex('48656c6c6f21deadbeef'); // 가짜 비밀키(JBSWY3DPEHPK3PXP 계열)
  const accounts: Account[] = [
    {
      id: '00000000-0000-4000-8000-000000000001',
      type: 'totp',
      issuer: 'Example',
      label: 'fake@example.test',
      secret: fakeSecret,
      algorithm: 'SHA-1',
      digits: 6,
      period: 30,
      note: '',
      pinned: false,
      matchHosts: ['example.test'],
      createdAt: 1,
      updatedAt: 2,
    },
    {
      id: '00000000-0000-4000-8000-000000000002',
      type: 'hotp',
      issuer: 'Other',
      label: 'second',
      secret: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
      algorithm: 'SHA-256',
      digits: 8,
      period: 30,
      counter: 5,
      note: 'memo',
      pinned: true,
      matchHosts: [],
      createdAt: 3,
      updatedAt: 4,
    },
  ];

  async function sha256Hex(bytes: Uint8Array) {
    return toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as BufferSource)));
  }

  async function make() {
    const master = newMasterKey();
    const wk = await wrapWithPassword(master, 'fake-password', FAST);
    const file = await encryptVault(accounts, master, 'password', [wk]);
    return { master, file };
  }

  it('round-trips accounts', async () => {
    const { master, file } = await make();
    expect(file).toMatchObject({ format: 'otpx-vault', version: 1, lock: 'password', count: 2 });
    await verifyVaultFile(file);
    const back = await decryptVault(file, master);
    expect(back).toEqual(accounts);
    expect(back[0]!.secret).toBeInstanceOf(Uint8Array);
    expect(back[0]!.secret).toEqual(fakeSecret);
    expect(JSON.stringify(file)).not.toContain('fake@example.test');
  });

  it('detects a changed ciphertext by checksum', async () => {
    const { master, file } = await make();
    const data = fromBase64(file.data);
    data[0] = data[0]! ^ 1;
    const bad: VaultFile = { ...file, data: toBase64(data) };
    await expect(verifyVaultFile(bad)).rejects.toBeInstanceOf(CorruptVaultError);
    await expect(decryptVault(bad, master)).rejects.toBeInstanceOf(CorruptVaultError);
  });

  it('fails GCM even when the checksum is fixed up', async () => {
    const { master, file } = await make();
    const data = fromBase64(file.data);
    data[0] = data[0]! ^ 1;
    const checksum = await sha256Hex(concat(fromBase64(file.iv), data));
    const bad: VaultFile = { ...file, data: toBase64(data), checksum };
    await verifyVaultFile(bad);
    await expect(decryptVault(bad, master)).rejects.toBeInstanceOf(CorruptVaultError);
  });

  it('detects a changed count', async () => {
    const { master, file } = await make();
    await expect(decryptVault({ ...file, count: 3 }, master)).rejects.toBeInstanceOf(CorruptVaultError);
  });

  it('rejects a different master key as corrupt', async () => {
    const { file } = await make();
    await expect(decryptVault(file, newMasterKey())).rejects.toBeInstanceOf(CorruptVaultError);
  });

  it('rejects wrong format or version', async () => {
    const { file } = await make();
    await expect(verifyVaultFile({ ...file, version: 2 } as unknown as VaultFile)).rejects.toBeInstanceOf(
      CorruptVaultError,
    );
    await expect(verifyVaultFile({ ...file, format: 'x' } as unknown as VaultFile)).rejects.toBeInstanceOf(
      CorruptVaultError,
    );
  });
});
