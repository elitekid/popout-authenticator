// 지금 탭을 캡처해 캡처 화면(capture.html)에서 QR 을 찾게 한다.
// 화면 선택 모드(mode=display)는 캡처 화면이 getDisplayMedia 로 다른 앱 화면을 받는다.
import { readPolicy } from '../store/policy';
import { readVaultFile } from '../store/vault';

type Origin = { tabId: number; windowId?: number };

// 관리자 정책이 비밀번호를 강제하는데 잠금이 꺼져 있으면 캡처를 막는다(추가 화면과 같은 판별).
export async function passwordRequired(): Promise<boolean> {
  const policy = await readPolicy();
  if (!policy.enforcePassword) return false;
  const file = await readVaultFile();
  return file === null || file.lock === 'none';
}

// 캡처를 시작한 탭을 캡처 id 별로 기억한다(서비스 워커가 재시작돼도 남게 storage.session).
async function findOrigin(windowId?: number, sender?: chrome.tabs.Tab): Promise<Origin | null> {
  if (sender?.id !== undefined) return { tabId: sender.id, windowId: sender.windowId };
  try {
    const [tab] = await chrome.tabs.query(
      windowId === undefined ? { active: true, lastFocusedWindow: true } : { active: true, windowId },
    );
    return tab?.id === undefined ? null : { tabId: tab.id, windowId: tab.windowId };
  } catch {
    return null;
  }
}

async function openCaptureTab(
  id: string,
  extra: Record<string, unknown>,
  origin: Origin | null,
  query = '',
): Promise<void> {
  const keys = [`captureImage:${id}`, `captureOtk:${id}`, `captureOrigin:${id}`];
  await chrome.storage.session.set({ ...extra, ...(origin ? { [keys[2]]: origin } : {}) });
  try {
    const tab = await chrome.tabs.create({ url: `${chrome.runtime.getURL('capture.html')}?id=${id}${query}` });
    // 작업 창·다른 앱 뒤에 가려지지 않게 탭의 창을 앞으로 올린다. 실패해도 흐름은 계속한다.
    if (tab.windowId !== undefined) {
      await chrome.windows.update(tab.windowId, { focused: true }).catch(() => undefined);
    }
  } catch (error) {
    // 캡처 화면을 못 열면 스크린샷·1회용 키를 남기지 않는다.
    await chrome.storage.session.remove(keys);
    throw error;
  }
}

export async function captureTab(windowId?: number, otk?: string): Promise<void> {
  if (await passwordRequired()) throw new Error('Password required by policy');
  const origin = await findOrigin(windowId);
  const image =
    windowId === undefined
      ? await chrome.tabs.captureVisibleTab({ format: 'png' })
      : await chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
  // 요청마다 id 를 두어 동시에 연 두 캡처 화면이 서로의 그림·1회용 키를 가져가지 않게 한다.
  const id = crypto.randomUUID();
  await openCaptureTab(
    id,
    { [`captureImage:${id}`]: image, ...(otk ? { [`captureOtk:${id}`]: otk } : {}) },
    origin,
  );
}

export async function captureDisplay(sender?: chrome.tabs.Tab): Promise<void> {
  if (await passwordRequired()) throw new Error('Password required by policy');
  const origin = await findOrigin(undefined, sender);
  await openCaptureTab(crypto.randomUUID(), {}, origin, '&mode=display');
}

export function register(): void {
  chrome.commands.onCommand.addListener((command) => {
    if (command === 'scan-qr') {
      void captureTab().catch((error) => console.warn('scan-qr', error));
    }
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (typeof message !== 'object' || message === null) return false;
    if (message.type === 'capture-display') {
      captureDisplay(sender.tab).then(
        () => sendResponse({ ok: true }),
        (error) => {
          console.warn('capture-display', error);
          sendResponse({ ok: false });
        },
      );
      return true;
    }
    if (message.type !== 'capture-tab') return false;
    const windowId = typeof message.windowId === 'number' ? message.windowId : undefined;
    const otk = typeof message.otk === 'string' ? message.otk : undefined;
    captureTab(windowId, otk).then(
      () => sendResponse({ ok: true }),
      (error) => {
        console.warn('capture-tab', error);
        sendResponse({ ok: false });
      },
    );
    return true;
  });
}
