// 기기 인증 요청은 연결된 기본 UI 포트 하나·작업 하나에만 유효하다.
import { randomBytes, toBase64Url } from '../core/crypto/bytes';
import { unwrapWithPrf } from '../core/crypto/keys';
import { decryptVault } from '../core/crypto/vault';
import type { Account, VaultFile } from '../core/types';
import { readCodeProtection, type CodeAction } from '../store/code-access';
import { applyOpenMode } from './open-mode';
import { getSessionKey, withSessionLock } from '../store/session';
import { loadAccounts, readVaultFile, withVaultWriteLock } from '../store/vault';
import type { FillRequest } from './fill';

const KEY = 'codeAccessRequests';
const TTL = 120_000;
type Action = CodeAction | 'fill';
type FillTarget = FillRequest & { documentId: string; documentUrl: string; topUrl: string; pinId?: string };
type Pending = {
  action: Action;
  accountId?: string;
  step: number;
  expiresAt: number;
  checksum: string;
  lockChangedAt?: number;
  unlockedAt: number;
  approvalHost?: string;
  // UI에서 눌렀으면 그 문서, 사이트에서 눌렀으면 대상 브라우저 창의 기본 팝업만 승인한다.
  approvalSource: { documentId: string } | { windowId: number };
  fill?: FillTarget;
  processing?: boolean;
};
type Requests = Record<string, Pending>;
type FillExecutor = (req: FillTarget, account: Account, file: VaultFile, validate: (committed?: VaultFile) => Promise<void>, expiresAt: number) => Promise<unknown>;
let fillExecutor: FillExecutor | undefined;
const PORT_NAME = 'popout-code-access-ui';
type Host = { id: string; port: chrome.runtime.Port; visible: boolean; focused: boolean; windowId?: number; touchedAt: number; requestId?: string; processing?: string };
const hosts = new Map<string, Host>();
const delivered = new Map<string, (ready: boolean) => void>();
export function setApprovedFillExecutor(executor: FillExecutor): void { fillExecutor = executor; }

async function locked<T>(work: () => Promise<T>): Promise<T> {
  return await navigator.locks.request('popout-code-access', work);
}
async function readRequests(): Promise<Requests> {
  const value = (await chrome.storage.session.get(KEY))[KEY];
  const all: Requests = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  let expired = false;
  for (const [id, request] of Object.entries(all)) {
    if (!request || !request.approvalSource || request.expiresAt <= Date.now()) { delete all[id]; expired = true; }
  }
  if (expired) await chrome.storage.session.set({ [KEY]: all });
  return all;
}
function internal(sender: chrome.runtime.MessageSender): boolean {
  return sender.id === chrome.runtime.id && typeof sender.url === 'string' && sender.url.startsWith(chrome.runtime.getURL(''));
}
function allowedHost(sender: chrome.runtime.MessageSender): boolean {
  if (!internal(sender) || sender.frameId && sender.frameId !== 0) return false;
  const path = new URL(sender.url!).pathname;
  return ['/popup.html', '/window.html', '/sidepanel.html', '/manage.html'].includes(path);
}
function sameHost(host: Host, request: Pending): boolean {
  return hosts.get(host.id) === host && request.approvalHost === host.id;
}
function post(host: Host, message: unknown): boolean {
  try { host.port.postMessage(message); return true; } catch { return false; }
}
function errorCode(error: unknown): string {
  return error instanceof Error && error.message.startsWith('codeProtection.') ? error.message : 'codeProtection.failed';
}
async function assertCurrent(request: Pending, committed?: VaultFile): Promise<VaultFile> {
  const file = await readVaultFile();
  if (!(await readCodeProtection()) || !file || file.lock === 'none' || !(await getSessionKey()) ||
      file.checksum !== (committed?.checksum ?? request.checksum) || file.lockChangedAt !== request.lockChangedAt ||
      (await chrome.storage.session.get('unlockedAt')).unlockedAt !== request.unlockedAt || request.expiresAt <= Date.now()) {
    throw new Error('codeProtection.expired');
  }
  return file;
}

