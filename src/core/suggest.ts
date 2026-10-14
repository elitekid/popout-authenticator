// 현재 탭 주소에 맞는 계정 추천·하나 고르기. 브라우저 API 를 쓰지 않는다.
import type { Account } from './types';

// { [호스트]: { [계정 id]: { s: 그 사이트에서 넣은 횟수, c: 복사 횟수 } } }
// 기본 도메인으로 묶지 않는다: github.io 처럼 하위 도메인마다 주인이 다른 곳이 있다.
export type SiteUsage = Record<string, Record<string, { s: number; c: number }>>;

export type SuggestContext = { url?: string; usage?: SiteUsage };

type Suggestable = Pick<Account, 'id' | 'issuer' | 'label' | 'matchHosts' | 'deletedAt'>;

const SECOND_LEVEL = new Set(['co', 'com', 'org', 'net', 'gov', 'edu', 'ac']);

// 마지막 두 칸. 두 글자 최상위 도메인 앞이 co·com 같은 칸이면 세 칸.
export function baseDomain(host: string): string {
  const h = host.toLowerCase().replace(/\.$/, '');
  if (h.includes(':') || /^\d+(\.\d+){3}$/.test(h)) return h;
  const labels = h.split('.');
  if (labels.length <= 2) return h;
  const last = labels[labels.length - 1]!;
  const second = labels[labels.length - 2]!;
  const take = last.length === 2 && SECOND_LEVEL.has(second) ? 3 : 2;
  return labels.slice(-take).join('.');
}

export function hostOf(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return undefined;
    return u.hostname.toLowerCase() || undefined;
  } catch {
    return undefined;
  }
}

// 저장한 호스트와 같거나 그 하위 도메인일 때만 같은 사이트로 본다.
function matchesHost(entry: string, host: string, _base?: string): boolean {
  const e = entry.trim().toLowerCase().replace(/^\*\./, '');
  return e !== '' && (host === e || host.endsWith(`.${e}`));
}

// 호스트가 들어 있는 계정이 이 사이트와 맞는지(다른 모듈이 '기억할까요' 판단에 쓴다).
export function matchesSite(matchHosts: string[], host: string): boolean {
  const h = host.toLowerCase();
  return matchHosts.some((m) => matchesHost(m, h));
}

function nameMatches(a: Suggestable, base: string): boolean {
  const name = base.split('.')[0]!;
  if (name.length < 3) return false;
  const issuer = a.issuer.trim().toLowerCase();
  if (issuer.length >= 3 && (issuer.includes(name) || name.includes(issuer))) return true;
  return a.label.toLowerCase().includes(name);
}

type Parts = { host: string; base: string; live: Suggestable[] };

function parts(accounts: Suggestable[], url: string | undefined): Parts | null {
  const host = hostOf(url);
  if (host === undefined) return null;
  return {
    host,
    base: baseDomain(host),
    live: accounts.filter((a) => a.deletedAt === undefined),
  };
}

function byCount(
  live: Suggestable[],
  usage: SiteUsage | undefined,
  host: string,
  key: 's' | 'c',
): Suggestable[] {
  const site = usage?.[host];
  if (!site) return [];
  return live
    .map((a, i) => ({ a, i, n: site[a.id]?.[key] ?? 0 }))
    .filter((x) => x.n > 0)
    .sort((x, y) => y.n - x.n || x.i - y.i)
    .map((x) => x.a);
}

function unique(ids: string[]): string[] {
  return [...new Set(ids)];
}

export function suggestAccountIds(accounts: Suggestable[], ctx: SuggestContext): string[] {
  const p = parts(accounts, ctx.url);
  if (!p) return [];
  const byHost = p.live.filter((a) => a.matchHosts.some((m) => matchesHost(m, p.host, p.base)));
  const byName = p.live.filter((a) => nameMatches(a, p.base));
  return unique([
    ...byHost.map((a) => a.id),
    ...byCount(p.live, ctx.usage, p.host, 's').map((a) => a.id),
    ...byName.map((a) => a.id),
    ...byCount(p.live, ctx.usage, p.host, 'c').map((a) => a.id),
  ]);
}

// 하나만 골라야 할 때(단축키·우클릭·팝업 강조). 지정 사이트가 맞는 계정만 고르고 애매하면 null.
// 이름 추측·전체 계정의 넣은 기록으로는 고르지 않는다(비슷한 피싱 주소로 코드가 가지 않게).
export function fillCandidate(accounts: Suggestable[], ctx: SuggestContext): string | null {
  const p = parts(accounts, ctx.url);
  if (!p) return null;
  const byHost = p.live.filter((a) => a.matchHosts.some((m) => matchesHost(m, p.host, p.base)));
  if (byHost.length === 1) return byHost[0]!.id;
  if (byHost.length === 0) return null;
  // 지정 사이트 후보가 여럿이면 그 안에서만 넣은 기록으로 고르고, 없으면 고르지 않는다.
  const used = byCount(byHost, ctx.usage, p.host, 's');
  return used.length > 0 ? used[0]!.id : null;
}

// 이미 사이트를 확인한 후보(칸 옆 단추) 안에서 이 사이트에 가장 많이 넣은 계정.
export function mostUsedOnSite(accounts: Suggestable[], ctx: SuggestContext): string | null {
  const p = parts(accounts, ctx.url);
  return p ? (byCount(p.live, ctx.usage, p.host, 's')[0]?.id ?? null) : null;
}
