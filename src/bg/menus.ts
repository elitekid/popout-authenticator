// 우클릭 메뉴: 입력칸에는 '코드 넣기', 그 밖의 곳에는 '이 사이트 코드 복사'.
// 'open-window' 는 open-mode.ts 가 만드니 removeAll 하지 않는다.
import { BROWSER_TARGET } from '../core/browser';
import { runCopy, runFill } from './fill';

const MENU_ID = 'quick-fill';
const COPY_MENU_ID = 'quick-copy';
const PAGES = ['http://*/*', 'https://*/*'];

function onClicked(info: chrome.contextMenus.OnClickData, tab?: chrome.tabs.Tab): Promise<unknown> | undefined {
  if (tab?.id === undefined) return undefined;
  if (info.menuItemId === COPY_MENU_ID) {
    return runCopy({ tabId: tab.id, pageUrl: info.pageUrl ?? tab.url, windowId: tab.windowId })
      .catch((error) => console.warn('quick-copy', error));
  }
  if (info.menuItemId !== MENU_ID) return undefined;
  return runFill({
    tabId: tab.id,
    frameId: info.frameId,
    // 우클릭한 프레임의 주소로 계정을 고른다(다른 사이트 iframe 에 엉뚱한 코드가 가지 않게).
    pageUrl: info.frameUrl ?? info.pageUrl ?? tab.url,
    windowId: tab.windowId,
  }).catch((error) => console.warn('quick-fill', error));
}

export function register(): void {
  chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create(
      {
        id: MENU_ID,
        title: chrome.i18n.getMessage('menuQuickFill'),
        // Firefox의 editable 에는 password 입력칸이 빠져 있다. Chrome은 'password'를 모른다.
        contexts: BROWSER_TARGET === 'firefox'
          ? (['editable', 'password'] as chrome.contextMenus.ContextType[])
          : ['editable'],
        documentUrlPatterns: PAGES,
      },
      () => void chrome.runtime.lastError, // 이미 있으면 무시
    );
    // 입력칸은 위 항목이 더 낫다. 사이트별 계정 하위 메뉴는 열릴 탭을 미리 알아야 해서(tabs 권한) 두지 않는다.
    chrome.contextMenus.create(
      {
        id: COPY_MENU_ID,
        title: chrome.i18n.getMessage('menuQuickCopy'),
        contexts: ['page', 'frame', 'selection', 'link', 'image'],
        documentUrlPatterns: PAGES,
      },
      () => void chrome.runtime.lastError,
    );
  });

  chrome.contextMenus.onClicked.addListener((info, tab) => void onClicked(info, tab));
  // 시험용: 메뉴를 누른 것처럼 부른다.
  (globalThis as { __popoutMenuClick?: typeof onClicked }).__popoutMenuClick = onClicked;
}
