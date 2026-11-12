// '칸 옆 넣기 단추'의 서비스 워커 쪽: 단추를 누르면 기존 넣기 경로로 코드를 넣는다.
import { hostOf, matchesSite } from '../core/suggest';
import { applyAccountEditPatch, applyPendingFieldButtons, fieldPatterns, pruneRevokedHosts, readAutoFieldButtons, readFieldButtons, refreshAutoFieldAccounts, syncFieldScripts, type AccountEditPatch } from '../store/field-buttons';
import { LockedError, NoVaultError } from '../store/errors';
import { loadAccounts, updateAccounts } from '../store/vault';
import { runFill } from './fill';

const LOOPBACK = new Set(['localhost', '127.0.0.1']);

// 팝업이 닫혀 저장하지 못한 계정 수정을 일반 금고 쓰기 경로로 마친다. 계정이 없으면 false.
// 잠겨 있으면 LockedError 가 그대로 올라가 항목이 남는다.
async function applyAccountPatch(accountId: string, patch: AccountEditPatch): Promise<boolean> {
  let found = false;
  const now = Date.now();
  await updateAccounts((list) => list.map((a) => {
    if (a.id !== accountId || a.deletedAt !== undefined) return a;
    found = true;
    return applyAccountEditPatch(a, patch, now);
  }));
  return found;
}

function applyPending(): void {
  void applyPendingFieldButtons(Date.now(), applyAccountPatch).catch((error) => console.warn('field-buttons pending', error));
}

function allowedUrl(url: string): string | undefined {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }
  const host = hostOf(url);
  if (host === undefined) return undefined;
  if (parsed.protocol !== 'https:' && !LOOPBACK.has(host)) return undefined;
  return host;
}

// 보낸 프레임과 그 탭의 최상위 주소가 모두 켠 항목에 맞는 계정 id. 하나라도 어긋나면 null.
async function matchingIds(sender: chrome.runtime.MessageSender): Promise<{ ids: string[]; automatic: boolean } | null> {
  if (sender.id !== chrome.runtime.id || sender.tab?.id === undefined) return null;
  const topUrl = sender.tab.url;
  if (!sender.url || !topUrl) return null;
  const frameHost = allowedUrl(sender.url);
  const topHost = allowedUrl(topUrl);
  if (frameHost === undefined || topHost === undefined) return null;
  const [buttons, auto] = await Promise.all([readFieldButtons(), readAutoFieldButtons()]);
  const ids = new Set<string>();
  let automatic = false;
  const permissionCache = new Map<string, Promise<boolean>>();
  const granted = (pattern: string) => {
    let pending = permissionCache.get(pattern);
    if (!pending) {
      pending = chrome.permissions.contains({ origins: [pattern] });
      permissionCache.set(pattern, pending);
    }
    return pending;
  };
  for (const [id, hosts] of Object.entries(buttons)) {
    if (!matchesSite(hosts, frameHost) || !matchesSite(hosts, topHost)) continue;
    const allowed: string[] = [];
    for (const host of hosts) {
      if (!matchesSite([host], frameHost) && !matchesSite([host], topHost)) continue;
      const patterns = fieldPatterns(host);
      if (patterns && (await Promise.all(patterns.map(granted))).every(Boolean)) allowed.push(host);
    }
    if (matchesSite(allowed, frameHost) && matchesSite(allowed, topHost)) ids.add(id);
  }
  if (auto.enabled && sender.url.startsWith('https:') && topUrl.startsWith('https:')) {
    for (const [id, hosts] of Object.entries(auto.accounts)) {
      // 자동 인식은 카탈로그의 정확한 HTTPS 호스트만 받는다.
      if (hosts.includes(frameHost) && hosts.includes(topHost) &&
          await granted(`https://${frameHost}/*`) && await granted(`https://${topHost}/*`)) {
        ids.add(id);
        automatic = true;
      }
    }
  }
  return ids.size > 0 ? { ids: [...ids], automatic } : null;
}

// 겹친 변경은 합쳐 최신 금고를 직렬로 읽는다. 이전 복호화가 끝나는 사이 금고가
// 바뀌었으면 그 결과를 쓰지 않고 다시 읽어 오래된 메타로 되돌리지 않는다.
let refreshPending = false;
let refreshRequested = false;
function queueAutoRefresh(): void {
  refreshRequested = true;
  if (refreshPending) return;
  refreshPending = true;
  void (async () => {
    while (refreshRequested) {
      refreshRequested = false;
      if (!(await readAutoFieldButtons()).enabled) continue;
      try {
        const accounts = await loadAccounts();
        if (refreshRequested) continue;
        await refreshAutoFieldAccounts(accounts);
      } catch (error) {
        if (error instanceof NoVaultError && !refreshRequested) await refreshAutoFieldAccounts([]);
        else if (!(error instanceof LockedError)) console.warn('field-buttons accounts', error);
        // 잠긴 동안에는 마지막으로 확인한 호스트만 보존한다. 넣기는 runFill이 잠금을 확인한다.
      }
    }
  })().catch((error) => console.warn('field-buttons refresh', error)).finally(() => {
    refreshPending = false;
    if (refreshRequested) queueAutoRefresh();
  });
}

async function handleFieldFill(sender: chrome.runtime.MessageSender) {
  const tab = sender.tab;
  if (tab?.id === undefined || !sender.url || !sender.documentId) return { ok: false };
  const match = await matchingIds(sender);
  if (!match) return { ok: false };
  const { ids, automatic } = match;

  const outcome = await runFill({
    tabId: tab.id,
    frameId: sender.frameId,
    documentId: sender.documentId,
    pageUrl: sender.url,
    windowId: tab.windowId,
    accountId: ids.length === 1 ? ids[0] : undefined,
    allowedIds: ids,
    requireChoice: automatic && ids.length > 1,
  });
  return { ok: true, outcome };
}

async function handleFieldCheck(sender: chrome.runtime.MessageSender) {
  return { enabled: (await matchingIds(sender)) !== null };
}

export function register(): void {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (typeof message !== 'object' || message === null) return false;
    if (message.type === 'field-check') {
      void handleFieldCheck(sender).then(sendResponse, (error) => {
        console.warn('field-check', error);
        sendResponse({ enabled: false });
      });
      return true;
    }
    if (message.type !== 'field-fill') return false;
    void handleFieldFill(sender).then(sendResponse, (error) => {
      console.warn('field-fill', error);
      sendResponse({ ok: false });
    });
    return true;
  });

  chrome.permissions.onRemoved.addListener(() => {
    void pruneRevokedHosts().catch((error) => console.warn('field-buttons onRemoved', error));
  });

  chrome.permissions.onAdded.addListener(() => {
    // 팝업이 권한 창에 닫혔어도 대기 중이던 단추 설정을 마친다.
    applyPending();
    void syncFieldScripts();
    queueAutoRefresh();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    const enabledNow = area === 'local' && changes.autoFieldButtons?.newValue?.enabled === true &&
      changes.autoFieldButtons.oldValue?.enabled !== true;
    if ((area === 'local' && 'vault' in changes) ||
        (area === 'session' && changes.vaultKey?.newValue !== undefined) || enabledNow) queueAutoRefresh();
  });

  chrome.runtime.onInstalled.addListener(() => {
    void syncFieldScripts();
  });

  queueAutoRefresh();
  // 허용 이벤트를 놓친 경우(서비스 워커가 내려가 있던 사이)도 시작 때 한 번 처리한다.
  applyPending();
}
