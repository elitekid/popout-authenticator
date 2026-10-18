import { BROWSER_TARGET } from '../core/browser';

const KEY = 'lastNormalWindowId';
let registered = false;
let pending: Promise<void> = Promise.resolve();

function isNormal(win: chrome.windows.Window | undefined): win is chrome.windows.Window & { id: number } {
  return win?.type === 'normal' && win.id !== undefined;
}

// Safari와 Firefox는 windowTypes를 무시하거나 거절해 별도 창이 돌아올 수 있다.
const needsFallback = BROWSER_TARGET === 'safari' || BROWSER_TARGET === 'firefox';

async function findNormalWindow(): Promise<chrome.windows.Window | undefined> {
  if (!needsFallback) {
    const win = await chrome.windows.getLastFocused({ windowTypes: ['normal'] }).catch(() => undefined);
    return isNormal(win) ? win : undefined;
  }

  // Safari는 마지막 창이 popup이면 windowTypes로 이전 일반 창을 찾지 않고 거절한다.
  const current = await chrome.windows.getLastFocused().catch(() => undefined);
  if (isNormal(current)) return current;

  const stored = await chrome.storage.session.get(KEY).catch(() => ({} as Record<string, unknown>));
  const id = stored[KEY];
  if (typeof id === 'number' && Number.isInteger(id) && id >= 0) {
    const previous = await chrome.windows.get(id).catch(() => undefined);
    if (isNormal(previous)) return previous;
  }

  // 재시작 직후 이력이 없을 때도 여러 일반 창 중 하나를 임의로 고르지 않는다.
  const normal = (await chrome.windows.getAll().catch(() => [])).filter(isNormal);
  return normal.length === 1 ? normal[0] : undefined;
}

export async function lastNormalWindow(): Promise<chrome.windows.Window | undefined> {
  // 백그라운드에 이미 들어온 포커스 사건을 저장한 뒤 대상을 읽는다.
  await pending;
  return findNormalWindow();
}

// 백그라운드에서 한 번만 등록한다. URL이나 탭은 저장하지 않고 사용할 때 다시 읽는다.
export function registerNormalWindowTracking(): void {
  if (!needsFallback || registered) return;
  registered = true;
  const enqueue = (work: () => Promise<void>) => {
    pending = pending.then(work).catch(() => undefined);
  };

  chrome.windows.onFocusChanged.addListener((id) => {
    if (id < 0) return;
    enqueue(async () => {
      const win = await chrome.windows.get(id).catch(() => undefined);
      if (isNormal(win)) await chrome.storage.session.set({ [KEY]: win.id });
    });
  });
  chrome.windows.onRemoved.addListener((id) => {
    enqueue(async () => {
      const stored = await chrome.storage.session.get(KEY);
      if (stored[KEY] === id) await chrome.storage.session.remove(KEY);
    });
  });
  enqueue(async () => {
    const win = await findNormalWindow();
    if (isNormal(win)) await chrome.storage.session.set({ [KEY]: win.id });
  });
}
