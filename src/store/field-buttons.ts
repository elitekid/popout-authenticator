// '칸 옆 넣기 단추'를 켠 계정과 사이트. 금고 밖(chrome.storage.local)이라 비밀은 없고,
// 잠겨 있어도 서비스 워커가 읽을 수 있다. 브라우저 API 만 쓴다.
import { KNOWN_FIELD_ORIGINS, knownSiteHosts } from '../core/known-sites';
import type { Account } from '../core/types';

const KEY = 'fieldButtons';
const AUTO_KEY = 'autoFieldButtons';
const SCRIPT_ID = 'otp-field';

export type FieldFillMessage = { type: 'field-fill' };
export type FieldCheckMessage = { type: 'field-check' };
export type FieldCheckReply = { enabled: boolean };

export type FieldButtons = Record<string, string[]>;
export type AutoFieldButtons = { enabled: boolean; accounts: FieldButtons };
type FieldAccount = Pick<Account, 'id' | 'issuer' | 'deletedAt'>;

const KNOWN_HOSTS = new Set(KNOWN_FIELD_ORIGINS.map((origin) => new URL(origin).hostname));

const LOOPBACK = new Set(['localhost', '127.0.0.1']);

// 호스트를 match pattern 으로. 쓸 수 없는 호스트(IP·http 전용 등)는 null.
// `https://*.host/*` 는 그 호스트와 하위 도메인을 함께 맞춘다.
export function fieldPatterns(host: string): string[] | null {
  const h = host.trim().toLowerCase().replace(/^\*\./, '');
  if (LOOPBACK.has(h)) return [`*://${h}/*`];
  const labels = h.split('.');
  if (labels.length < 2 || !labels.every((l) => /^[a-z0-9-]+$/.test(l))) return null;
  if (labels.every((l) => /^\d+$/.test(l))) return null;
  return [`https://*.${h}/*`];
}

function patternsOf(hosts: string[]): string[] {
  const out = new Set<string>();
  for (const host of hosts) for (const p of fieldPatterns(host) ?? []) out.add(p);
  return [...out];
}

// Chrome이 겹친 허락을 넓은 기존 패턴 하나로 돌려줄 수 있다.
// 이를 거두면 자동 인식에 아직 필요한 정확 호스트의 허락도 없어지므로 함께 쓰는 동안 보존한다.
function coversKnownOrigin(grant: string): boolean {
  const match = /^(https|\*):\/\/([^/]+)\/\*$/.exec(grant);
  if (!match) return false;
  const host = match[2]!;
  return [...KNOWN_HOSTS].some((known) => host === '*' || host === known ||
    (host.startsWith('*.') && (known === host.slice(2) || known.endsWith(`.${host.slice(2)}`))));
}

function asFieldButtons(raw: unknown): FieldButtons {
  const out: FieldButtons = {};
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return out;
  for (const [id, hosts] of Object.entries(raw)) {
    if (!Array.isArray(hosts)) continue;
    const list = hosts.filter((h): h is string => typeof h === 'string');
    if (list.length > 0) out[id] = list;
  }
  return out;
}

export async function readFieldButtons(): Promise<FieldButtons> {
  return asFieldButtons((await chrome.storage.local.get(KEY))[KEY]);
}

export async function readAutoFieldButtons(): Promise<AutoFieldButtons> {
  const raw = (await chrome.storage.local.get(AUTO_KEY))[AUTO_KEY];
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { enabled: false, accounts: {} };
  }
  const accounts: FieldButtons = {};
  for (const [id, hosts] of Object.entries(asFieldButtons(raw.accounts))) {
    const known = [...new Set(hosts.filter((host) => KNOWN_HOSTS.has(host)))];
    if (known.length > 0) accounts[id] = known;
  }
  return { enabled: raw.enabled === true, accounts };
}

// 수동 설정을 덮어쓰지 않고, 켜진 자동 인식의 계정만 합친다.
export async function readEffectiveFieldButtons(): Promise<FieldButtons> {
  const [manual, auto] = await Promise.all([readFieldButtons(), readAutoFieldButtons()]);
  if (auto.enabled) {
    for (const [id, hosts] of Object.entries(auto.accounts)) {
      manual[id] = [...new Set([...(manual[id] ?? []), ...hosts])];
    }
  }
  return manual;
}

