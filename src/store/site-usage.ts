// 사이트별 사용 기록. 잠금이 꺼져 있으면 local, 켜져 있으면 session 에만 둬서
// 어느 사이트를 쓰는지 디스크에 남기지 않는다.
import type { SiteUsage } from '../core/suggest';
import { loadSettings } from './settings';
import { readVaultFile } from './vault';

const KEY = 'siteUsage';
export const MAX_SITES = 500;

function withLock<T>(work: () => Promise<T>): Promise<T> {
  return navigator.locks.request('popout-site-usage', work) as Promise<T>;
}

function asSiteUsage(raw: unknown): SiteUsage {
  const out: SiteUsage = {};
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return out;
  for (const [domain, byId] of Object.entries(raw)) {
    if (typeof byId !== 'object' || byId === null || Array.isArray(byId)) continue;
    const entry: SiteUsage[string] = {};
    for (const [id, v] of Object.entries(byId)) {
      const { s, c } = (v ?? {}) as { s?: unknown; c?: unknown };
      entry[id] = { s: typeof s === 'number' ? s : 0, c: typeof c === 'number' ? c : 0 };
    }
    out[domain] = entry;
  }
  return out;
}

// 잠금이 켜져 있으면 session, 아니면 local. 잠금이 켜졌으면 local 것은 지운다.
async function place(): Promise<chrome.storage.StorageArea> {
  // 세션 키만으로는 판단하지 않는다(잠금 없는 사본 복구·원격 해제 뒤 옛 키가 남을 수 있다).
  const file = await readVaultFile();
  if (file !== null && file.lock !== 'none') {
    await chrome.storage.local.remove(KEY);
    return chrome.storage.session;
  }
  return chrome.storage.local;
}

export async function readSiteUsage(): Promise<SiteUsage> {
  try {
    const area = await place();
    return asSiteUsage((await area.get(KEY))[KEY]);
  } catch {
    return {};
  }
}

export async function recordSiteUse(
  hostname: string,
  id: string,
  kind: 'site' | 'copy',
): Promise<void> {
  if (!(await loadSettings()).suggestionsEnabled) return;
  // 읽고-고치고-쓰는 사이에 다른 창·서비스 워커가 끼어 횟수가 사라지지 않게 묶는다.
  await withLock(async () => {
    const area = await place();
    const all = asSiteUsage((await area.get(KEY))[KEY]);
    const host = hostname.toLowerCase();
    // 방금 쓴 사이트를 맨 뒤로 옮기고, 넘치면 가장 오래 안 쓴 앞쪽부터 지운다.
    const site = all[host] ?? {};
    delete all[host];
    all[host] = site;
    const cur = (site[id] ??= { s: 0, c: 0 });
    if (kind === 'site') cur.s++;
    else cur.c++;
    for (const old of Object.keys(all).slice(0, Math.max(0, Object.keys(all).length - MAX_SITES))) delete all[old];
    await area.set({ [KEY]: all });
  });
}
