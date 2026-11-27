// 1.0.5 가져오기: 비밀번호 건 Aegis·2FAS, FreeOTP 1·2, Proton, Steam(maFile·Base64), 2FA Authenticator 의 Steam·고정·사이트.
// 봉인 파일은 모두 여기서 가짜 계정(RFC 시험 씨앗·JBSWY3DPEHPK3PXP)으로 만든다.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { AccountDraft } from '../../src/core/account';
import { decodeBase32 } from '../../src/core/base32';
import { pbkdf2Key, scryptKey, toBase64, toHex, utf8Encode, WrongSecretError } from '../../src/core/crypto';
import {
  importFile,
  importText,
  ImportRejectedError,
  NeedsPasswordError,
  parseSteamSecret,
} from '../../src/core/import';
import { gcmParameters, readSerializedStringMap } from '../../src/core/import/freeotp';
import { scryptWithinBounds } from '../../src/core/import/sealed';
import { generateCode } from '../../src/core/otp';

const formats = JSON.parse(
  readFileSync(fileURLToPath(new URL('../fixtures/2fa-import-formats.json', import.meta.url)), 'utf8'),
) as Record<string, Record<string, unknown>>;

const RFC_SEED = utf8Encode('12345678901234567890');
const RFC_SHA1_8 = '94287082';
const T59 = 59_000;
const code = (d: AccountDraft): Promise<string> => generateCode(d, T59);
const find = (drafts: AccountDraft[], issuer: string): AccountDraft => {
  const d = drafts.find((x) => x.issuer === issuer);
  if (!d) throw new Error(`draft not found: ${issuer}`);
  return d;
};
const rejected = async (p: Promise<unknown>): Promise<ImportRejectedError> => {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(ImportRejectedError);
  return err as ImportRejectedError;
};

// AES-GCM 봉인: 암호문 끝 16바이트가 태그.
async function seal(key: Uint8Array, plain: Uint8Array, iv: Uint8Array, aad?: Uint8Array, tagBytes = 16) {
  const k = await crypto.subtle.importKey('raw', key as BufferSource, 'AES-GCM', false, ['encrypt']);
  const params: AesGcmParams = { name: 'AES-GCM', iv: iv as BufferSource, tagLength: tagBytes * 8 };
  if (aad) params.additionalData = aad as BufferSource;
  const out = new Uint8Array(await crypto.subtle.encrypt(params, k, plain as BufferSource));
  return { body: out.subarray(0, out.length - tagBytes), tag: out.subarray(out.length - tagBytes), all: out };
}
const bytes = (n: number, start = 1) => Uint8Array.from({ length: n }, (_, i) => (start + i * 7) & 0xff);

// ---- Aegis ----
const AEGIS_SCRYPT = { n: 1024, r: 8, p: 1 };
async function aegisSlot(password: string, master: Uint8Array, salt: Uint8Array, cost = AEGIS_SCRYPT) {
  const derived = await scryptKey(utf8Encode(password), salt, cost.n, cost.r, cost.p);
  const nonce = bytes(12, salt[0]);
  const s = await seal(derived, master, nonce);
  return {
    type: 1,
    uuid: crypto.randomUUID(),
    key: toHex(s.body),
    key_params: { nonce: toHex(nonce), tag: toHex(s.tag) },
    ...cost,
    salt: toHex(salt),
  };
}
async function sealedAegis(passwords: string[], opts: { biometricFirst?: boolean; cost?: typeof AEGIS_SCRYPT } = {}) {
  const master = bytes(32, 9);
  const nonce = bytes(12, 3);
  const vault = await seal(master, utf8Encode(JSON.stringify(formats.aegis!.db)), nonce);
  const slots: unknown[] = [];
  if (opts.biometricFirst) slots.push({ type: 2, uuid: 'bio', key: 'ab'.repeat(32), key_params: { nonce: '00'.repeat(12), tag: '00'.repeat(16) } });
  for (const [i, pw] of passwords.entries()) slots.push(await aegisSlot(pw, master, bytes(32, 40 + i), opts.cost));
  return {
    version: 1,
    header: { slots, params: { nonce: toHex(nonce), tag: toHex(vault.tag) } },
    db: toBase64(vault.body),
  };
}