async function automaticAccounts(accounts: FieldAccount[]): Promise<FieldButtons> {
  const result: FieldButtons = {};
  const needed = new Set<string>();
  for (const account of accounts) {
    if (account.deletedAt !== undefined) continue;
    const hosts = knownSiteHosts(account.issuer);
    if (hosts.length === 0) continue;
    result[account.id] = hosts;
    for (const host of hosts) needed.add(host);
  }
  const granted = new Set<string>();
  await Promise.all([...needed].map(async (host) => {
    if (await chrome.permissions.contains({ origins: [`https://${host}/*`] })) granted.add(host);
  }));
  for (const [id, hosts] of Object.entries(result)) {
    const kept = hosts.filter((host) => granted.has(host));
    if (kept.length > 0) result[id] = kept;
    else delete result[id];
  }
  return result;
}

function sameAccounts(a: FieldButtons, b: FieldButtons): boolean {
  const ids = Object.keys(a);
  return ids.length === Object.keys(b).length && ids.every((id) => {
    const other = b[id];
    return other !== undefined && a[id]!.length === other.length && a[id]!.every((host) => other.includes(host));
  });
}

export function setAutoFieldButtonsEnabled(enabled: boolean, accounts: FieldAccount[]): Promise<void> {
  return locked(async () => {
    const current = await readAutoFieldButtons();
    const next = { enabled, accounts: enabled ? await automaticAccounts(accounts) : {} };
    if (current.enabled !== enabled || !sameAccounts(current.accounts, next.accounts)) {
      await chrome.storage.local.set({ [AUTO_KEY]: next });
    }
    await syncUnlocked();
    await releaseUnlocked();
  });
}

export function refreshAutoFieldAccounts(accounts: FieldAccount[]): Promise<void> {
  return locked(async () => {
    const current = await readAutoFieldButtons();
    if (!current.enabled) return;
    const next = await automaticAccounts(accounts);
    if (sameAccounts(current.accounts, next)) return;
    await chrome.storage.local.set({ [AUTO_KEY]: { enabled: true, accounts: next } });
    await syncUnlocked();
  });
}

// 읽고-쓰고-등록하는 동작이 서로 겹치지 않게 한 잠금 안에서 돈다(창·서비스 워커 공통).
// 같은 잠금 안에서 공개 함수를 다시 부르면 교착되니 안쪽은 *Unlocked 함수만 쓴다.
async function locked<T>(work: () => Promise<T>): Promise<T> {
  return await navigator.locks.request('popout-field-buttons', work);
}

export function setFieldButton(accountId: string, hosts: string[]): Promise<void> {
  return locked(async () => {
    const all = await readFieldButtons();
    all[accountId] = hosts;
    await chrome.storage.local.set({ [KEY]: all });
  });
}

export function removeFieldButton(accountId: string): Promise<void> {
  return locked(async () => {
    const all = await readFieldButtons();
    delete all[accountId];
    await chrome.storage.local.set({ [KEY]: all });
  });
}

// 항목들의 패턴 중 권한이 허락된 것만 페이지 스크립트로 등록한다.
export function syncFieldScripts(): Promise<void> {
  return locked(syncUnlocked);
}

async function syncUnlocked(): Promise<void> {
  try {
    const [manual, auto] = await Promise.all([readFieldButtons(), readAutoFieldButtons()]);
    const wanted = [...new Set([
      ...patternsOf(Object.values(manual).flat()),
      ...(auto.enabled ? KNOWN_FIELD_ORIGINS : []),
    ])];
    const matches: string[] = [];
    for (const p of wanted) {
      if (await chrome.permissions.contains({ origins: [p] })) matches.push(p);
    }
    const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [SCRIPT_ID] });
    const registered = existing[0]?.matches ?? [];
    const unchanged = existing.length === (matches.length > 0 ? 1 : 0) &&
      matches.length === registered.length && matches.every((match) => registered.includes(match));
    if (!unchanged) {
      if (existing.length > 0) await chrome.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] });
      if (matches.length > 0) {
        await chrome.scripting.registerContentScripts([
          {
            id: SCRIPT_ID,
            matches,
            js: ['content/otp-field.js'],
            runAt: 'document_idle',
            allFrames: true,
            persistAcrossSessions: true,
          },
        ]);
      }
    }
    // 동적 등록은 앞으로 열 문서에만 적용된다. 이미 열린 허용 사이트에도 적용하고,
    // 패턴이 같아도 다시 켜거나 계정을 추가했을 때 정지된 스크립트를 되살린다.
    // 실행 중인 스크립트는 자체 플래그로 중복 실행을 막는다.
    if (matches.length > 0) {
      const tabs = await chrome.tabs.query({ url: matches });
      await Promise.allSettled(tabs.map(async (tab) => {
        if (tab.id === undefined) return;
        await chrome.scripting.executeScript({
          target: { tabId: tab.id, allFrames: true },
          files: ['content/otp-field.js'],
        });
      }));
      // 닫히거나 제한된 탭에 주입하지 못해도 저장한 설정과 나머지 탭은 유지한다.
    }
  } catch (error) {
    console.warn('field-buttons sync', error);
  }
}

