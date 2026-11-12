import { useEffect, useRef, useState } from 'preact/hooks';
import { addPrfKey, isLocked } from '../../store/lock';
import { openPasskeyUnlock } from '../popup/open-actions';
import {
  passkeyErrorKey,
  registerPasskey,
} from '../shared/passkey';
import { useT } from '../shared/use-t';
import { CodeAccessWindow } from './CodeAccessWindow';
import { CodeAccessSetup } from './CodeAccessSetup';

type Mode = 'register' | 'unlock';
type State =
  | { kind: 'loading' }
  | { kind: 'needUnlock' }
  | { kind: 'busy' }
  | { kind: 'done' }
  | { kind: 'error'; key: string };

export function App() {
  if (new URLSearchParams(location.search).get('mode') === 'use') return <CodeAccessWindow />;
  if (new URLSearchParams(location.search).get('mode') === 'setup') {
    const back = () => location.replace(chrome.runtime.getURL('popup.html'));
    return <div class="passkey manage-main"><CodeAccessSetup onDone={back} onCancel={back} /></div>;
  }
  return <LegacyPasskey />;
}

// 오래된 진입 주소도 추가 시작 단추 없이 현재 페이지에서 인증한다.
function LegacyPasskey() {
  const t = useT();
  const mode: Mode = new URLSearchParams(location.search).get('mode') === 'unlock' ? 'unlock' : 'register';
  const [state, setState] = useState<State>({ kind: 'loading' });
  const alive = useRef(true);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    alive.current = true;
    void start();
    return () => {
      alive.current = false;
      controller.current?.abort();
    };
  }, [mode]);

  const start = async () => {
    if (controller.current) return;
    const request = new AbortController();
    controller.current = request;
    setState({ kind: 'busy' });
    let output: Uint8Array | undefined;
    try {
      if (mode === 'register') {
        // 창을 연 뒤 다른 창에서 잠갔을 수 있다. 인증기에 쓸모없는 패스키를 남기지 않게 시작 직전에 다시 본다.
        if (await isLocked().catch(() => true)) {
          if (alive.current) setState({ kind: 'needUnlock' });
          return;
        }
        if (!alive.current) return;
        const { credId, prfOutput } = await registerPasskey({ signal: request.signal });
        output = prfOutput;
        if (!alive.current || request.signal.aborted) return;
        await addPrfKey(output, credId);
      } else {
        await openPasskeyUnlock({ signal: request.signal });
      }
      if (alive.current) setState({ kind: 'done' });
    } catch (error) {
      if (alive.current) setState({ kind: 'error', key: passkeyErrorKey(error) });
    } finally {
      output?.fill(0);
      controller.current = null;
    }
  };

  const canStart = state.kind === 'error';

  return (
    <div data-app="passkey" class="passkey">
      <h1>{t('lock.passkey.title')}</h1>
      <p>{t(mode === 'register' ? 'lock.passkey.register.desc' : 'lock.passkey.unlock.desc')}</p>
      {state.kind === 'needUnlock' && (
        <p class="error" role="alert" data-role="passkey-need-unlock">
          {t('lock.passkey.needUnlock')}
        </p>
      )}
      {canStart && (
        <button type="button" class="primary" data-role="passkey-start" onClick={() => void start()}>
          {t('common.retry')}
        </button>
      )}
      {state.kind === 'busy' && <p class="muted">{t('lock.passkey.busy')}</p>}
      {state.kind === 'done' && (
        <p data-role="passkey-done">
          {t(mode === 'register' ? 'lock.passkey.register.done' : 'lock.passkey.unlock.done')}
        </p>
      )}
      {state.kind === 'error' && (
        <p class="error" role="alert" data-role="passkey-error">
          {t(state.key)}
        </p>
      )}
    </div>
  );
}
