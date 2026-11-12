// 탭의 입력칸에 코드를 넣는다(우클릭 메뉴·단축키·팝업 '넣기').
import { generateCode, secondsRemaining } from '../core/otp';
import { fillCandidate, hostOf, matchesSite, mostUsedOnSite } from '../core/suggest';
import type { Account } from '../core/types';
import { encryptVault } from '../core/crypto/vault';
import { quickFillInPage, type QuickFillOutcome } from '../inject/fill-page';
import { checkClock, readClockCorrection } from '../store/clock';
import { isLocked } from '../store/lock';
import { readCodeProtection } from '../store/code-access';
import { readAutoFieldButtons, readFieldButtons } from '../store/field-buttons';
import { lastNormalWindow } from '../store/browser-window';
import { getSessionKey, withSessionLock } from '../store/session';
import { loadSettings } from '../store/settings';
import { readSiteUsage, recordSiteUse } from '../store/site-usage';
import { commitVaultFile, loadAccounts, updateAccounts, withVaultWriteLock } from '../store/vault';
import { applyOpenMode } from './open-mode';
import { scheduleClipboardClear } from './clipboard';
import { clearPendingFill, savePendingFill, takePendingFill } from './pending-fill';
import { pinFill, validateFillTarget, requestFillApproval, setApprovedFillExecutor } from './code-access';

export type FillRequest = {
  tabId: number;
  frameId?: number;
  pageUrl?: string;
  windowId?: number;
  accountId?: string;
  // 주어지면 그 문서에만 넣는다(다른 문서·프레임으로 번지지 않게).
  documentId?: string;
  // 주어지면 계정 후보를 이 id 들로 먼저 거른다.
  allowedIds?: string[];
  // 자동 인식에서 계정이 여럿이면 사용 이력으로 추측하지 않고 사용자에게 선택을 맡긴다.
  requireChoice?: boolean;
  // 복사 후 자동 넣기는 사이트 제출까지 이어가지 않는다.
  submit?: boolean;
  // 팝업에서 '이번만 넣기'로 확인한 호스트. 그 호스트일 때만 지정 사이트가 아니어도 넣는다(자동 제출은 하지 않는다).
  allowSiteMismatch?: string;
};

const NEAR_END_SECONDS = 2;
type RetryTarget = { tabId: number; pageUrl: string };

type FillErrorReason = 'noTab' | 'restricted' | 'permission' | 'failed' | 'locked' | 'accountMissing' | 'changed' | 'insecure' | 'siteMismatch';
class FillError extends Error {
  constructor(readonly reason: FillErrorReason, readonly host?: string) { super(`popup.fillError.${reason}`); }
}

const LOOPBACK = new Set(['localhost', '127.0.0.1']);

// https 이거나 이 기기(localhost) 주소일 때만 코드를 넣는다.
function secureUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || (u.protocol === 'http:' && LOOPBACK.has(u.hostname));
  } catch {
    return false;
  }
}

// 고정한 문서의 호스트가 이 계정에 지정한 사이트(또는 켠 칸 옆 단추 사이트)인지.
async function siteMatches(req: FillRequest, account: Account, documentUrl: string): Promise<boolean> {
  // 칸 옆 단추는 보낸 프레임과 최상위 주소를 이미 확인했다.
  if (req.allowedIds !== undefined) return true;
  const host = hostOf(documentUrl);
  if (host === undefined) return false;
  if (matchesSite(account.matchHosts, host)) return true;
  const [buttons, auto] = await Promise.all([readFieldButtons(), readAutoFieldButtons()]);
  if (matchesSite(buttons[account.id] ?? [], host)) return true;
  return auto.enabled && (auto.accounts[account.id] ?? []).includes(host);
}

// activeTab의 일시 권한은 permissions.contains로 판별할 수 없다.
// 실제 실행이 거절된 경우에만 권한 안내를 반환한다.
function fillErrorKey(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof FillError) return message;
  if (message === 'codeProtection.targetChanged' || message === 'codeProtection.expired') return 'popup.fillError.changed';
  if (message.startsWith('codeProtection.')) return 'popup.fillError.failed';
  if (/cannot access (?:a |contents of (?:the )?)?(?:chrome|edge|about|chrome-extension|moz-extension):|extensions gallery cannot be scripted|cannot access a restricted url/i.test(message)) {
    return 'popup.fillError.restricted';
  }
  if (/cannot access contents of (?:the )?url|missing host permission|host permission|extension manifest must request permission|permission denied to access/i.test(message)) {
    return 'popup.fillError.permission';
  }
  return 'popup.fillError.failed';
}

