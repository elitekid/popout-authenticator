import { useEffect, useRef, useState } from 'preact/hooks';
import { evaluatePrf, PasskeyCancelledError } from './passkey';
import { connectUiPort } from './ui-port';
import { useT } from './use-t';
import { loadSettings } from '../../store/settings';

type Request = { action: 'fill' | 'disable'; issuer: string; label: string; site?: string; expiresAt: number; credIds: string[] };
type Active = { id: string; request: Request; phase: 'auth' | 'ready' | 'complete'; controller?: AbortController; timer?: ReturnType<typeof setTimeout> };
type View = { id?: string; request?: Request; busy?: boolean; retry?: boolean; error?: string; done?: boolean };
const errorKey = (error: unknown) => error === 'codeProtection.expired' || error === 'codeProtection.targetChanged'
  ? 'lock.codeAccess.expired' : 'lock.codeAccess.error';

// 기본 화면에 계속 붙어 있는 승인 호스트. OS 인증 UI 외에 창이나 탭을 만들지 않는다.
// trackInput: 자체 활동 전송이 없는 화면(관리 탭·창)의 입력을 자동 잠금 활동으로 알린다. 전송 제한은 ui-port 가 건다.
export function CodeAccessHost({ temporary = false, trackInput = false }: { temporary?: boolean; trackInput?: boolean }) {
  const t = useT();
  const [view, setView] = useState<View | null>(null);
  const retry = useRef<() => void>(() => undefined);
  const cancel = useRef<() => void>(() => undefined);
  useEffect(() => {
    let alive = true;
    let port: chrome.runtime.Port | null = null;
    let active: Active | null = null;
    let windowId: number | undefined;
    let reconnect: ReturnType<typeof setTimeout> | undefined;
    let dismiss: ReturnType<typeof setTimeout> | undefined;
    const activity = connectUiPort();
    if (temporary) void loadSettings().then((settings) => {
      if (alive) document.documentElement.dataset.theme = settings.theme;
    }).catch(() => undefined);
    const closeView = () => {
      if (!alive) return;
      setView(null);
      // 기본 화면에서 시작한 요청은 화면을 그대로 두고, 인증 때문에 연 화면만 닫는다.
      if (temporary) window.close();
    };
    const post = (message: unknown) => { try { port?.postMessage(message); } catch { /* onDisconnect 에서 무효화 */ } };
    const clearActive = (sendCancel: boolean) => {
      const previous = active;
      active = null;
      if (!previous) return;
      previous.controller?.abort();
      if (previous.timer) clearTimeout(previous.timer);
      if (sendCancel) post({ type: 'cancel', requestId: previous.id });
    };
    const expire = (error = 'codeProtection.expired') => {
      const id = active?.id;
      clearActive(true);
      if (alive) setView({ id, error: errorKey(error) });
    };
    const start = async () => {
      const operation = active;
      if (!operation || operation.phase !== 'ready') return;
      if (operation.request.expiresAt <= Date.now()) { expire(); return; }
      operation.phase = 'auth';
      const controller = new AbortController();
      operation.controller = controller;
      activity.activity();
      setView({ id: operation.id, request: operation.request, busy: true });
      try {
        const proof = await evaluatePrf(operation.request.credIds, {
          signal: controller.signal, timeoutMs: operation.request.expiresAt - Date.now(),
        });
        try {
          if (!alive || active !== operation || controller.signal.aborted) return;
          if (operation.request.expiresAt <= Date.now()) { expire(); return; }
          operation.phase = 'complete';
          post({ type: 'complete', requestId: operation.id, credId: proof.credId, prfOutput: Array.from(proof.prfOutput) });
        } finally { proof.prfOutput.fill(0); }
      } catch (error) {
        if (!alive || active !== operation || controller.signal.aborted) return;
        if (operation.request.expiresAt <= Date.now()) { expire(); return; }
        if (error instanceof PasskeyCancelledError) {
          clearActive(true);
          closeView();
          return;
        }
        operation.phase = 'ready';
        setView({ id: operation.id, request: operation.request, error: 'lock.codeAccess.error', retry: true });
      }
    };
    retry.current = () => void start();
    cancel.current = () => { clearActive(true); if (dismiss) clearTimeout(dismiss); closeView(); };
    const announce = () => post({ type: 'ready', visible: !document.hidden, focused: document.hasFocus(), windowId });
    const connect = () => {
      if (!alive) return;
      const connected = chrome.runtime.connect({ name: 'popout-code-access-ui' });
      port = connected;
      connected.onMessage.addListener((message) => {
        if (!alive || port !== connected || !message || typeof message !== 'object') return;
        if (message.type === 'request' && typeof message.requestId === 'string' && message.request) {
          clearActive(true);
          if (dismiss) clearTimeout(dismiss);
          const operation: Active = { id: message.requestId, request: message.request, phase: 'ready' };
          active = operation;
          operation.timer = setTimeout(() => {
            if (active !== operation) return;
            if (operation.phase === 'complete') {
              // 기한 안에 실제 입력이 끝난 성공을 늦은 응답 때문에 실패로 바꾸지 않는다.
              // 아직 실행 중이면 BG와 페이지 입력기의 기한 검사가 입력을 막는다.
              post({ type: 'cancel', requestId: operation.id });
            } else expire();
          }, Math.max(0, operation.request.expiresAt - Date.now()));
          void start();
          return;
        }
        if (!active || message.requestId !== active.id) return;
        if (message.type === 'invalidated') { expire(message.error); return; }
        if (message.type !== 'result') return;
        const id = active.id;
        clearActive(false);
        if (!message.ok) { setView({ id, error: errorKey(message.error) }); return; }
        if (temporary) { closeView(); return; }
        setView({ id, done: true });
        dismiss = setTimeout(() => { if (alive && !active) setView(null); }, 1500);
      });
      connected.onDisconnect.addListener(() => {
        void chrome.runtime.lastError;
        if (!alive || port !== connected) return;
        port = null;
        if (active) expire();
        reconnect = setTimeout(connect, 1000);
      });
      announce();
    };
    const onPageHide = () => clearActive(true);
    const onVisibility = () => {
      // OS 인증창으로 포커스가 옮겨지는 blur는 정상이다. 실제 탭을 숨기면 요청을 취소한다.
      if (document.hidden && active) expire();
      announce();
    };
    const onInput = () => activity.activity();
    const inputOptions = { capture: true, passive: true } as const;
    if (trackInput) {
      document.addEventListener('keydown', onInput, inputOptions);
      document.addEventListener('pointerdown', onInput, inputOptions);
    }
    connect();
    void chrome.windows.getCurrent().then((win) => {
      if (!alive) return;
      windowId = win.id;
      announce();
    }).catch(() => undefined);
    window.addEventListener('focus', announce);
    window.addEventListener('blur', announce);
    window.addEventListener('pagehide', onPageHide);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      alive = false;
      clearActive(true);
      if (reconnect) clearTimeout(reconnect);
      if (dismiss) clearTimeout(dismiss);
      port?.disconnect();
      activity.close();
      document.removeEventListener('keydown', onInput, inputOptions);
      document.removeEventListener('pointerdown', onInput, inputOptions);
      window.removeEventListener('focus', announce);
      window.removeEventListener('blur', announce);
      window.removeEventListener('pagehide', onPageHide);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [temporary, trackInput]);

  if (!view) return temporary ? <p class="empty" role="status">{t('popup.loading')}</p> : null;
  return <section class="code-access-inline" data-role="code-access" data-request-id={view.id} aria-live="polite">
    <strong>{t('lock.codeAccess.title')}</strong>
    {view.request && <p class="code-access-context">
      {view.request.issuer}{view.request.label && <> · {view.request.label}</>}
      {view.request.site && <><br />{view.request.site}</>}
    </p>}
    {view.busy && <p role="status">{t('lock.passkey.busy')}</p>}
    {view.error && <p class="error" role="alert" data-role="code-access-error">{t(view.error)}</p>}
    {view.done && <p role="status" data-role="code-access-done">{t('lock.codeAccess.done')}</p>}
    {!view.done && <div class="code-access-actions">
      {view.retry && <button type="button" class="primary" data-role="code-access-confirm" onClick={() => retry.current()}>{t('common.retry')}</button>}
      <button type="button" data-role="code-access-cancel" onClick={() => cancel.current()}>
        {t(view.busy || view.retry ? 'lock.codeAccess.cancel' : 'popup.qr.close')}
      </button>
    </div>}
  </section>;
}
