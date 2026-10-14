// 입력칸 우클릭 메뉴. 'open-window' 는 open-mode.ts 가 만드니 removeAll 하지 않는다.
import { runFill } from './fill';

const MENU_ID = 'quick-fill';

export function register(): void {
  chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create(
      {
        id: MENU_ID,
        title: chrome.i18n.getMessage('menuQuickFill'),
        contexts: ['editable'],
        documentUrlPatterns: ['http://*/*', 'https://*/*'],
      },
      () => void chrome.runtime.lastError, // 이미 있으면 무시
    );
  });

  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId !== MENU_ID || tab?.id === undefined) return;
    void runFill({
      tabId: tab.id,
      frameId: info.frameId,
      // 우클릭한 프레임의 주소로 계정을 고른다(다른 사이트 iframe 에 엉뚱한 코드가 가지 않게).
      pageUrl: info.frameUrl ?? info.pageUrl ?? tab.url,
      windowId: tab.windowId,
    }).catch((error) => console.warn('quick-fill', error));
  });
}