describe('Aegis with a password', () => {
  it('opens with any password slot, past a biometric slot', async () => {
    const file = JSON.stringify(await sealedAegis(['first-pass', 'backup-pass'], { biometricFirst: true }));
    await expect(importText(file)).rejects.toBeInstanceOf(NeedsPasswordError);
    for (const pw of ['first-pass', 'backup-pass']) {
      const out = await importText(file, pw);
      expect(out.format).toBe('aegis');
      expect(out.drafts).toHaveLength(5);
      expect(await code(find(out.drafts, 'GitHub'))).toBe(RFC_SHA1_8);
      expect(find(out.drafts, 'Steam').type).toBe('steam');
    }
  }, 30_000);

  it('tells a wrong password from a damaged vault', async () => {
    const good = await sealedAegis(['right-pass']);
    await expect(importText(JSON.stringify(good), 'wrong-pass')).rejects.toBeInstanceOf(WrongSecretError);
    const header = good.header as { params: { tag: string } };
    const damaged = { ...good, header: { ...header, params: { ...header.params, tag: '00'.repeat(16) } } };
    const err = await rejected(importText(JSON.stringify(damaged), 'right-pass'));
    expect(err.reason).toBe('damaged');
    expect(err.app).toBe('Aegis');
  }, 30_000);

  it('refuses a scrypt cost over the cap before asking for a password', async () => {
    const file = await sealedAegis(['x']);
    const slot = (file.header.slots as Record<string, unknown>[])[0]!;
    slot.n = 2 ** 20;
    const err = await rejected(importText(JSON.stringify(file)));
    expect(err.reason).toBe('damaged');
    expect(scryptWithinBounds({ n: 32768, r: 8, p: 1 })).toBe(true);
    expect(scryptWithinBounds({ n: 131072, r: 8, p: 1 })).toBe(true);
    expect(scryptWithinBounds({ n: 262144, r: 8, p: 1 })).toBe(false);
    expect(scryptWithinBounds({ n: 32768, r: 8, p: 64 })).toBe(false);
    expect(scryptWithinBounds({ n: 1000, r: 8, p: 1 })).toBe(false);
    expect(scryptWithinBounds({ n: 32768, r: 0, p: 1 })).toBe(false);
    // n 이 작아도 r·p 가 크면 따로 큰 메모리를 잡는다.
    expect(scryptWithinBounds({ n: 2, r: 524288, p: 8 })).toBe(false);
    expect(scryptWithinBounds({ n: 1024, r: 8, p: 65 })).toBe(false);
  }, 30_000);

  it('caps the scrypt work summed over all password slots', async () => {
    const file = await sealedAegis(['a', 'b']);
    for (const slot of file.header.slots as Record<string, unknown>[]) Object.assign(slot, { n: 32768, r: 8, p: 20 });
    const err = await rejected(importText(JSON.stringify(file)));
    expect(err.reason).toBe('damaged');
    expect(scryptWithinBounds({ n: 32768, r: 8, p: 20 })).toBe(true);
  }, 30_000);

  it('keeps a file that is not valid UTF-8 instead of refusing it', async () => {
    const bytes = Uint8Array.from([...utf8Encode('otpauth://totp/Caf'), 0xfc, ...utf8Encode('?secret=JBSWY3DPEHPK3PXP&issuer=Example\n')]);
    const out = await importFile(bytes, 'links.txt');
    expect(out.drafts).toHaveLength(1);
    expect(out.drafts[0]!.issuer).toBe('Example');
  });

  it('calls a fake-ciphertext file damaged or wrong, never plain', async () => {
    const fake = JSON.stringify(formats.aegisEncrypted);
    await expect(importText(fake)).rejects.toBeInstanceOf(NeedsPasswordError);
    await expect(importText(fake, 'anything')).rejects.toBeInstanceOf(WrongSecretError);
  }, 30_000);

  it('matches the scrypt test vector of RFC 7914', async () => {
    const out = await scryptKey(utf8Encode('password'), utf8Encode('NaCl'), 1024, 8, 16);
    expect(toHex(out)).toBe('fdbabe1c9d3472007856e7190d01e9fe7c6ad7cbc8237830e77376634b373162');
  });
});

