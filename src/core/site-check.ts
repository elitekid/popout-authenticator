// 코드가 계정 사이트를 흉내 낸 페이지로 가기 직전의 판정. 브라우저 API 를 쓰지 않는다.
// authenticator-sh/2fa (MIT) src/utils/site-check.ts 의 checkSite 를 옮겼다(통계·사용 횟수 보내기는 뺐다).
// 무엇이 흉내인지는 lookalike.ts 에 있다. 기기 안에서만 판정하고 아무것도 보내지 않는다.
import { lookalikeOf, referencesFor, registrableDomain, type Lookalike } from './lookalike';
import { matchesSite, type SiteUsage } from './suggest';
import type { Account } from './types';

export type { Lookalike } from './lookalike';

// { [등록 도메인]: 사용자가 '진짜 사이트'라고 한 계정 id(최근 20개) }
export type SiteWarnTrusted = Record<string, string[]>;

export const TRUSTED_MAX_IDS = 20;

type Checkable = Pick<Account, 'id' | 'issuer' | 'matchHosts' | 'deletedAt'>;

export type SiteCheckContext = {
  usage?: SiteUsage;
  trusted?: SiteWarnTrusted;
  // 계정마다 사용자가 고른 칸 옆 단추 사이트·자동으로 켠 알려진 사이트.
  extraSites?: Record<string, string[]>;
};

// 이 계정 코드를 넣었던 호스트. 복사 기록은 쓰지 않는다(아무 탭이나 열린 채 복사하므로).
function usedOn(usage: SiteUsage | undefined, id: string): string[] {
  if (!usage) return [];
  return Object.entries(usage)
    .filter(([, byId]) => (byId[id]?.s ?? 0) > 0)
    .map(([host]) => host);
}

function sitesOf(account: Checkable, ctx: SiteCheckContext): string[] {
  return [...account.matchHosts, ...(ctx.extraSites?.[account.id] ?? [])];
}

// 이 호스트가 계정 사이트를 흉내 내면 그 내용을, 아니면 null.
// 계정에 묶은 사이트·사용자가 진짜라고 한 도메인·다른 계정의 진짜 이름이면 null.
export function siteWarning(
  hostname: string | null | undefined,
  account: Checkable,
  all: readonly Checkable[],
  ctx: SiteCheckContext = {},
): Lookalike | null {
  if (!hostname) return null;
  try {
    const host = hostname.toLowerCase();
    const sites = sitesOf(account, ctx);
    if (matchesSite(sites, host)) return null;
    if (ctx.trusted?.[registrableDomain(host)]?.includes(account.id)) return null;
    const refs = referencesFor({ issuer: account.issuer, matchHosts: sites }, usedOn(ctx.usage, account.id));
    if (refs.length === 0) return null;
    const others = all
      .filter((other) => other.id !== account.id && other.deletedAt === undefined)
      .flatMap((other) => referencesFor({ issuer: other.issuer, matchHosts: sitesOf(other, ctx) }, usedOn(ctx.usage, other.id)));
    return lookalikeOf(host, refs, others);
  } catch {
    return null;
  }
}

// '진짜 사이트입니다'를 누른 뒤의 기억. 같은 도메인의 계정 목록 끝에 붙이고 20개까지 둔다.
export function withTrusted(trusted: SiteWarnTrusted, hostname: string, accountId: string): SiteWarnTrusted {
  const domain = registrableDomain(hostname);
  const ids = (trusted[domain] ?? []).filter((id) => id !== accountId);
  return { ...trusted, [domain]: [...ids, accountId].slice(-TRUSTED_MAX_IDS) };
}
