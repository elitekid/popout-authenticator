// 업데이트로 버전이 바뀌면 팝업이 새 기능 소개를 보이도록 표시만 남긴다.
export function register(): void {
  chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason !== 'update') return;
    const version = chrome.runtime.getManifest().version;
    chrome.storage.local
      .get('lastSeenWhatsNewVersion')
      .then((got) => {
        if (got.lastSeenWhatsNewVersion === version) return undefined;
        // 새 안내는 본 창 수를 처음부터 센다.
        return chrome.storage.local
          .remove('whatsNewViews')
          .then(() => chrome.storage.local.set({ pendingWhatsNew: version }));
      })
      .catch((error) => console.warn('whats-new: mark failed', error));
  });
}
