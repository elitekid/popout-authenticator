import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { makeDraft } from '../../src/core/account';
import { encodeHex } from '../../src/core/base32';
import { WrongSecretError, fromBase64Url } from '../../src/core/crypto';
import { generateCode } from '../../src/core/otp';
import {
  buildShareLink,
  codeAt,
  createShareFragment,
  MAX_SHARE_SECONDS,
  openShareFragment,
  SHARE_PAGE_URL,
} from '../../src/core/share';

type Vector = {
  name: string;
  durationSec: number;
  nowMs: number;
  password?: string;
  fragment: string;
  validUntilMs: number;
  startCounter: number;
  issuer: string;
  label: string;
  codes: string[];
};

const vectors = JSON.parse(
  readFileSync(new URL('../fixtures/2fa-share-vectors.json', import.meta.url), 'utf8'),
) as { cases: Vector[] };

describe('reference share vectors', () => {
  for (const v of vectors.cases) {
    it(`opens: ${v.name}`, async () => {
      const opened = await openShareFragment(v.fragment, v.password);
      expect(opened.issuer).toBe(v.issuer);
      expect(opened.name).toBe(v.label);
      expect(opened.firstCounter).toBe(v.startCounter);
      expect(opened.codes).toEqual(v.codes);
      expect((v.startCounter + opened.codes.length) * opened.period * 1000).toBe(v.validUntilMs);
    });
  }
});

const SECRET = Uint8Array.from([0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x21, 0xde, 0xad, 0xbe, 0xef]);
const NOW = 1700000000000;

const draft = (over: Partial<Parameters<typeof makeDraft>[0]> = {}) =>
  makeDraft({
    type: 'totp',
    issuer: 'Example',
    label: 'alice@example.com',
    secret: SECRET,
    algorithm: 'SHA-1',
    ...over,
  });

describe('createShareFragment / openShareFragment', () => {
  it('round-trips without a password', async () => {
    const d = draft({ digits: 8, period: 60, algorithm: 'SHA-256' });
    const fragment = await createShareFragment(d, NOW, 600);
    expect(fragment).not.toContain('#');
    const opened = await openShareFragment(fragment);
    expect(opened).toMatchObject({ issuer: 'Example', name: 'alice@example.com', period: 60, digits: 8 });
    expect(opened.codes).toHaveLength(11);
    for (const t of [NOW, NOW + 60_000, NOW + 540_000]) {
      expect(codeAt(opened, t)).toBe(await generateCode(d, t));
    }
    expect(codeAt(opened, NOW + 3 * 3600_000)).toBeNull();
    expect(codeAt(opened, NOW - 5 * 60_000)).toBeNull();
  });

  it('round-trips with a password and rejects a wrong or missing one', async () => {
    const d = draft({ issuer: '', label: '가족 · 🙂' });
    const fragment = await createShareFragment(d, NOW, 300, 'correct horse');
    const opened = await openShareFragment(fragment, 'correct horse');
    expect(opened).toMatchObject({ issuer: '', name: '가족 · 🙂' });
    expect(codeAt(opened, NOW)).toBe(await generateCode(d, NOW));
    await expect(openShareFragment(fragment, 'wrong')).rejects.toBeInstanceOf(WrongSecretError);
    await expect(openShareFragment(fragment)).rejects.toThrow('needs password');
  });

  it('refuses durations over an hour or under five minutes', async () => {
    await expect(createShareFragment(draft(), NOW, MAX_SHARE_SECONDS + 60)).rejects.toThrow();
    await expect(createShareFragment(draft(), NOW, 299)).rejects.toThrow();
    await expect(createShareFragment(draft(), NOW, MAX_SHARE_SECONDS)).resolves.toBeTypeOf('string');
  });

  it('refuses non-totp accounts', async () => {
    const hotp = makeDraft({ type: 'hotp', issuer: '', label: 'h', secret: SECRET, algorithm: 'SHA-1' });
    await expect(createShareFragment(hotp, NOW, 300)).rejects.toThrow();
  });

  it('never puts the secret in the envelope', async () => {
    for (const password of [undefined, 'pw']) {
      const fragment = await createShareFragment(draft(), NOW, 3600, password);
      expect(encodeHex(fromBase64Url(fragment))).not.toContain('48656c6c6f21deadbeef');
    }
  });

  it('builds a link from a base', () => {
    expect(buildShareLink('https://example.invalid/share', 'abc')).toBe('https://example.invalid/share#abc');
    expect(buildShareLink(SHARE_PAGE_URL, 'abc')).toBe('https://elitekid.github.io/popout-authenticator/share/#abc');
    expect(() => buildShareLink('', 'abc')).toThrow();
  });
});
