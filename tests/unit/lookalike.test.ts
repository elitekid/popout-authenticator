// 가짜 사이트 판정. 사례는 authenticator-sh/2fa (MIT) test/lookalike.test.ts 에서 옮겼다.
import { describe, expect, it } from 'vitest';
import { decodeHost, registrableDomain } from '../../src/core/lookalike';
import { siteWarning, withTrusted, type SiteCheckContext } from '../../src/core/site-check';
import type { SiteUsage } from '../../src/core/suggest';

type Acc = { id: string; issuer: string; matchHosts: string[]; deletedAt?: number };
const acc = (id: string, issuer: string, matchHosts: string[] = []): Acc => ({ id, issuer, matchHosts });

const GITHUB = acc('gh', 'GitHub');
const PAYPAL = acc('pp', 'PayPal');
const MS = acc('ms', 'Microsoft');
const AWS = acc('aws', 'Amazon Web Services');
const STEAM = acc('st', 'Steam');
const GOOGLE = acc('go', 'Google');
const ALL = [GITHUB, PAYPAL, MS, AWS, STEAM, GOOGLE];
const kind = (host: string, account: Acc, all: Acc[] = ALL, ctx: SiteCheckContext = {}) =>
  siteWarning(host, account, all, ctx)?.kind ?? null;
const used = (host: string, id: string): SiteUsage => ({ [host]: { [id]: { s: 1, c: 0 } } });

