import { describe, expect, it } from 'vitest';
import { KNOWN_FIELD_ORIGINS, knownSiteHosts } from '../../src/core/known-sites';
import {
  baseDomain,
  fillCandidate,
  hostOf,
  suggestAccountIds,
  type SiteUsage,
} from '../../src/core/suggest';

function acc(id: string, issuer: string, matchHosts: string[] = [], deletedAt?: number) {
  return { id, issuer, label: `${id}@mail.test`, matchHosts, deletedAt };
}

describe('알려진 서비스의 칸 옆 넣기', () => {
  it('명시한 별칭만 대소문자·공백을 정리해 정확히 연결한다', () => {
    expect(knownSiteHosts('  gItHuB  ')).toEqual(['github.com']);
    expect(knownSiteHosts('github.com')).toEqual(['github.com']);
    expect(knownSiteHosts('Google   Account')).toEqual(['accounts.google.com']);
    expect(knownSiteHosts('JetBrains Account')).toEqual(['account.jetbrains.com']);
    expect(knownSiteHosts('Dropbox')).toEqual(['www.dropbox.com', 'dropbox.com']);
  });

  it('부분 문자열·사용자 도메인·URL을 추측하지 않고 HTTPS 정확 호스트만 요청한다', () => {
    for (const issuer of ['GitHub Enterprise', 'github.com.evil.test', 'github.io', 'https://github.com', 'My Google']) {
      expect(knownSiteHosts(issuer)).toEqual([]);
    }
    expect(KNOWN_FIELD_ORIGINS).toHaveLength(7);
    expect(KNOWN_FIELD_ORIGINS.every((origin) => /^https:\/\/[a-z.]+\/\*$/.test(origin))).toBe(true);
  });
});

describe('baseDomain', () => {
  it('마지막 두 칸, 두 글자 최상위 도메인 앞이 co 따위면 세 칸', () => {
    expect(baseDomain('mail.google.co.kr')).toBe('google.co.kr');
    expect(baseDomain('github.com')).toBe('github.com');
    expect(baseDomain('a.b.example.com')).toBe('example.com');
    expect(baseDomain('127.0.0.1')).toBe('127.0.0.1');
  });
});

describe('hostOf', () => {
  it('http·https 만', () => {
    expect(hostOf('https://Login.Example.com/a')).toBe('login.example.com');
    expect(hostOf('chrome://extensions')).toBeUndefined();
    expect(hostOf(undefined)).toBeUndefined();
  });
});

describe('suggestAccountIds', () => {
  const url = 'https://www.acme.com/login';
  const accounts = [
    acc('name', 'Acme Cloud'),
    acc('copied', 'Other1'),
    acc('site', 'Other2'),
    acc('host', 'Other3', ['acme.com']),
    acc('trashed', 'Acme', ['acme.com'], 1),
    acc('none', 'Other4'),
  ];
  const usage: SiteUsage = {
    'www.acme.com': { site: { s: 3, c: 0 }, copied: { s: 0, c: 5 }, trashed: { s: 9, c: 9 } },
  };

  it('일치 → 넣은 횟수 → 이름 → 복사 횟수 순, 휴지통 제외', () => {
    expect(suggestAccountIds(accounts, { url, usage })).toEqual(['host', 'site', 'name', 'copied']);
  });

  it('http 가 아니거나 주소가 없으면 빈 목록', () => {
    expect(suggestAccountIds(accounts, { url: 'chrome://extensions', usage })).toEqual([]);
    expect(suggestAccountIds(accounts, { usage })).toEqual([]);
  });
});

describe('fillCandidate', () => {
  const url = 'https://acme.com/';

  it('이름만 맞으면 고르지 않는다', () => {
    expect(fillCandidate([acc('a', 'Acme One'), acc('b', 'Acme Two')], { url })).toBeNull();
    expect(fillCandidate([acc('a', 'Acme'), acc('b', 'Zzz')], { url })).toBeNull();
    expect(fillCandidate([acc('a', 'Acme', ['acme.com'])], { url: 'https://acmee.com/' })).toBeNull();
  });

  it('호스트 일치가 하나면 그것, 여럿이면 그 안의 넣은 횟수 첫째', () => {
    expect(fillCandidate([acc('a', 'X', ['acme.com']), acc('b', 'Y')], { url })).toBe('a');
    const list = [acc('a', 'X', ['acme.com']), acc('b', 'Y', ['acme.com'])];
    const usage: SiteUsage = { 'acme.com': { b: { s: 2, c: 0 } } };
    expect(fillCandidate(list, { url, usage })).toBe('b');
  });

  it('지정 사이트가 없으면 넣은 기록이 있어도 고르지 않는다', () => {
    const usage: SiteUsage = { 'acme.com': { a: { s: 5, c: 0 } } };
    expect(fillCandidate([acc('a', 'X'), acc('b', 'Y')], { url, usage })).toBeNull();
  });
});

describe('감사 반영', () => {
  it('하위 도메인마다 주인이 다른 곳(github.io)을 한 사이트로 묶지 않는다', () => {
    const list = [acc('alice', 'Pages', ['alice.github.io'])];
    expect(fillCandidate(list, { url: 'https://bob.github.io/' })).toBeNull();
    expect(fillCandidate(list, { url: 'https://alice.github.io/x' })).toBe('alice');
  });
  it('지정 사이트 후보가 여럿이면 그 안에서만 넣은 기록으로 고른다', () => {
    const list = [acc('a', 'X', ['acme.com']), acc('b', 'Y', ['acme.com']), acc('c', 'Z')];
    const usage: SiteUsage = { 'acme.com': { c: { s: 9, c: 0 } } };
    expect(fillCandidate(list, { url: 'https://acme.com/', usage })).toBeNull();
  });
});