// 대상 문서를 먼저 고정한다. 인증 중 탭의 포커스가 바뀌어도 다른 입력칸으로 보내지 않는다.
export async function pinFill(req: FillRequest): Promise<FillTarget> {
  const tab = await chrome.tabs.get(req.tabId);
  const target: chrome.scripting.InjectionTarget = req.documentId
    ? { tabId: req.tabId, documentIds: [req.documentId] }
    : req.frameId !== undefined ? { tabId: req.tabId, frameIds: [req.frameId] } : { tabId: req.tabId, allFrames: true };
  // 요청마다 id 를 붙여 고정한 칸을 기억한다. 대기 중 다른 넣기가 고정해도 서로 덮지 않는다.
  const pinId = crypto.randomUUID();
  const results = await chrome.scripting.executeScript({ target, args: [pinId], func: (pinId: string) => {
    let holder: Element | null = document.activeElement;
    while (holder?.shadowRoot?.activeElement) holder = holder.shadowRoot.activeElement;
    let inputActive = holder instanceof HTMLInputElement || holder instanceof HTMLTextAreaElement;
    // 이전에 입력했던 다른 iframe의 activeElement는 남을 수 있다. 부모 문서의
    // 활성 프레임 사슬까지 확인할 수 있을 때만 blur 뒤 입력칸을 유지한다.
    try {
      let frame: Window = window;
      while (inputActive && frame !== frame.parent) {
        let parentHolder = frame.parent.document.activeElement;
        while (parentHolder?.shadowRoot?.activeElement) parentHolder = parentHolder.shadowRoot.activeElement;
        inputActive = (parentHolder?.tagName === 'IFRAME' || parentHolder?.tagName === 'FRAME') &&
          (parentHolder as HTMLIFrameElement).contentWindow === frame;
        frame = frame.parent;
      }
    } catch { inputActive = false; }
    // 대기 뒤 넣기가 그 사이 옮겨 간 포커스를 따라가지 않게, 지금 입력칸을 이 문서(격리 세계)에 기억해 둔다.
    const editable = holder instanceof HTMLElement && holder.isContentEditable;
    const pins = ((globalThis as { __popoutPinnedFields?: Map<string, WeakRef<Element> | null> })
      .__popoutPinnedFields ??= new Map());
    pins.set(pinId, holder && (inputActive || editable) ? new WeakRef(holder) : null);
    // 쓰이지 않은 고정(다른 프레임·취소된 요청)이 쌓이지 않게 오래된 것부터 버린다.
    for (const old of pins.keys()) { if (pins.size <= 20) break; pins.delete(old); }
    return { url: location.href,
      focused: document.hasFocus() && holder?.tagName !== 'IFRAME' && holder?.tagName !== 'FRAME',
      // 분리 창을 누르면 문서 포커스는 빠져도 마지막 입력칸은 남는다.
      inputActive,
    };
  } });
  const inputs = results.filter((r) => r.result?.inputActive);
  const result = req.documentId || req.frameId !== undefined ? results[0]
    : results.find((r) => r.result?.focused) ?? (inputs.length === 1 ? inputs[0] : undefined)
      ?? results.find((r) => r.frameId === 0);
  if (!result?.documentId || !result.result?.url || !tab.url ||
      ((req.documentId || req.frameId !== undefined) && req.pageUrl && req.pageUrl !== result.result.url) ||
      (!req.documentId && req.frameId === undefined && req.pageUrl && req.pageUrl !== tab.url)) {
    throw new Error('codeProtection.targetChanged');
  }
  return { ...req, windowId: tab.windowId, documentId: result.documentId, documentUrl: result.result.url, topUrl: tab.url, pinId };
}
export async function validateFillTarget(req: FillTarget): Promise<void> {
  const tab = await chrome.tabs.get(req.tabId);
  if (tab.url !== req.topUrl) throw new Error('codeProtection.targetChanged');
  const [result] = await chrome.scripting.executeScript({
    target: { tabId: req.tabId, documentIds: [req.documentId] }, func: () => location.href,
  });
  if (result?.documentId !== req.documentId || result.result !== req.documentUrl) throw new Error('codeProtection.targetChanged');
}

