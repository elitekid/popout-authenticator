// 브라우저별 묶음에서 지원하지 않는 기능을 성공처럼 표시하지 않는다.
export type BrowserTarget = 'chrome' | 'edge' | 'firefox' | 'safari';
export const BROWSER_TARGET: BrowserTarget = import.meta.env.VITE_BROWSER_TARGET ?? 'chrome';

// Firefox 158도 확장 자체를 WebAuthn RP로 허용하지 않는다(Mozilla bug 1693562).
// 웹 도메인으로 우회하면 다른 확장·사이트와 RP가 겹치므로 지원되는 브라우저에서만 쓴다.
export function supportsPasskeys(): boolean {
  return BROWSER_TARGET !== 'firefox';
}

type SidebarAction = { open(): Promise<void> };

export function getSidebarAction(): SidebarAction | undefined {
  return (chrome as typeof chrome & { sidebarAction?: SidebarAction }).sidebarAction;
}

export function supportsSidePanel(): boolean {
  return typeof chrome.sidePanel?.setPanelBehavior === 'function' || !!getSidebarAction();
}

// Safari storage.sync 는 로컬 저장에 그치므로 기기 간 동기화로 제공하지 않는다.
export function supportsBrowserSync(): boolean {
  return BROWSER_TARGET !== 'safari';
}

// Safari 는 clipboardRead 권한이 없어 백그라운드에서 내용을 확인한 뒤 지울 수 없다.
export function supportsClipboardClear(): boolean {
  return BROWSER_TARGET !== 'safari';
}

// Firefox 기본 제공 데이터 동의에서 동기화가 보내는 자료 종류. vite.config.ts 의 optional 과 같아야 한다.
export const SYNC_DATA_COLLECTION = ['authenticationInfo', 'personallyIdentifyingInfo', 'browsingActivity'];
type DataCollectionPermissions = chrome.permissions.Permissions & { data_collection?: string[] };

// 동기화로 보내기 전에 확인한다. Firefox 밖이거나 동의 화면이 없는 Firefox(data_collection 키 없음)는 막지 않는다.
export async function syncConsentGranted(): Promise<boolean> {
  if (BROWSER_TARGET !== 'firefox') return true;
  const granted = ((await chrome.permissions.getAll()) as DataCollectionPermissions).data_collection;
  if (!granted) return true;
  return SYNC_DATA_COLLECTION.every((type) => granted.includes(type));
}

// 사용자 클릭 처리기 안에서 앞에 기다림 없이 불러야 Firefox 가 동의 창을 띄운다.
export function requestSyncConsent(): Promise<boolean> {
  return chrome.permissions.request({ data_collection: SYNC_DATA_COLLECTION } as DataCollectionPermissions);
}