function permissionFor(tab: chrome.tabs.Tab | undefined, accountId: string | undefined) {
  if (tab?.id === undefined || !tab.url || !accountId) return undefined;
  try {
    const url = new URL(tab.url);
    const loopback = url.hostname === '127.0.0.1' || url.hostname === 'localhost';
    if (url.protocol !== 'https:' && !(loopback && url.protocol === 'http:')) return undefined;
    return { origin: `${loopback ? '*' : 'https'}://${url.hostname}/*`, tabId: tab.id, pageUrl: tab.url, accountId };
  } catch { return undefined; }
}

async function pageTexts(code: string | null) {
  return {
    copiedText: chrome.i18n.getMessage('fillCopied'),
    manualText: chrome.i18n.getMessage('fillManual', code ?? ''),
    noticeText: chrome.i18n.getMessage('fillPickAccount'),
  };
}

async function inject(
  tabId: number,
  frameId: number | undefined,
  code: string | null,
  documentId?: string,
  gate?: { expiresAt?: number; documentUrl: string; pinId?: string },
  submit = true,
  beforeInject?: () => Promise<void>,
): Promise<QuickFillOutcome | undefined> {
  const texts = await pageTexts(code);
  const autoSubmit = code !== null && submit && (await loadSettings()).autoSubmit;
  const run = async (target: chrome.scripting.InjectionTarget, requireFocus: boolean) => {
    // 문구·설정을 읽는 동안 취소되었으면 실제 페이지 입력 직전에 멈춘다.
    if (beforeInject) await beforeInject();
    const results = await chrome.scripting.executeScript({
      target,
      func: quickFillInPage,
      args: [{ code, requireFocus, ...texts, ...gate, autoSubmit }],
    });
    const outcome = results.map((r) => r.result as QuickFillOutcome | undefined).find((r) => r !== 'skipped' && r !== undefined);
    // 넣지 못해 클립보드에 복사된 경우에도 팝업 복사와 같이 지우기를 예약한다.
    if (outcome === 'copied' && code !== null && (await loadSettings()).clipboardClearAfterCopy) {
      await scheduleClipboardClear(code).catch((error) => console.warn('clipboard-copied', error));
    }
    return outcome;
  };
  if (documentId !== undefined) {
    // 문서를 고정했으면 포커스 조건만 따르고 다른 문서로 폴백하지 않는다.
    return run({ tabId, documentIds: [documentId] }, false);
  }
  const target: chrome.scripting.InjectionTarget =
    frameId !== undefined ? { tabId, frameIds: [frameId] } : { tabId, allFrames: true };
  const first = await run(target, frameId === undefined);
  if (first !== undefined) return first;
  // 모두 건너뛰었으면(포커스가 없던 경우) 포커스 조건 없이 한 번 더.
  return run({ tabId }, false);
}

// 외부 사이트에서 잠금 해제·계정 선택이 필요해도 같은 브라우저 창의 기본 팝업을 쓴다.
async function handOver(req: FillRequest, requester?: chrome.runtime.MessageSender): Promise<void> {
  // 확장 UI에서 시작한 작업은 이미 열린 그 화면이 잠금·계정 목록을 보여 준다.
  if (requester) return;
  let temporaryPopup = false;
  try {
    const tab = await chrome.tabs.get(req.tabId);
    if (!(await chrome.action.getPopup({}))) {
      temporaryPopup = true;
      await chrome.action.setPopup({ popup: 'popup.html' });
    }
    await chrome.action.openPopup({ windowId: tab.windowId });
    return;
  } catch {
    // 기본 팝업을 열 수 없으면 원래 페이지에 안내한다. 다른 창은 열지 않는다.
  } finally {
    if (temporaryPopup) await applyOpenMode().catch(() => undefined);
  }
  await inject(req.tabId, req.frameId, null, req.documentId);
}

async function currentCode(account: Account): Promise<{ code: string; account: Account }> {
  if (account.type === 'hotp') {
    // 넣기 전에 counter+1 을 저장하고 새 카운터의 코드를 쓴다.
    const next = await updateAccounts((list) =>
      list.map((a) =>
        a.id === account.id ? { ...a, counter: (a.counter ?? 0) + 1, updatedAt: Date.now() } : a,
      ),
    );
    const saved = next.find((a) => a.id === account.id) ?? account;
    return { code: await generateCode(saved, Date.now()), account: saved };
  }
  const period = account.type === 'totp' ? account.period : 30;
  // 기기 시계가 어긋나 있으면 보정한 시각으로 계산한다. 낡은 측정이면 먼저 다시 잰다(3초 제한).
  await checkClock().catch(() => null);
  const left = secondsRemaining(Date.now() + (await readClockCorrection()), period);
  if (left <= NEAR_END_SECONDS) {
    await new Promise((resolve) => setTimeout(resolve, left * 1000 + 250));
  }
  // 기다리는 사이 시계 확인을 껐을 수 있어 만들기 직전에 다시 읽는다.
  return { code: await generateCode(account, Date.now() + (await readClockCorrection())), account };
}