// ---- 2FAS ----
async function sealed2fas(password: string) {
  const plain = formats.twoFas!;
  const salt = bytes(256, 11);
  const iv = bytes(12, 5);
  const key = await pbkdf2Key(password, salt, 10_000, 'SHA-256');
  const s = await seal(key, utf8Encode(JSON.stringify(plain.services)), iv);
  return { ...plain, services: [], servicesEncrypted: `${toBase64(s.all)}:${toBase64(salt)}:${toBase64(iv)}`, reference: 'x' };
}

describe('2FAS with a password', () => {
  it('opens, refuses a wrong password, and calls a short field damaged', async () => {
    const file = JSON.stringify(await sealed2fas('fake-pass'));
    await expect(importText(file)).rejects.toBeInstanceOf(NeedsPasswordError);
    await expect(importText(file, 'nope')).rejects.toBeInstanceOf(WrongSecretError);
    const out = await importText(file, 'fake-pass');
    expect(out.format).toBe('2fas');
    expect(out.drafts).toHaveLength(4);
    expect(await code(find(out.drafts, 'GitHub'))).toBe(RFC_SHA1_8);
    expect(out.meta![0]!.group).toBe('Work');
    const err = await rejected(importText(JSON.stringify(formats.twoFasEncrypted), 'x'));
    expect(err.reason).toBe('damaged');
    expect(err.app).toBe('2FAS');
  });
});

