// 업데이트로 버전이 바뀌면 팝업이 새 기능 소개를 보이도록 표시만 남긴다.
export function register(): void {
  chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason !== 'update') return;
    const version = chrome.runtime.getManifest().version;
    chrome.storage.local
      .get('lastSeenWhatsNewVersion')
      .then((got) => {
        if (got.lastSeenWhatsNewVersion === version) return undefined;
        return chrome.storage.local.set({ pendingWhatsNew: version });
      })
      .catch((error) => console.warn('whats-new: mark failed', error));
  });
}
