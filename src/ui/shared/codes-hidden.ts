// 화면 공유용 코드 가리기: storage.session 'codesHidden'. 서비스 워커의 명령도 같은 값을 쓴다.
const KEY = 'codesHidden';
const AT_KEY = 'codesHiddenAt';
const LOCK_NAME = 'popout-codes-hidden';
const DEDUPE_MS = 400;

export async function readCodesHidden(): Promise<boolean> {
  const got = await chrome.storage.session.get(KEY);
  return got[KEY] === true;
}

async function flip(): Promise<void> {
  const got = await chrome.storage.session.get([KEY, AT_KEY]);
  const now = Date.now();
  const at = typeof got[AT_KEY] === 'number' ? (got[AT_KEY] as number) : 0;
  // 팝업 단축키와 명령이 같은 키를 두 번 처리해도 한 번만 뒤집는다.
  if (now - at >= 0 && now - at < DEDUPE_MS) return;
  await chrome.storage.session.set({ [KEY]: got[KEY] !== true, [AT_KEY]: now });
}

export function toggleCodesHidden(): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.locks) {
    return navigator.locks.request(LOCK_NAME, flip).then(() => undefined);
  }
  return flip();
}

export function onCodesHiddenChanged(cb: (hidden: boolean) => void): () => void {
  const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area !== 'session' || !(KEY in changes)) return;
    cb(changes[KEY].newValue === true);
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
