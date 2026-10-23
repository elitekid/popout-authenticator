// 열기 방식(팝업·분리 창·사이드 패널) 적용과 분리 창 하나 열기.
import { loadSettings, onSettingsChanged } from '../store/settings';
import { BROWSER_TARGET, getSidebarAction } from '../core/browser';

const MENU_ID = 'open-window';
const DEFAULT_WIDTH = 400;
const DEFAULT_HEIGHT = 640;

type Bounds = { width: number; height: number; left?: number; top?: number };
const SIDEBAR_CLICK_KEY = 'popout-open-mode';

// Firefox 이벤트 페이지가 툴바 클릭으로 깨어나도 첫 클릭에서 동기로 판단한다.
// storage.local 을 기다리면 sidebarAction.open의 사용자 동작 권한을 잃는다.
function cachedSidebarOnClick(): boolean {
  if (BROWSER_TARGET !== 'firefox') return false;
  try { return localStorage.getItem(SIDEBAR_CLICK_KEY) === 'sidepanel'; }
  catch { return false; }
}
let sidebarOnClick = cachedSidebarOnClick();

function asBounds(raw: unknown): Bounds | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { width, height, left, top } = raw as Record<string, unknown>;
  if (typeof width !== 'number' || typeof height !== 'number') return null;
  const out: Bounds = { width, height };
  if (typeof left === 'number' && typeof top === 'number') {
    out.left = left;
    out.top = top;
  }
  return out;
}

export async function applyOpenMode(): Promise<void> {
  const { openMode } = await loadSettings();
  let mode = openMode;
  const panel = chrome.sidePanel;
  let panelOk = false;
  sidebarOnClick = mode === 'sidepanel' && !!getSidebarAction();
  if (BROWSER_TARGET === 'firefox') {
    try { localStorage.setItem(SIDEBAR_CLICK_KEY, mode); }
    catch { /* 저장이 금지된 환경에서도 현재 열린 배경 페이지는 동작한다. */ }
  }
  if (panel && typeof panel.setPanelBehavior === 'function') {
    try {
      await panel.setPanelBehavior({ openPanelOnActionClick: mode === 'sidepanel' });
      panelOk = true;
    } catch (error) {
      console.warn('sidePanel.setPanelBehavior', error);
    }
  }
  // 사이드 패널을 못 쓰면 팝업처럼 둔다.
  if (mode === 'sidepanel' && !panelOk && !sidebarOnClick) mode = 'popup';
  await chrome.action.setPopup({ popup: mode === 'popup' ? 'popup.html' : '' });
}

async function openOnce(openerUrl?: string): Promise<void> {
  const got = await chrome.storage.session.get('detachedWindowId');
  if (openerUrl) await chrome.storage.session.set({ openerUrl });
  else await chrome.storage.session.remove('openerUrl');

  const id = got.detachedWindowId;
  if (typeof id === 'number') {
    const alive = await chrome.windows.get(id).then(
      () => true,
      () => false,
    );
    if (alive) {
      await chrome.windows.update(id, { focused: true });
      return;
    }
  }

  const saved = asBounds((await chrome.storage.local.get('windowBounds')).windowBounds);
  const base = {
    url: chrome.runtime.getURL('window.html'),
    type: 'popup' as const,
    width: saved?.width ?? DEFAULT_WIDTH,
    height: saved?.height ?? DEFAULT_HEIGHT,
  };
  let created: chrome.windows.Window;
  if (saved?.left !== undefined && saved.top !== undefined) {
    try {
      created = await chrome.windows.create({ ...base, left: saved.left, top: saved.top });
    } catch {
      // 저장된 위치가 화면 밖(모니터를 뺀 경우)이면 위치 없이 다시 연다.
      created = await chrome.windows.create(base);
    }
  } else {
    created = await chrome.windows.create(base);
  }
  if (created.id !== undefined) {
    detachedId = created.id;
    await chrome.storage.session.set({ detachedWindowId: created.id });
  }
}

// 분리 창 id 를 기억해 두어 일반 창의 크기 바뀜마다 storage 를 읽지 않는다.
let detachedId: number | undefined;

// 빠르게 두 번 불려도 창이 하나만 생기게 차례로 처리한다.
let queue: Promise<void> = Promise.resolve();
function serial(fn: () => Promise<void>): Promise<void> {
  const run = queue.then(fn);
  queue = run.catch(() => undefined);
  return run;
}

export function openDetachedWindow(openerUrl?: string): Promise<void> {
  return serial(() => openOnce(openerUrl));
}