describe('look-alike sites', () => {
  it.each([
    ['githuh.com', GITHUB, 'typo'],
    ['gihtub.com', GITHUB, 'typo'],
    ['githubb.io', GITHUB, 'typo'],
    ['g1thub.com', GITHUB, 'homoglyph'],
    ['xn--gthub-n4a.com', GITHUB, 'homoglyph'],
    ['paypa1.com', PAYPAL, 'homoglyph'],
    ['pay-pal.com', PAYPAL, null],
    ['xn--gthub-n2e.com', GITHUB, 'homoglyph'],
    ['xn--pypal-4ve.com', PAYPAL, 'homoglyph'],
    ['rnicrosoft.com', MS, 'homoglyph'],
    ['github-login.com', GITHUB, 'lure'],
    ['login-github.net', GITHUB, 'lure'],
    ['secure-paypal-verify.com', PAYPAL, 'lure'],
    ['githubverify.com', GITHUB, 'lure'],
    ['github-com.xyz', GITHUB, 'lure'],
    ['microsoft-account.support', MS, 'lure'],
    ['github.com.verify-session.xyz', GITHUB, 'embedded'],
    ['github.com-secure-login.info', GITHUB, 'embedded'],
    ['stearn.com', STEAM, 'homoglyph'],
    ['steam-trade-confirm.com', STEAM, null],
    ['GitHub-Login.com', GITHUB, 'lure'],
  ] as const)('%s → %s', (host, account, expected) => {
    expect(kind(host, account)).toBe(expected);
  });

  it.each([
    ['github.com', GITHUB], ['gist.github.com', GITHUB], ['github.io', GITHUB], ['github.co', GITHUB],
    ['githubusercontent.com', GITHUB], ['githubstatus.com', GITHUB], ['gitlab.com', GITHUB],
    ['login.microsoftonline.com', MS], ['live.com', MS], ['microsoft.com', MS],
    ['signin.aws.amazon.com', AWS], ['amazon.de', AWS], ['d-123.awsapps.com', AWS], ['amazonaws.com', AWS],
    ['steamcommunity.com', STEAM], ['store.steampowered.com', STEAM],
    ['accounts.google.com', GOOGLE], ['googleusercontent.com', GOOGLE], ['google-analytics.com', GOOGLE],
    ['paypal-community.com', PAYPAL], ['paypalobjects.com', PAYPAL],
    ['vercel.com', GITHUB], ['example.com', GITHUB], ['192.168.1.10', GITHUB], ['localhost', GITHUB],
  ] as const)('%s stays quiet', (host, account) => {
    expect(kind(host, account)).toBeNull();
  });

  it('ignores issuers that name no brand', () => {
    for (const issuer of ['vpn', 'Login', 'Admin portal', 'My Bank', 'Company', 'Work', 'x', '']) {
      const a = acc('g', issuer);
      expect(kind('login-portal-secure.com', a, [a])).toBeNull();
    }
  });

  it('does not call another account’s real name a fake', () => {
    const stripe = acc('sp', 'Stripe');
    const strike = acc('sk', 'Strike');
    expect(kind('strike.me', stripe, [stripe])).toBe('typo');
    expect(kind('strike.me', stripe, [stripe, strike])).toBeNull();
    // 휴지통의 계정은 다른 계정으로 치지 않는다.
    expect(kind('strike.me', stripe, [stripe, { ...strike, deletedAt: 1 }])).toBe('typo');
  });

  it('counts the account’s own sites, tied by hand or by use', () => {
    const corp = acc('corp', 'Okta', ['acme.okta.com']);
    expect(kind('acme.okta.com', corp, [corp])).toBeNull();
    const self = acc('self', 'Self-hosted', ['vault.mycorp-tools.dev']);
    expect(kind('mycorp-tool.dev', self, [self])).toBe('typo');
    expect(kind('git.mycorp-tools.dev', self, [self])).toBeNull();
    const wild = acc('w', 'Self-hosted', ['*.mycorp-tools.dev']);
    expect(kind('mycorp-tool.dev', wild, [wild])).toBe('typo');

    const bank = acc('eb', 'EB');
    const usage = used('portal.examplebank.com', 'eb');
    expect(kind('examplebank-secure.com', bank, [bank], { usage })).toBe('lure');
    expect(kind('www.examplebank.com', bank, [bank], { usage })).toBeNull();
    expect(siteWarning('examplebank-secure.com', bank, [bank], { usage })).toEqual({ kind: 'lure', like: 'examplebank.com', basis: 'site' });
    // 복사 기록만 있는 사이트는 근거가 아니다.
    expect(kind('examplebank-secure.com', bank, [bank], { usage: { 'portal.examplebank.com': { eb: { s: 0, c: 3 } } } })).toBeNull();
    expect(kind('pay-pal.com', PAYPAL, [PAYPAL], { usage: used('www.paypal.com', 'pp') })).toBe('homoglyph');
  });

  it('counts field-button sites as the account’s own', () => {
    const corp = acc('c', 'Acme');
    expect(kind('sso.acmecorp.dev', corp, [corp], { extraSites: { c: ['sso.acmecorp.dev'] } })).toBeNull();
    expect(kind('acmecorp-login.dev', corp, [corp], { extraSites: { c: ['sso.acmecorp.dev'] } })).toBe('lure');
  });

  it('remembers “it’s the real site” for that account only', () => {
    expect(kind('github-login.com', GITHUB)).toBe('lure');
    const trusted = withTrusted({}, 'www.github-login.com', 'gh');
    expect(trusted).toEqual({ 'github-login.com': ['gh'] });
    expect(kind('github-login.com', GITHUB, ALL, { trusted })).toBeNull();
    expect(kind('sub.github-login.com', GITHUB, ALL, { trusted })).toBeNull();
    const other = acc('gh2', 'GitHub');
    expect(kind('github-login.com', other, [other], { trusted })).toBe('lure');
  });

  it('keeps the last 20 accounts per domain, newest last', () => {
    let trusted = {};
    for (let i = 0; i < 25; i++) trusted = withTrusted(trusted, 'x-login.com', `a${i}`);
    trusted = withTrusted(trusted, 'x-login.com', 'a10');
    const ids = (trusted as Record<string, string[]>)['x-login.com']!;
    expect(ids).toHaveLength(20);
    expect(ids.at(-1)).toBe('a10');
    expect(ids.filter((id) => id === 'a10')).toHaveLength(1);
  });

  it('is quiet without a host', () => {
    expect(siteWarning(undefined, GITHUB, ALL)).toBeNull();
    expect(siteWarning('', GITHUB, ALL)).toBeNull();
  });

  it('reads punycode as the letters it stands for', () => {
    expect(decodeHost('xn--gthub-n2e.com')).toBe('gіthub.com');
    expect(decodeHost('xn--pple-43d.com')).toBe('аpple.com');
    expect(decodeHost('github.com')).toBe('github.com');
    expect(decodeHost('xn--broken!.com')).toBe('xn--broken!.com');
  });

  it('finds the registrable domain', () => {
    expect(registrableDomain('login.github.com')).toBe('github.com');
    expect(registrableDomain('x.example.co.uk')).toBe('example.co.uk');
    expect(registrableDomain('www.naver.co.kr')).toBe('naver.co.kr');
    expect(registrableDomain('alice.github.io')).toBe('alice.github.io');
    expect(registrableDomain('localhost')).toBe('localhost');
    expect(registrableDomain('GitHub.com.')).toBe('github.com');
  });
});