export async function runFill(req: FillRequest, requester?: chrome.runtime.MessageSender, retryTarget?: RetryTarget & { documentUrl: string }): Promise<QuickFillOutcome | 'handed-over'> {
  if (await isLocked()) {
    if (requester) throw new FillError('locked');
    await handOver(req, requester);
    return 'handed-over';
  }
  const accounts = await loadAccounts();
  const allowed = req.allowedIds;
  const live = accounts.filter(
    (a) => a.deletedAt === undefined && (allowed === undefined || allowed.includes(a.id)),
  );
  let account: Account | undefined;
  if (req.accountId !== undefined) {
    account = live.find((a) => a.id === req.accountId);
  } else if (!req.requireChoice) {
    const ctx = { url: req.pageUrl, usage: await readSiteUsage() };
    // 칸 옆 단추 후보는 사이트를 이미 확인했으니 그 안에서 넣은 기록으로도 고른다.
    const id = fillCandidate(live, ctx) ?? (req.allowedIds !== undefined ? mostUsedOnSite(live, ctx) : null);
    account = live.find((a) => a.id === id);
  }
  if (!account) {
    if (requester) throw new FillError('accountMissing');
    await handOver(req, requester);
    return 'handed-over';
  }
  // 코드 갱신·기기 인증을 기다리기 전에 문서를 고정한다. 같은 탭의 새 페이지로
  // 코드가 넘어가지 않고, 분리 창을 눌러 포커스를 잃은 iframe 입력칸도 유지한다.
  const target = await pinFill(req);
  // 고정한 문서(포커스된 iframe 포함)와 최상위 주소가 모두 보안 연결이어야 한다.
  if (!secureUrl(target.documentUrl) || !secureUrl(target.topUrl)) {
    // about:blank·about:srcdoc 틀은 주소로 사이트를 확인할 수 없어 넣을 수 없는 곳으로 알린다.
    if (requester) throw new FillError(target.documentUrl.startsWith('about:') ? 'restricted' : 'insecure');
    await handOver(req, requester);
    return 'handed-over';
  }
  // 실제로 넣을 문서의 호스트가 계정의 지정 사이트가 아니면 비슷한 주소·광고 iframe 일 수 있다.
  const matched = await siteMatches(req, account, target.documentUrl);
  if (!matched) {
    // 권한 승인 뒤 백그라운드가 잇는 넣기는 requester 가 없지만, 사용자가 확인한 호스트면 계속한다.
    if (!requester && req.allowSiteMismatch === undefined) {
      await handOver(req, requester);
      return 'handed-over';
    }
    const host = hostOf(target.documentUrl);
    if (host === undefined || req.allowSiteMismatch !== host) throw new FillError('siteMismatch', host);
  }
  // 지정 사이트가 아닌 곳에 넣을 때는 자동 제출하지 않는다.
  const submit = req.submit !== false && matched;
  if (await readCodeProtection()) {
    await requestFillApproval({ ...target, pageUrl: target.documentUrl, submit }, account.id, requester);
    return 'handed-over';
  }
  const { code } = await currentCode(account);
  // 다음 코드를 기다리는 사이 잠겼으면 넣지 않는다.
  if (await isLocked()) {
    if (requester) throw new FillError('locked');
    await handOver(req, requester);
    return 'handed-over';
  }
  // 코드 교체를 기다리는 동안 다른 창에서 기기 인증을 켰으면 지금 작업도 승인을 받는다.
  if (await readCodeProtection()) {
    await requestFillApproval({ ...target, pageUrl: target.documentUrl, submit }, account.id, requester);
    return 'handed-over';
  }
  const beforeInject = async () => {
    if (retryTarget) {
      const current = await activeTab();
      if (current?.id !== retryTarget.tabId || current.url !== retryTarget.pageUrl ||
          (current.pendingUrl !== undefined && current.pendingUrl !== retryTarget.pageUrl)) {
        throw new FillError('changed');
      }
    }
    await validateFillTarget(target).catch(() => { throw new FillError('changed'); });
  };
  // 재시도는 허용 뒤 고정한 문서에만 넣는다. 코드 교체를 기다린 뒤에도 활성 탭을
  // 확인하고, 해당 프레임 안에서는 URL을 다시 검사해 탐색 경합을 막는다.
  const outcome = (await inject(req.tabId, req.frameId, code, target.documentId,
    { documentUrl: target.documentUrl, pinId: target.pinId }, submit, beforeInject)) ?? 'shown';
  if (outcome === 'expired') throw new FillError('changed');
  if (outcome === 'filled') {
    const host = hostOf(req.pageUrl);
    if (host !== undefined) await recordSiteUse(host, account.id, 'site').catch(() => undefined);
  }
  return outcome;
}