// 툴바 팝업에서 이어 가는 작은 작업 창은 하나만 둔다. 다시 열면 앞으로 가져오고,
// 다른 작업이면 그 창의 탭 주소만 바꾼다(같은 주소면 입력 내용을 지키려고 건드리지 않는다).
async function openTaskOnce(url: string): Promise<void> {
  const got = await chrome.storage.session.get('taskWindowId');
  const id = got.taskWindowId;
  if (typeof id === 'number') {
    const win = await chrome.windows.get(id, { populate: true }).then((w) => w, () => undefined);
    if (win) {
      const tab = win.tabs?.[0];
      if (tab?.id !== undefined && tab.url !== url) await chrome.tabs.update(tab.id, { url });
      await chrome.windows.update(id, { focused: true });
      return;
    }
  }
  const created = await chrome.windows.create({
    url, type: 'popup', focused: true, width: 440, height: 660,
  });
  if (created.id !== undefined) await chrome.storage.session.set({ taskWindowId: created.id });
}

export function openTaskWindowOnce(url: string): Promise<void> {
  return serial(() => openTaskOnce(url));
}

function openFromEvent(openerUrl?: string): void {
  void openDetachedWindow(openerUrl).catch((error) => console.warn('open-window', error));
}

export function register(): void {
  chrome.action.onClicked.addListener((tab) => {
    const sidebar = getSidebarAction();
    // Firefox 는 사용자 동작 처리기 안에서 바로 불러야 하므로 여기서 storage 를 기다리지 않는다.
    if (sidebarOnClick && sidebar) {
      void sidebar.open().catch((error) => console.warn('sidebarAction.open', error));
      return;
    }
    openFromEvent(tab.url);
  });

  chrome.commands.onCommand.addListener((command, tab) => {
    if (command === 'open-window') openFromEvent(tab?.url);
  });

  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === MENU_ID) openFromEvent(tab?.url);
  });

  chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create(
      {
        id: MENU_ID,
        title: chrome.i18n.getMessage('menuOpenWindow'),
        contexts: ['action'],
      },
      () => void chrome.runtime.lastError, // 이미 있으면 무시
    );
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (typeof message === 'object' && message !== null && message.type === 'open-task-window') {
      const target = typeof message.url === 'string' ? message.url : '';
      if (!target.startsWith(chrome.runtime.getURL('manage.html'))) {
        sendResponse({ ok: false });
        return false;
      }
      openTaskWindowOnce(target).then(
        () => sendResponse({ ok: true }),
        (error) => {
          console.warn('open-task-window', error);
          sendResponse({ ok: false });
        },
      );
      return true;
    }
    if (typeof message !== 'object' || message === null || message.type !== 'open-window') {
      return false;
    }
    const url = typeof message.openerUrl === 'string' ? message.openerUrl : undefined;
    openDetachedWindow(url).then(
      () => sendResponse({ ok: true }),
      (error) => {
        console.warn('open-window', error);
        sendResponse({ ok: false });
      },
    );
    return true;
  });

  void chrome.storage.session.get('detachedWindowId').then((got) => {
    if (typeof got.detachedWindowId === 'number') detachedId = got.detachedWindowId;
  });

  chrome.windows.onBoundsChanged?.addListener((win) => {
    if (win.id === undefined || win.id !== detachedId) return;
    void (async () => {
      if (win.state !== undefined && win.state !== 'normal') return;
      const bounds = asBounds({ width: win.width, height: win.height, left: win.left, top: win.top });
      if (bounds) await chrome.storage.local.set({ windowBounds: bounds });
    })().catch((error) => console.warn('windowBounds', error));
  });

  // 열기와 같은 줄에서 처리해, 늦게 온 닫힘이 새 창 id 를 지우지 않게 한다.
  chrome.windows.onRemoved.addListener((windowId) => {
    void serial(async () => {
      const got = await chrome.storage.session.get(['detachedWindowId', 'taskWindowId']);
      if (got.taskWindowId === windowId) await chrome.storage.session.remove('taskWindowId');
      if (got.detachedWindowId !== windowId) return;
      detachedId = undefined;
      await chrome.storage.session.remove('detachedWindowId');
    }).catch((error) => console.warn('detachedWindowId', error));
  });

  // 서비스 워커가 깰 때마다(시작·설치 포함) 적용하고, 설정이 바뀌면 다시 적용한다.
  const apply = () => void applyOpenMode().catch((error) => console.warn('openMode', error));
  onSettingsChanged(apply);
  apply();
}