// 지금 항목들이 쓰지 않는 선택 호스트 권한을 거둔다. 필수 권한은 건드리지 않는다.
export function releaseUnusedOrigins(): Promise<void> {
  return locked(releaseUnlocked);
}

async function releaseUnlocked(): Promise<void> {
  try {
    const manifest = chrome.runtime.getManifest() as {
      host_permissions?: string[];
      optional_host_permissions?: string[];
    };
    const required = new Set(manifest.host_permissions ?? []);
    const optional = new Set(manifest.optional_host_permissions ?? []);
    const [manual, auto] = await Promise.all([readFieldButtons(), readAutoFieldButtons()]);
    const inUse = new Set([
      ...patternsOf(Object.values(manual).flat()),
      ...(auto.enabled ? KNOWN_FIELD_ORIGINS : []),
    ]);
    const granted = (await chrome.permissions.getAll()).origins ?? [];
    // 선택 권한으로 받은 것만: 필수 권한이 아니고, 선택 목록이 덮는(https 전부이거나 목록 그대로) 것.
    const stale = granted.filter(
      (o) =>
        !required.has(o) &&
        !inUse.has(o) &&
        !(auto.enabled && coversKnownOrigin(o)) &&
        (optional.has(o) || (optional.has('https://*/*') && o.startsWith('https://'))),
    );
    if (stale.length > 0) await chrome.permissions.remove({ origins: stale });
  } catch (error) {
    console.warn('field-buttons release', error);
  }
}

export function clearFieldButtons(): Promise<void> {
  return locked(async () => {
    await chrome.storage.local.remove([KEY, AUTO_KEY]);
    await syncUnlocked();
    await releaseUnlocked();
  });
}

// 사용자가 크롬 설정에서 사이트 권한을 거두면 그 호스트를 항목에서 뺀다.
export function pruneRevokedHosts(): Promise<void> {
  return locked(async () => {
    const permissions = new Map<string, Promise<boolean>>();
    const granted = (pattern: string) => {
      let pending = permissions.get(pattern);
      if (!pending) {
        pending = chrome.permissions.contains({ origins: [pattern] });
        permissions.set(pattern, pending);
      }
      return pending;
    };
    const all = await readFieldButtons();
    let changed = false;
    for (const [id, hosts] of Object.entries(all)) {
      const kept: string[] = [];
      for (const host of hosts) {
        const patterns = fieldPatterns(host);
        if (patterns && (await Promise.all(patterns.map(granted))).every(Boolean)) kept.push(host);
      }
      if (kept.length === hosts.length) continue;
      changed = true;
      if (kept.length > 0) all[id] = kept;
      else delete all[id];
    }
    if (changed) await chrome.storage.local.set({ [KEY]: all });
    const auto = await readAutoFieldButtons();
    let autoChanged = false;
    for (const [id, hosts] of Object.entries(auto.accounts)) {
      const kept: string[] = [];
      for (const host of hosts) {
        if (await granted(`https://${host}/*`)) kept.push(host);
      }
      if (kept.length === hosts.length) continue;
      autoChanged = true;
      if (kept.length > 0) auto.accounts[id] = kept;
      else delete auto.accounts[id];
    }
    if (autoChanged) await chrome.storage.local.set({ [AUTO_KEY]: auto });
    await syncUnlocked();
  });
}