async function requestInfo(request: Pending) {
  const file = await assertCurrent(request);
  const account = request.accountId ? (await loadAccounts()).find((a) => a.id === request.accountId && a.deletedAt === undefined) : undefined;
  if (request.action !== 'disable' && !account) throw new Error('codeProtection.expired');
  if (request.fill) await validateFillTarget(request.fill);
  return { action: request.action, accountId: request.accountId,
    issuer: account?.issuer ?? '', label: account?.label ?? '',
    site: request.fill ? new URL(request.fill.documentUrl).host : undefined, expiresAt: request.expiresAt,
    credIds: file.wrappedKeys.filter((k) => k.kind === 'prf' && k.credId).map((k) => k.credId!) };
}

// 저장한 요청의 출발 위치에 맞는 UI에 결박한다. 다른 모니터의 분리 창으로 넘기지 않는다.
async function dispatch(): Promise<void> {
  await locked(async () => {
    const all = await readRequests();
    for (const [id, request] of Object.entries(all)) {
      if (request.approvalHost) continue;
      const host = [...hosts.values()].filter((h) => {
        if (!h.visible || h.requestId) return false;
        const source = request.approvalSource;
        if ('documentId' in source) return h.port.sender?.documentId === source.documentId;
        return h.windowId === source.windowId && new URL(h.port.sender!.url!).pathname === '/popup.html';
      }).sort((a, b) => Number(b.focused) - Number(a.focused) || b.touchedAt - a.touchedAt)[0];
      if (!host) break;
      try {
        const info = await requestInfo(request);
        request.approvalHost = host.id;
        host.requestId = id;
        await chrome.storage.session.set({ [KEY]: all });
        if (!post(host, { type: 'request', requestId: id, request: info })) throw new Error('codeProtection.failed');
        delivered.get(id)?.(true);
      } catch (error) {
        delete all[id];
        host.requestId = undefined;
        await chrome.storage.session.set({ [KEY]: all });
        delivered.get(id)?.(false);
        post(host, { type: 'invalidated', requestId: id, error: errorCode(error) });
      }
    }
  });
}

async function openRequest(action: Action, accountId?: string, step = 0, fill?: FillTarget, requester?: chrome.runtime.MessageSender): Promise<void> {
  let approvalSource: Pending['approvalSource'];
  if (requester) {
    if (!allowedHost(requester) || !requester.documentId) throw new Error('codeProtection.failed');
    approvalSource = { documentId: requester.documentId };
  } else {
    if (fill?.windowId === undefined) throw new Error('codeProtection.failed');
    approvalSource = { windowId: fill.windowId };
  }
  const id = toBase64Url(randomBytes(24));
  let timer: ReturnType<typeof setTimeout> | undefined;
  let wasDelivered = false;
  const ready = new Promise<boolean>((resolve) => {
    delivered.set(id, (value) => { wasDelivered = value; if (timer) clearTimeout(timer); resolve(value); });
    timer = setTimeout(() => delivered.get(id)?.(false), 10_000);
  });
  try {
    await locked(async () => {
      const file = await readVaultFile();
      if (!(await readCodeProtection()) || !file || file.lock === 'none' || !(await getSessionKey()) ||
          !file.wrappedKeys.some((k) => k.kind === 'prf' && k.credId)) throw new Error('codeProtection.setupFirst');
      if (action !== 'disable' && (!accountId || !(await loadAccounts()).some((a) => a.id === accountId && a.deletedAt === undefined))) {
        throw new Error('codeProtection.expired');
      }
      const unlockedAt = (await chrome.storage.session.get('unlockedAt')).unlockedAt;
      if (typeof unlockedAt !== 'number') throw new Error('codeProtection.expired');
      const all = await readRequests();
      // 동시 요청으로 여러 인증 창이 교차하지 않게 기존 작업을 먼저 취소한다.
      for (const [oldId, pending] of Object.entries(all)) {
        const host = pending.approvalHost ? hosts.get(pending.approvalHost) : undefined;
        if (host) { post(host, { type: 'invalidated', requestId: oldId, error: 'codeProtection.expired' }); host.requestId = undefined; }
        delivered.get(oldId)?.(false);
      }
      await chrome.storage.session.set({ [KEY]: { [id]: { action, accountId, step, expiresAt: Date.now() + TTL,
        checksum: file.checksum, lockChangedAt: file.lockChangedAt, unlockedAt, fill, approvalSource } satisfies Pending } });
    });
    await dispatch();
    if (!wasDelivered && !requester) {
      // 사이트에서 시작했으면 해당 창의 작은 인증 화면만 연다. query는 화면 표시용이며
      // 승인 출처는 계속 위의 documentId/windowId와 배달받은 포트로 검사한다.
      // 다른 탭의 요청이 전역 action 설정을 교차해서 바꾸지 않게 열기/복원을 묶는다.
      await navigator.locks.request('popout-code-access-popup', async () => {
        if (wasDelivered) return; // 기다리는 동안 이미 열린 기본 UI로 배달됐을 수 있다.
        if (!(await locked(async () => (await readRequests())[id]))) throw new Error('codeProtection.expired');
        try {
          await chrome.action.setPopup({ popup: 'popup.html?approval=1' });
          await chrome.action.openPopup({ windowId: fill!.windowId! });
        } finally {
          // 인증 종료까지 임시 주소를 남겨 두지 않는다. 다음 툴바 클릭은 원래 열기 방식이다.
          await applyOpenMode().catch(() => undefined);
        }
      });
    }
    if (!(await ready)) throw new Error('codeProtection.failed');
  } catch (error) {
    await locked(async () => {
      const all = await readRequests();
      const host = all[id]?.approvalHost ? hosts.get(all[id].approvalHost!) : undefined;
      if (host?.requestId === id) { host.requestId = undefined; post(host, { type: 'invalidated', requestId: id, error: errorCode(error) }); }
      delete all[id];
      await chrome.storage.session.set({ [KEY]: all });
    });
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
    delivered.delete(id);
  }
}
export async function requestFillApproval(req: FillRequest, accountId: string, requester?: chrome.runtime.MessageSender): Promise<void> {
  await openRequest('fill', accountId, 0, await pinFill(req), requester);
}