// 활성 탭: 마지막으로 포커스된 일반 창의 활성 탭(분리 창·사이드 패널에서도 맞게).
async function activeTab(): Promise<chrome.tabs.Tab | undefined> {
  const win = await lastNormalWindow();
  if (win?.id === undefined) return undefined;
  const [tab] = await chrome.tabs.query({ active: true, windowId: win.id });
  return tab;
}

// 단축키용: 활성 탭에 넣는다.
export async function fillActiveTab(): Promise<void> {
  const tab = await activeTab();
  if (tab?.id === undefined) return;
  await runFill({ tabId: tab.id, pageUrl: tab.url, windowId: tab.windowId });
}

export function register(): void {
  // 이 콜백은 인증 모듈 내부에서 소비한 요청으로만 호출한다. runtime 입력으로 승인을 받지 않는다.
  setApprovedFillExecutor(async (req, account, file, validate, expiresAt) => {
    if (account.type !== 'hotp') {
      const period = account.type === 'totp' ? account.period : 30;
      await checkClock().catch(() => null);
      const left = secondsRemaining(Date.now() + await readClockCorrection(), period);
      if (left <= NEAR_END_SECONDS) await new Promise((resolve) => setTimeout(resolve, left * 1000 + 250));
    }
    // 마지막 검증부터 입력까지 금고 변경과 명시적 잠금을 기다리게 해 중간 결과를 사용하지 않는다.
    return withVaultWriteLock(() => withSessionLock(async () => {
      await validate();
      let selected = account;
      let committed: typeof file | undefined;
      if (account.type === 'hotp') {
        const key = await getSessionKey();
        if (!key) throw new Error('codeProtection.expired');
        const accounts = await loadAccounts();
        selected = { ...account, counter: (account.counter ?? 0) + 1, updatedAt: Date.now() };
        const next = accounts.map((a) => a.id === selected.id ? selected : a);
        const saved = await encryptVault(next, key, file.lock, file.wrappedKeys);
        if (file.lockChangedAt !== undefined) saved.lockChangedAt = file.lockChangedAt;
        await validate();
        await commitVaultFile(saved);
        committed = saved;
      }
      const correction = await readClockCorrection();
      await validate(committed);
      const now = Date.now();
      const periodMs = (selected.type === 'totp' ? selected.period : 30) * 1000;
      const codeExpiresAt = selected.type === 'hotp' ? expiresAt
        : (Math.floor((now + correction) / periodMs) + 1) * periodMs - correction;
      const code = await generateCode(selected, now + correction);
      await validate(committed);
      const outcome = (await inject(req.tabId, req.frameId, code, req.documentId,
        { expiresAt: Math.min(expiresAt, codeExpiresAt), documentUrl: req.documentUrl, pinId: req.pinId }, req.submit, () => validate(committed))) ?? 'shown';
      if (outcome === 'expired') throw new Error('codeProtection.expired');
      if (outcome === 'filled') {
        const host = hostOf(req.pageUrl);
        if (host !== undefined) await recordSiteUse(host, account.id, 'site').catch(() => undefined);
      }
      return outcome;
    }));
  });
  // 시험용으로 서비스 워커에서 바로 부른다.
  (globalThis as { __popoutRunFill?: typeof runFill }).__popoutRunFill = runFill;

  // 권한 창 때문에 팝업이 닫혀도, 승인된 origin 이면 맡겨 둔 넣기를 한 번 이어 한다.
  chrome.permissions.onAdded.addListener((added) => {
    const origins = added.origins ?? [];
    void takePendingFill((entry) => origins.includes(entry.origin)).then((entry) => {
      if (!entry) return;
      return fillFromMessage({ accountId: entry.accountId, submit: entry.submit,
        allowSiteMismatch: entry.allowSiteMismatch, target: entry.target }, undefined, {});
    }).catch((error) => console.warn('pending-fill', error));
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (typeof message === 'object' && message !== null && message.type === 'fill-pending') {
      if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL(''))) {
        sendResponse({ ok: false });
        return false;
      }
      const t = message.target;
      const valid = typeof message.accountId === 'string' && typeof message.origin === 'string' && t && typeof t === 'object' &&
        typeof t.tabId === 'number' && typeof t.pageUrl === 'string';
      void (message.clear === true || !valid ? clearPendingFill() : savePendingFill({
        accountId: message.accountId, submit: message.submit !== false, origin: message.origin,
        target: { tabId: t.tabId, pageUrl: t.pageUrl },
        ...(typeof message.allowSiteMismatch === 'string' ? { allowSiteMismatch: message.allowSiteMismatch } : {}),
      })).then(() => sendResponse({ ok: true }), () => sendResponse({ ok: false }));
      return true;
    }
    if (typeof message !== 'object' || message === null || message.type !== 'fill-code') {
      return false;
    }
    if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL(''))) {
      sendResponse({ ok: false });
      return false;
    }
    const accountId = typeof message.accountId === 'string' ? message.accountId : undefined;
    const seen: { tab?: chrome.tabs.Tab } = {};
    void (async () => {
      // 권한 허용 뒤 팝업이 살아 있어 이어 가는 경우: 대기 항목을 먼저 꺼낸 쪽만 넣는다.
      if (message.target !== undefined && accountId !== undefined) {
        const taken = await takePendingFill((entry) => entry.accountId === accountId);
        if (!taken) return { ok: true, outcome: 'handed-over' };
      }
      return fillFromMessage(message, sender, seen);
    })().then(sendResponse, (error) => {
      console.warn('fill-code', error);
      const tab = seen.tab;
      const key = fillErrorKey(error);
      const permission = key === 'popup.fillError.permission' ? permissionFor(tab, accountId) : undefined;
      const mismatch = error instanceof FillError && error.reason === 'siteMismatch' ? { host: error.host ?? '' } : undefined;
      sendResponse({ ok: false, error: key, ...(permission ? { permission } : {}), ...(mismatch ? { mismatch } : {}) });
    });
    return true;
  });
}

