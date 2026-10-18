// 사이트 접근 권한 창이 툴바 팝업을 닫아도 승인 뒤 넣기가 이어지도록 맡겨 두는 대기 항목.
// 서비스 워커가 내려가도 남게 세션 저장소에 두고, 꺼내 가는 쪽(팝업 또는 permissions.onAdded)이 한 번만 실행한다.
const KEY = 'pendingFill';
const TTL = 120_000;

export type PendingFill = {
  accountId: string;
  submit: boolean;
  allowSiteMismatch?: string;
  target: { tabId: number; pageUrl: string };
  origin: string;
  expiresAt: number;
};

const locked = <T>(work: () => Promise<T>): Promise<T> => navigator.locks.request('popout-pending-fill', work) as Promise<T>;

async function read(): Promise<PendingFill | undefined> {
  const value = (await chrome.storage.session.get(KEY))[KEY] as PendingFill | undefined;
  return value && typeof value === 'object' && value.expiresAt > Date.now() ? value : undefined;
}

export function savePendingFill(entry: Omit<PendingFill, 'expiresAt'>): Promise<void> {
  return locked(() => chrome.storage.session.set({ [KEY]: { ...entry, expiresAt: Date.now() + TTL } }));
}

export function clearPendingFill(): Promise<void> {
  return locked(() => chrome.storage.session.remove(KEY));
}

// 조건에 맞으면 항목을 지우고 돌려준다. 먼저 꺼낸 쪽만 받는다.
export function takePendingFill(match: (entry: PendingFill) => boolean): Promise<PendingFill | undefined> {
  return locked(async () => {
    const entry = await read();
    if (!entry) { await chrome.storage.session.remove(KEY); return undefined; }
    if (!match(entry)) return undefined;
    await chrome.storage.session.remove(KEY);
    return entry;
  });
}
