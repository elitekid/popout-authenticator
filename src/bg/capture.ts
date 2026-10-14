// 지금 탭을 캡처해 캡처 화면(capture.html)에서 QR 을 찾게 한다.

async function captureTab(windowId?: number, otk?: string): Promise<void> {
  const image =
    windowId === undefined
      ? await chrome.tabs.captureVisibleTab({ format: 'png' })
      : await chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
  // 이전 캡처의 1회용 키가 남아 새 그림에 섞이지 않게 한다.
  await chrome.storage.session.remove('captureOtk');
  await chrome.storage.session.set({ captureImage: image, ...(otk ? { captureOtk: otk } : {}) });
  try {
    await chrome.tabs.create({ url: chrome.runtime.getURL('capture.html') });
  } catch (error) {
    // 캡처 화면을 못 열면 스크린샷·1회용 키를 남기지 않는다.
    await chrome.storage.session.remove(['captureImage', 'captureOtk']);
    throw error;
  }
}

export function register(): void {
  chrome.commands.onCommand.addListener((command) => {
    if (command === 'scan-qr') {
      void captureTab().catch((error) => console.warn('scan-qr', error));
    }
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (typeof message !== 'object' || message === null || message.type !== 'capture-tab') {
      return false;
    }
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
