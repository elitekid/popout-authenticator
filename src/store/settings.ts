// 설정은 chrome.storage.local 의 'settings' 에 둔다. 저장값은 사용자 값 그대로이고, 읽을 때 관리자 정책을 덮는다.
import { DEFAULT_SETTINGS, type Settings } from '../core/types';
import { applyPolicy, readPolicy } from './policy';
import { BROWSER_TARGET, supportsBrowserSync, supportsClipboardClear } from '../core/browser';

const KEY = 'settings';

// 저장한 선택은 보존하되, 이 브라우저에서 실행할 수 없는 동작은 정책보다 뒤에서 막는다.
function applyBrowser(settings: Settings): Settings {
  if (!supportsBrowserSync()) settings.syncEnabled = false;
  if (!supportsClipboardClear()) settings.clipboardClearAfterCopy = false;
  if (BROWSER_TARGET === 'safari' && settings.openMode === 'sidepanel') settings.openMode = 'popup';
  return settings;
}

// 기본값에 없는 키는 버린다.
function pick(raw: unknown): Partial<Settings> {
  const out: Record<string, unknown> = {};
  if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
    for (const key of Object.keys(DEFAULT_SETTINGS)) {
      if (key in raw) out[key] = (raw as Record<string, unknown>)[key];
    }
  }
  return out as Partial<Settings>;
}

// 정책을 덮지 않은 저장값.
async function loadStored(): Promise<Settings> {
  const got = await chrome.storage.local.get(KEY);
  return { ...DEFAULT_SETTINGS, ...pick(got[KEY]) };
}

export async function loadSettings(): Promise<Settings> {
  const [stored, policy] = await Promise.all([loadStored(), readPolicy()]);
  return applyBrowser(applyPolicy(stored, policy));
}

// 강제값이 저장되지 않게 정책을 덮지 않은 저장값에 patch 를 쓰고, 돌려줄 때만 정책을 덮는다.
// 여러 창·서비스 워커가 읽고-고쳐-쓰기를 겹치지 않게 줄을 세운다(다른 칸의 변경을 덮지 않게).
export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const write = async () => {
    const merged: Settings = { ...(await loadStored()), ...pick(patch) };
    await chrome.storage.local.set({ [KEY]: merged });
    return merged;
  };
  const next =
    typeof navigator !== 'undefined' && navigator.locks
      ? await navigator.locks.request('popout-settings-write', write)
      : await write();
  return applyBrowser(applyPolicy(next, await readPolicy()));
}

export function onSettingsChanged(cb: (s: Settings) => void): () => void {
  // 정책을 다시 읽는 사이 뒤 변화가 먼저 끝날 수 있어, 마지막 변화의 결과만 넘긴다.
  let seq = 0;
  const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area !== 'local' || !(KEY in changes)) return;
    const stored: Settings = { ...DEFAULT_SETTINGS, ...pick(changes[KEY].newValue) };
    const mine = ++seq;
    void readPolicy().then((policy) => {
      if (mine === seq) cb(applyBrowser(applyPolicy(stored, policy)));
    });
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