async function complete(id: string, host: Host, credId: string, output: number[]) {
  // 한 번만 실행하도록 표시하되, 실행 중에도 취소/창 닫힘이 요청을 없앨 수 있게 잠금은 곧 푼다.
  const request = await locked(async () => {
    const all = await readRequests();
    const pending = all[id];
    if (!pending || pending.processing || !sameHost(host, pending)) throw new Error('codeProtection.expired');
    await assertCurrent(pending);
    pending.processing = true;
    await chrome.storage.session.set({ [KEY]: all });
    return pending;
  });
  const validate = async (committed?: VaultFile) => {
    if (request.fill) await validateFillTarget(request.fill);
    await locked(async () => {
      const current = (await readRequests())[id];
      if (!current?.processing || !sameHost(host, current)) throw new Error('codeProtection.expired');
      // 인증 완료 뒤에도 삭제(취소)와 기한을 확인한다. HOTP 자체 저장만 새 checksum으로 인정한다.
      await assertCurrent({ ...request, expiresAt: Math.min(request.expiresAt, current.expiresAt) }, committed);
    });
  };
  const prf = new Uint8Array(output);
  let key: Uint8Array | undefined;
  try {
    const file = await assertCurrent(request);
    const wrapped = file.wrappedKeys.find((k) => k.kind === 'prf' && k.credId === credId);
    if (!wrapped) throw new Error('codeProtection.failed');
    key = await unwrapWithPrf(wrapped, prf);
    const accounts = await decryptVault(file, key);
    const account = accounts.find((a) => a.id === request.accountId && a.deletedAt === undefined);
    if (request.action !== 'disable' && !account) throw new Error('codeProtection.expired');
    await validate();
    if (request.action === 'fill') {
      if (!request.fill || !account || !fillExecutor) throw new Error('codeProtection.failed');
      await fillExecutor(request.fill, account, file, validate, request.expiresAt);
      return { ok: true, action: 'fill' };
    }
    return await withVaultWriteLock(() => withSessionLock(async () => {
      await validate();
      if (request.action === 'disable') {
        await chrome.storage.local.set({ codeProtection: false });
        await chrome.storage.session.remove(KEY);
        return { ok: true, action: request.action };
      }
      throw new Error('codeProtection.failed');
    }));
  } finally {
    prf.fill(0);
    key?.fill(0);
    await locked(async () => {
      const all = await readRequests();
      delete all[id];
      await chrome.storage.session.set({ [KEY]: all });
    }).catch(() => undefined); // 처리 결과를 정리 저장 실패로 뒤집지 않는다. processing은 재사용을 막는다.
  }
}