// ---- 2FA Authenticator 1.16 ----
describe('2FA Authenticator backup', () => {
  it('reads Steam, pinned and linked sites, and fails an unknown type alone', async () => {
    const file = {
      version: '2.0',
      accounts: [
        { id: 'a', name: 'gamer', issuer: 'Steam', type: 'steam', secret: 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', digits: 5 },
        {
          id: 'b', name: 'alice', issuer: 'GitHub', secret: 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', digits: 8, pinned: true,
          sites: ['https://www.GitHub.com/login', 'github.com', 'gist.github.com.', '', 7],
        },
        { id: 'c', name: 'x', issuer: 'Odd', type: 'hotp', secret: 'JBSWY3DPEHPK3PXP' },
      ],
    };
    const out = await importText(JSON.stringify(file));
    expect(out.format).toBe('2fa');
    expect(out.drafts.map((d) => d.type)).toEqual(['steam', 'totp']);
    expect(out.meta![0]).toEqual({});
    expect(out.meta![1]).toEqual({ pinned: true, matchHosts: ['github.com', 'gist.github.com'] });
    expect(await code(out.drafts[1]!)).toBe(RFC_SHA1_8);
    expect(out.failed).toHaveLength(1);
    expect(out.failed[0]!.source).toBe('Odd:x');
  });
});

// ---- Proton ----
describe('Proton Authenticator', () => {
  it('reads a plain export with Steam, a note and an unnamed link', async () => {
    const file = {
      version: 1,
      entries: [
        { id: '1', content: { uri: 'otpauth://totp/GitHub:alice?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=GitHub&digits=8', entry_type: 'Totp', name: 'GitHub' }, note: ' memo ' },
        { id: '2', content: { uri: 'steam://MTIzNDU2Nzg5MDEyMzQ1Njc4OTA', entry_type: 'Steam', name: 'gamer' }, note: '' },
        { id: '3', content: { uri: 'otpauth://totp/?secret=JBSWY3DPEHPK3PXP', entry_type: 'Totp', name: 'NoLabel' } },
        { id: '4', content: { uri: 'otpauth://totp/Bad?issuer=Bad', entry_type: 'Totp', name: 'Bad' } },
      ],
    };
    const out = await importText(JSON.stringify(file));
    expect(out.format).toBe('proton');
    expect(out.drafts).toHaveLength(3);
    expect(await code(find(out.drafts, 'GitHub'))).toBe(RFC_SHA1_8);
    expect(out.meta![0]).toEqual({ note: 'memo' });
    const steam = find(out.drafts, 'Steam');
    expect(steam.type).toBe('steam');
    expect(steam.label).toBe('gamer');
    expect(steam.secret).toEqual(RFC_SEED);
    expect(find(out.drafts, 'NoLabel').label).toBe('');
    expect(out.failed.map((f) => f.source)).toEqual(['Bad']);
  });

  it('refuses an encrypted export', async () => {
    const err = await rejected(importText(JSON.stringify({ version: 1, salt: 'c2FsdA==', content: 'RkFLRQ==' })));
    expect(err.reason).toBe('encrypted');
    expect(err.app).toBe('Proton Authenticator');
  });
});

// ---- Steam ----
describe('Steam', () => {
  it('picks the reading that gives a 20-byte key', () => {
    const b32 = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
    expect(parseSteamSecret(b32)).toEqual(RFC_SEED);
    expect(parseSteamSecret(b32.toLowerCase())).toEqual(RFC_SEED);
    expect(parseSteamSecret('MTIzNDU2Nzg5MDEyMzQ1Njc4OTA=')).toEqual(RFC_SEED);
    expect(parseSteamSecret('MTIzNDU2Nzg5MDEyMzQ1Njc4OTA')).toEqual(RFC_SEED);
    // 글자가 모두 Base32 에도 있는 Base64: 길이로 Base64 를 고른다.
    const ambiguous = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ4=';
    expect(parseSteamSecret(ambiguous)).toHaveLength(20);
    expect(toBase64(parseSteamSecret(ambiguous))).toBe(ambiguous);
    // URL 안전 Base64.
    const raw = Uint8Array.from({ length: 20 }, (_, i) => 0xf8 + (i % 8));
    expect(parseSteamSecret(toBase64(raw).replace(/\+/g, '-').replace(/\//g, '_'))).toEqual(raw);
    // 나눠 적은 Base32 는 Base32.
    expect(parseSteamSecret('JBSW Y3DP EHPK 3PXP')).toEqual(decodeBase32('JBSWY3DPEHPK3PXP'));
    expect(() => parseSteamSecret('!!!')).toThrow();
  });

  it('reads a maFile and refuses an encrypted one and a manifest', async () => {
    const maFile = { shared_secret: 'MTIzNDU2Nzg5MDEyMzQ1Njc4OTA=', account_name: 'gamer', identity_secret: 'aWQ=', revocation_code: 'R00000' };
    const out = await importText(JSON.stringify(maFile));
    expect(out.format).toBe('steam-mafile');
    expect(out.drafts).toEqual([expect.objectContaining({ type: 'steam', issuer: 'Steam', label: 'gamer', secret: RFC_SEED })]);

    const sealedBody = toBase64(bytes(64, 77));
    const enc = await rejected(importFile(utf8Encode(sealedBody), '76561198000000000.maFile'));
    expect(enc.reason).toBe('encrypted');
    expect(enc.app).toBe('Steam Desktop Authenticator');
    // 이름이 maFile 이 아니면 그냥 알 수 없는 글.
    expect((await rejected(importFile(utf8Encode(sealedBody), 'notes.txt'))).reason).toBe('unknown');

    const manifest = { encrypted: false, entries: [{ filename: '76561198000000000.maFile', steamid: 76561198000000000 }] };
    expect((await rejected(importText(JSON.stringify(manifest)))).reason).toBe('steamManifest');
    expect((await rejected(importText(JSON.stringify({ ...manifest, encrypted: true })))).reason).toBe('encrypted');
  });
});

// ---- FreeOTP 1.x ----
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const signed = (b: Uint8Array) => Array.from(b, (x) => (x > 127 ? x - 256 : x));

describe('FreeOTP 1.x tokens.xml', () => {
  it('reads tokens in order, decodes entities and makes Steam', async () => {
    const tokens: Record<string, unknown> = {
      'Example:alice & bob': { algo: 'SHA1', counter: 0, digits: 6, issuerExt: 'Example', label: 'alice & bob', period: 30, secret: signed(decodeBase32('JBSWY3DPEHPK3PXP')), type: 'TOTP' },
      'Steam:gamer': { algo: 'SHA1', digits: 5, issuerExt: 'Steam', label: 'gamer', period: 30, secret: signed(RFC_SEED), type: 'TOTP' },
      'Corp:vpn': { algo: 'SHA1', counter: 5, digits: 6, issuerExt: 'Corp', label: 'vpn', secret: signed(RFC_SEED), type: 'HOTP' },
      // 1.x 키는 "발급자:이름" 그대로라 -token 으로 끝나도 계정이다(FreeOTP 2 의 짝 키와 다르다).
      'Example:deploy-token': { algo: 'SHA1', digits: 6, issuerExt: 'Example', label: 'deploy-token', period: 30, secret: signed(RFC_SEED), type: 'TOTP' },
    };
    const lines = Object.entries(tokens).map(([k, v]) => `    <string name="${esc(k)}">${esc(JSON.stringify(v))}</string>`);
    const xml = [
      "<?xml version='1.0' encoding='utf-8' standalone='yes' ?>",
      '<map>',
      `    <string name="tokenOrder">${esc(JSON.stringify(['Corp:vpn', 'Steam:gamer', 'Example:alice & bob']))}</string>`,
      ...lines,
      '</map>',
    ].join('\n');
    const out = await importText(xml);
    expect(out.format).toBe('freeotp');
    expect(out.drafts.map((d) => `${d.issuer}/${d.label}/${d.type}`)).toEqual([
      'Corp/vpn/hotp',
      'Steam/gamer/steam',
      'Example/alice & bob/totp',
      'Example/deploy-token/totp',
    ]);
    expect(out.drafts[0]!.counter).toBe(5);
  });

  it('does not take another app settings file', async () => {
    const xml = '<?xml version="1.0"?>\n<map>\n  <string name="theme">dark</string>\n</map>';
    expect((await rejected(importText(xml))).reason).toBe('unknown');
  });
});

// ---- FreeOTP 2 ----
// Java 수정 UTF-8: U+FFFF 너머는 UTF-16 반쪽마다 3바이트.
function javaUtf(s: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 1 && c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    else out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
  }
  return out;
}
function serializedMap(pairs: [string, string][]): Uint8Array {
  const out: number[] = [];
  const u16 = (n: number) => out.push((n >> 8) & 0xff, n & 0xff);
  const u32 = (n: number) => out.push((n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff);
  const utf = (s: string) => {
    const b = javaUtf(s);
    u16(b.length);
    out.push(...b);
  };
  out.push(0xac, 0xed, 0x00, 0x05, 0x73, 0x72);
  utf('java.util.HashMap');
  out.push(0x05, 0x07, 0xda, 0xc1, 0xc3, 0x16, 0x60, 0xd1, 0x03);
  u16(2);
  out.push(0x46);
  utf('loadFactor');
  out.push(0x49);
  utf('threshold');
  out.push(0x78, 0x70, 0x3f, 0x40, 0x00, 0x00);
  u32(24);
  out.push(0x77, 0x08);
  u32(32);
  u32(pairs.length);
  for (const [k, v] of pairs) {
    for (const s of [k, v]) {
      out.push(0x74);
      utf(s);
    }
  }
  out.push(0x78);
  return Uint8Array.from(out);
}
async function freeOtpSealed(key: Uint8Array, plain: Uint8Array, token: string, nonceStart: number) {
  const nonce = bytes(12, nonceStart);
  const s = await seal(key, plain, nonce, utf8Encode(token));
  return {
    mCipher: 'AES/GCM/NoPadding',
    mCipherText: signed(s.all),
    mParameters: signed(Uint8Array.from([0x30, 0x11, 0x04, 0x0c, ...nonce, 0x02, 0x01, 0x10])),
    mToken: token,
  };
}
async function freeOtp2(password: string, opts: { iterations?: number; damageId?: string; dropKeyOf?: string; steamId?: string } = {}) {
  const salt = bytes(32, 21);
  const iterations = opts.iterations ?? 1000;
  const master = bytes(32, 99);
  const pwKey = await pbkdf2Key(password, salt, 1000, 'SHA-512');
  const masterKey = {
    mAlgorithm: 'PBKDF2withHmacSHA512',
    mEncryptedKey: await freeOtpSealed(pwKey, master, 'AES', 1),
    mHashAlgorithm: 'SHA-256',
    mIterations: iterations,
    mSalt: signed(salt),
  };
  const tokens: [string, Record<string, unknown>, Uint8Array][] = [
    ['u-github', { algo: 'SHA1', digits: 8, issuerExt: 'GitHub', label: 'alice', period: 30, type: 'TOTP' }, RFC_SEED],
    [opts.steamId ?? 'u-steam', { algo: 'SHA1', digits: 5, issuerExt: 'Steam', label: 'gamer 🎮', period: 30, type: 'TOTP' }, RFC_SEED],
    ['u-corp', { algo: 'SHA1', counter: 5, digits: 6, issuerExt: 'Corp', label: 'vpn', type: 'HOTP' }, RFC_SEED],
    ['u-broken', { algo: 'SHA1', digits: 6, issuerExt: 'Broken', label: 'x', type: 'TOTP' }, RFC_SEED],
  ];
  const pairs: [string, string][] = [['masterKey', JSON.stringify(masterKey)]];
  let n = 50;
  for (const [id, token, secret] of tokens) {
    const sealedKey = await freeOtpSealed(master, secret, 'HmacSHA1', n++);
    if (id === opts.damageId) sealedKey.mCipherText[0] = (sealedKey.mCipherText[0]! ^ 1) as number;
    pairs.push([`${id}-token`, JSON.stringify(token)]);
    if (id !== opts.dropKeyOf) pairs.push([id, JSON.stringify({ key: JSON.stringify(sealedKey) })]);
  }
  pairs.push(['tokenOrder', JSON.stringify(['u-corp', 'u-github', opts.steamId ?? 'u-steam', 'u-broken'])]);
  return serializedMap(pairs);
}

describe('FreeOTP 2 backup', () => {
  it('opens a backup, keeps order, makes Steam and fails only the damaged entry', async () => {
    const file = await freeOtp2('fake-pass', { damageId: 'u-broken' });
    expect(readSerializedStringMap(file).get('u-steam-token')).toContain('gamer 🎮');
    await expect(importFile(file, 'externalBackup.xml')).rejects.toBeInstanceOf(NeedsPasswordError);
    await expect(importFile(file, 'externalBackup.xml', 'nope')).rejects.toBeInstanceOf(WrongSecretError);
    const out = await importFile(file, 'externalBackup.xml', 'fake-pass');
    expect(out.format).toBe('freeotp2');
    expect(out.drafts.map((d) => `${d.issuer}/${d.label}/${d.type}`)).toEqual([
      'Corp/vpn/hotp',
      'GitHub/alice/totp',
      'Steam/gamer 🎮/steam',
    ]);
    expect(await code(find(out.drafts, 'GitHub'))).toBe(RFC_SHA1_8);
    expect(find(out.drafts, 'Corp').counter).toBe(5);
    expect(out.failed.map((f) => f.source)).toEqual(['Broken:x']);
  });

  it('lists an entry whose sealed key is missing as a failure', async () => {
    const out = await importFile(await freeOtp2('fake-pass', { dropKeyOf: 'u-steam' }), 'b.xml', 'fake-pass');
    expect(out.drafts.map((d) => d.issuer)).toEqual(['Corp', 'GitHub', 'Broken']);
    expect(out.failed.map((f) => f.source)).toEqual(['u-steam']);
  });

  it('pairs an id that itself ends in -token without a spurious failure', async () => {
    const out = await importFile(await freeOtp2('fake-pass', { steamId: 'u-steam-token' }), 'b.xml', 'fake-pass');
    expect(out.drafts.map((d) => d.issuer)).toEqual(['Corp', 'GitHub', 'Steam', 'Broken']);
    expect(out.failed).toEqual([]);
  });

  it('refuses an iteration count over the cap and a broken stream', async () => {
    const heavy = await freeOtp2('fake-pass', { iterations: 10_000_000 });
    const err = await rejected(importFile(heavy, 'b.xml', 'fake-pass'));
    expect(err.reason).toBe('damaged');
    expect(err.app).toBe('FreeOTP');
    const file = await freeOtp2('fake-pass');
    expect((await rejected(importFile(file.subarray(0, file.length - 40), 'b.xml', 'fake-pass'))).reason).toBe('damaged');
  });

  it('reads Java GCM parameters', () => {
    const nonce = bytes(12);
    expect(gcmParameters(Uint8Array.from([0x30, 0x11, 0x04, 0x0c, ...nonce, 0x02, 0x01, 0x10]))).toEqual({ nonce, tagLength: 128 });
    expect(gcmParameters(Uint8Array.from([0x30, 0x0e, 0x04, 0x0c, ...nonce]))).toEqual({ nonce, tagLength: 96 });
    expect(gcmParameters(Uint8Array.from([0x04, 0x0c, ...nonce]))).toEqual({ nonce, tagLength: 128 });
    expect(() => gcmParameters(Uint8Array.from([0x30, 0x11, 0x04, 0x0c, ...nonce, 0x02, 0x01, 0x08]))).toThrow();
    expect(() => gcmParameters(Uint8Array.from([0x30, 0x40, 0x04]))).toThrow();
  });
});
