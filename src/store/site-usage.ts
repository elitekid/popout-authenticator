// 사이트별 사용 기록. 잠금이 꺼져 있으면 local, 켜져 있으면 session 에만 둬서
// 어느 사이트를 쓰는지 디스크에 남기지 않는다.
import type { SiteUsage } from '../core/suggest';
import { loadSettings } from './settings';
import { readVaultFile } from './vault';

const KEY = 'siteUsage';

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
  const area = await place();
  const all = asSiteUsage((await area.get(KEY))[KEY]);
  const site = (all[hostname.toLowerCase()] ??= {});
  const cur = (site[id] ??= { s: 0, c: 0 });
  if (kind === 'site') cur.s++;
  else cur.c++;
  await area.set({ [KEY]: all });
}
