// 가짜 사이트 경고에서 사용자가 '진짜 사이트'라고 한 도메인. 사이트 사용 기록과 같이
// 잠금이 꺼져 있으면 local, 켜져 있으면 session 에만 둔다(어느 서비스를 쓰는지 디스크에 남기지 않게).
// 추천을 꺼도 지우지 않는다(대답은 추천과 상관없이 지켜야 한다).
import { registrableDomain } from '../core/lookalike';
import { siteWarning, withTrusted, type Lookalike, type SiteWarnTrusted } from '../core/site-check';
import type { Account, Settings } from '../core/types';
import { readAutoFieldButtons, readFieldButtons } from './field-buttons';
import { loadSettings } from './settings';
import { readSiteUsage, recordSiteUse } from './site-usage';
import { readVaultFile } from './vault';

export const SITE_WARN_TRUSTED_KEY = 'siteWarnTrusted';
const MAX_DOMAINS = 500;

function asTrusted(raw: unknown): SiteWarnTrusted {
  const out: SiteWarnTrusted = {};
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return out;
  for (const [domain, ids] of Object.entries(raw)) {
    if (!Array.isArray(ids)) continue;
    const kept = ids.filter((id): id is string => typeof id === 'string');
    if (kept.length > 0) out[domain] = kept;
  }
  return out;
}

async function place(): Promise<chrome.storage.StorageArea> {
  const file = await readVaultFile();
  if (file !== null && file.lock !== 'none') {
    await chrome.storage.local.remove(SITE_WARN_TRUSTED_KEY);
    return chrome.storage.session;
  }
  return chrome.storage.local;
}

export async function readSiteWarnTrusted(): Promise<SiteWarnTrusted> {
  try {
    const area = await place();
    return asTrusted((await area.get(SITE_WARN_TRUSTED_KEY))[SITE_WARN_TRUSTED_KEY]);
  } catch {
    return {};
  }
}

// 이 계정 코드를 지금 페이지로 넘기기 전에 볼 경고. 끄면·판정할 수 없으면 null(조용한 쪽).
// all 은 금고의 계정 전체(다른 계정의 진짜 이름은 흉내로 보지 않는다).
export async function checkSite(
  hostname: string | undefined,
  account: Account,
  all: readonly Account[],
  known?: Pick<Settings, 'siteWarnEnabled' | 'suggestionsEnabled'>,
): Promise<Lookalike | null> {
  if (!hostname) return null;
  try {
    // 화면은 이미 읽은 설정을 넘긴다(관리 정책을 다시 읽으면 첫 복사가 늦어진다).
    const settings = known ?? await loadSettings();
    if (!settings.siteWarnEnabled) return null;
    const [usage, trusted, buttons, auto] = await Promise.all([
      settings.suggestionsEnabled ? readSiteUsage() : Promise.resolve({}),
      readSiteWarnTrusted(),
      readFieldButtons(),
      readAutoFieldButtons(),
    ]);
    const extraSites: Record<string, string[]> = {};
    for (const a of all) {
      const sites = [...(buttons[a.id] ?? []), ...(auto.enabled ? auto.accounts[a.id] ?? [] : [])];
      if (sites.length > 0) extraSites[a.id] = sites;
    }
    return siteWarning(hostname, account, all, { usage, trusted, extraSites });
  } catch {
    return null;
  }
}

export async function trustSite(hostname: string, accountId: string): Promise<void> {
  await navigator.locks.request('popout-site-warn', async () => {
    const area = await place();
    const current = asTrusted((await area.get(SITE_WARN_TRUSTED_KEY))[SITE_WARN_TRUSTED_KEY]);
    // 방금 고른 도메인이 맨 뒤로 가게 지웠다가 다시 넣고, 넘치면 오래된 앞쪽부터 버린다.
    const domain = registrableDomain(hostname);
    const next = withTrusted(current, hostname, accountId);
    const ordered: SiteWarnTrusted = {};
    for (const [d, ids] of Object.entries(next)) if (d !== domain) ordered[d] = ids;
    ordered[domain] = next[domain]!;
    const keys = Object.keys(ordered);
    for (const old of keys.slice(0, Math.max(0, keys.length - MAX_DOMAINS))) delete ordered[old];
    await area.set({ [SITE_WARN_TRUSTED_KEY]: ordered });
  });
  // 그 사이트를 이 계정에 쓴다는 근거이기도 하다(추천을 끈 경우 기록하지 않는다).
  await recordSiteUse(hostname, accountId, 'site').catch(() => undefined);
}