export function register(): void {
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== PORT_NAME) return;
    if (!port.sender || !allowedHost(port.sender)) { port.disconnect(); return; }
    const host: Host = { id: toBase64Url(randomBytes(18)), port, visible: false, focused: false, touchedAt: Date.now() };
    hosts.set(host.id, host);
    port.onMessage.addListener((message) => {
      if (!message || typeof message !== 'object') return;
      if (message.type === 'ready') {
        host.visible = message.visible === true;
        host.focused = message.focused === true;
        // 일반 탭은 브라우저가 준 값을 쓰고, native toolbar popup은 tab이 없어 UI가 조회한 창 ID를 쓴다.
        host.windowId = port.sender?.tab?.windowId ??
          (Number.isInteger(message.windowId) && message.windowId >= 0 ? message.windowId : undefined);
        host.touchedAt = Date.now();
        void dispatch().catch(() => undefined);
        return;
      }
      if (typeof message.requestId !== 'string' || message.requestId !== host.requestId) return;
      const id = message.requestId;
      if (message.type === 'cancel') {
        void locked(async () => {
          const all = await readRequests();
          if (all[id] && sameHost(host, all[id])) {
            delete all[id];
            await chrome.storage.session.set({ [KEY]: all });
          }
          if (host.requestId === id) host.requestId = undefined;
        }).catch(() => undefined);
        return;
      }
      if (message.type !== 'complete' || host.processing === id) return;
      if (typeof message.credId !== 'string' || !Array.isArray(message.prfOutput) || message.prfOutput.length !== 32 ||
          !message.prfOutput.every((v: unknown) => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 255)) {
        post(host, { type: 'result', requestId: id, ok: false, error: 'codeProtection.failed' });
        return;
      }
      host.processing = id;
      void complete(id, host, message.credId, message.prfOutput).then(
        (result) => post(host, { type: 'result', requestId: id, ...result }),
        (error) => post(host, { type: 'result', requestId: id, ok: false, error: errorCode(error) }),
      ).finally(() => { if (host.processing === id) host.processing = undefined; if (host.requestId === id) host.requestId = undefined; });
    });
    port.onDisconnect.addListener(() => {
      hosts.delete(host.id);
      // 서비스 워커 재시작·페이지 닫힘 뒤에는 남은 요청을 새 포트로 이어 승인할 수 없다.
      void locked(async () => {
        const all = await readRequests();
        for (const [id, request] of Object.entries(all)) if (request.approvalHost === host.id) delete all[id];
        await chrome.storage.session.set({ [KEY]: all });
      }).catch(() => undefined);
    });
  });
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (!message || typeof message !== 'object' || !String(message.type).startsWith('code-access-')) return false;
    // 승인과 취소는 요청을 받은 포트에서만 받는다. 일반 메시지로 proof를 재사용할 수 없다.
    if (!allowedHost(sender) || message.type !== 'code-access-request' || message.action !== 'disable') {
      respond({ ok: false, error: 'codeProtection.failed' }); return false;
    }
    void openRequest('disable', undefined, 0, undefined, sender).then(
      () => respond({ ok: true }), (error) => respond({ ok: false, error: errorCode(error) }),
    );
    return true;
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    const invalid = (area === 'session' && changes.vaultKey && changes.vaultKey.newValue === undefined) ||
      (area === 'local' && changes.codeProtection && changes.codeProtection.newValue !== true) || area === 'managed';
    if (!invalid && !(area === 'local' && changes.vault)) return;
    void locked(async () => {
      const all = await readRequests();
      for (const [id, request] of Object.entries(all)) {
        // HOTP 저장·인증 끄기는 실행 중 자기 저장을 만든다. 완료 직전 검증이 담당한다.
        if (request.processing && ((area === 'local' && changes.vault && !invalid) ||
            (area === 'local' && changes.codeProtection && request.action === 'disable'))) continue;
        const host = request.approvalHost ? hosts.get(request.approvalHost) : undefined;
        if (host) { post(host, { type: 'invalidated', requestId: id, error: 'codeProtection.expired' }); host.requestId = undefined; }
        delete all[id];
        delivered.get(id)?.(false);
      }
      await chrome.storage.session.set({ [KEY]: all });
    }).catch(() => undefined);
  });
}
