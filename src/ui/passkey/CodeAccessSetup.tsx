import { useEffect, useRef, useState } from 'preact/hooks';
import { supportsPasskeys } from '../../core/browser';
import { enableCodeProtection } from '../../store/code-access';
import { addPrfKey, isLocked } from '../../store/lock';
import { readVaultFile } from '../../store/vault';
import { EnableForm } from '../manage/lock/EnableForm';
import { RecoveryStep } from '../manage/lock/RecoveryStep';
import { UnlockForm } from '../shared/UnlockForm';
import {
  PasskeyUnsupportedError,
  passkeyAvailable,
  evaluatePrf,
  passkeyErrorKey,
  registerPasskey,
} from '../shared/passkey';
import { connectUiPort } from '../shared/ui-port';
import { useT } from '../shared/use-t';

type Stage = 'loading' | 'unlock' | 'password' | 'recovery' | 'register' | 'done' | 'error';

// 기존 비밀번호·복구 키·PRF 등록 경로를 현재 화면에서 잇는다. 중단해도 이미 만든 잠금은 유지한다.
export function CodeAccessSetup({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const t = useT();
  const [stage, setStage] = useState<Stage>('loading');
  const [recovery, setRecovery] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  const sequence = useRef(0);
  const pending = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const current = (mine: number) => alive.current && sequence.current === mine;

  const register = async () => {
    if (pending.current) return;
    pending.current = true;
    const mine = ++sequence.current;
    const request = new AbortController();
    controller.current = request;
    setRecovery(null);
    setError(null);
    setStage('register');
    let output: Uint8Array | undefined;
    try {
      if (await isLocked()) {
        if (current(mine)) setStage('unlock');
        return;
      }
      const file = await readVaultFile();
      if (!current(mine)) return;
      if (!file || file.lock === 'none') throw new Error('lock not enabled');
      // 앞선 시도에서 저장했으면 등록을 반복하지 않고 보호를 켜는 단계부터 이어간다.
      const credIds = file.wrappedKeys.flatMap((key) => (key.kind === 'prf' && key.credId ? [key.credId] : []));
      if (credIds.length === 0) {
        const result = await registerPasskey({ signal: request.signal });
        output = result.prfOutput;
        if (!current(mine)) return;
        await addPrfKey(output, result.credId);
      } else {
        // 이미 지워진 패스키 ID 로 보호를 켜지 않도록, 켜기 직전에 실제로 한 번 인증한다.
        output = (await evaluatePrf(credIds, { signal: request.signal })).prfOutput;
        if (!current(mine)) return;
      }
      if (!current(mine)) return;
      await enableCodeProtection();
      if (current(mine)) setStage('done');
    } catch (failure) {
      if (current(mine)) {
        setError(passkeyErrorKey(failure));
        setStage('error');
      }
    } finally {
      output?.fill(0);
      pending.current = false;
      if (controller.current === request) controller.current = null;
    }
  };

  const load = async () => {
    if (pending.current) return;
    const mine = ++sequence.current;
    setError(null);
    setStage('loading');
    try {
      if (!supportsPasskeys()) throw new PasskeyUnsupportedError();
      const file = await readVaultFile();
      if (!current(mine)) return;
      if (!file) {
        setError('lock.noVault');
        setStage('error');
        return;
      }
      if (file.lock !== 'none' && await isLocked()) {
        if (current(mine)) setStage('unlock');
        return;
      }
      const hasPasskey = file.wrappedKeys.some((key) => key.kind === 'prf' && key.credId);
      if (!hasPasskey && !await passkeyAvailable()) throw new PasskeyUnsupportedError();
      if (!current(mine)) return;
      if (file.lock === 'none') setStage('password');
      else await register();
    } catch (failure) {
      if (current(mine)) {
        setError(passkeyErrorKey(failure));
        setStage('error');
      }
    }
  };

  useEffect(() => {
    alive.current = true;
    const port = connectUiPort();
    const activity = () => port.activity();
    window.addEventListener('pointerdown', activity);
    window.addEventListener('keydown', activity);
    const onStorage = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== 'session' || !('vaultKey' in changes) || changes.vaultKey.newValue !== undefined) return;
      sequence.current++;
      controller.current?.abort();
      setRecovery(null);
      setError(null);
      setStage('unlock');
    };
    chrome.storage.onChanged.addListener(onStorage);
    void load().catch(() => {
      if (alive.current) {
        setError('lock.codeAccess.error');
        setStage('error');
      }
    });
    return () => {
      alive.current = false;
      sequence.current++;
      controller.current?.abort();
      port.close();
      window.removeEventListener('pointerdown', activity);
      window.removeEventListener('keydown', activity);
      chrome.storage.onChanged.removeListener(onStorage);
    };
  }, []);

  return (
    <section data-role="code-access-setup" data-stage={stage}>
      <h2>{t('lock.codeAccess.setup')}</h2>
      {stage !== 'done' && supportsPasskeys() && <p>{t('lock.codeAccess.setupDesc')}</p>}
      {stage === 'loading' && <p role="status">{t('popup.loading')}</p>}
      {stage === 'unlock' && <UnlockForm onUnlocked={() => void load()} />}
      {stage === 'password' && <EnableForm t={t} onEnabled={(code) => { if (alive.current) { setRecovery(code); setStage('recovery'); } }} />}
      {stage === 'recovery' && recovery && (
        <RecoveryStep t={t} code={recovery} savedConfirmation onDone={register} />
      )}
      {stage === 'register' && <p role="status">{t('lock.passkey.busy')}</p>}
      {stage === 'done' && <p role="status" data-role="code-access-setup-done">{t('lock.codeAccess.enabled')}</p>}
      {stage === 'error' && (
        <>
          <p class="error" role="alert" data-role="code-access-setup-error">{t(error ?? 'lock.codeAccess.error')}</p>
          {supportsPasskeys() && <button type="button" class="primary" data-role="code-access-setup-retry" onClick={() => void load()}>
            {t('lock.codeAccess.setupRetry')}
          </button>}
        </>
      )}
      <button type="button" data-role="code-access-setup-close" onClick={() => {
        sequence.current++;
        controller.current?.abort();
        setRecovery(null);
        if (stage === 'done') onDone();
        else onCancel();
      }}>
        {t(stage === 'done' ? 'add.done' : 'lock.codeAccess.cancel')}
      </button>
    </section>
  );
}