type FillMessage = { accountId?: unknown; submit?: unknown; allowSiteMismatch?: unknown; target?: unknown };

async function fillFromMessage(message: FillMessage, sender: chrome.runtime.MessageSender | undefined, seen: { tab?: chrome.tabs.Tab }) {
  const accountId = typeof message.accountId === 'string' ? message.accountId : undefined;
  const tab = seen.tab = await activeTab();
  if (tab?.id === undefined) throw new FillError('noTab');
  let retryTarget: RetryTarget | undefined;
  // 권한 허용 후 재시도는 처음 누른 탭·주소가 그대로일 때만 진행한다.
  // 다른 탭으로 이동한 뒤 승인한 요청을 새 페이지에 보내지 않는다.
  if (message.target !== undefined) {
    const target = message.target as { tabId?: unknown; pageUrl?: unknown } | null;
    if (!target || typeof target !== 'object' || target.tabId !== tab.id ||
        typeof target.pageUrl !== 'string' || target.pageUrl !== tab.url ||
        (tab.pendingUrl !== undefined && tab.pendingUrl !== target.pageUrl)) {
      throw new FillError('changed');
    }
    retryTarget = { tabId: target.tabId, pageUrl: target.pageUrl };
  }
  if (tab.url && /^(?:chrome|edge|about|chrome-extension|moz-extension|safari-web-extension|devtools):/i.test(tab.url)) {
    throw new FillError('restricted');
  }
  const req: FillRequest = {
    tabId: tab.id,
    pageUrl: tab.url,
    windowId: tab.windowId,
    accountId,
    submit: message.submit !== false,
    // 확장 화면(또는 확장 화면이 맡긴 대기 항목)에서 온 값만 여기 온다.
    allowSiteMismatch: typeof message.allowSiteMismatch === 'string' ? message.allowSiteMismatch : undefined,
  };
  // 기존 문서 고정만 재사용한다. 추가 인증이 꺼져 있으면 승인을 요구하지 않는다.
  const pinned = retryTarget ? await pinFill(req) : undefined;
  // 고정한 문서가 iframe이면 추가 인증에서 다시 확인할 주소도 그 프레임 주소여야 한다.
  const outcome = await runFill(pinned ? { ...pinned, pageUrl: pinned.documentUrl } : req, sender, retryTarget && pinned
    ? { ...retryTarget, documentUrl: pinned.documentUrl } : undefined);
  return { ok: true, outcome };
}
