import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { isLocked } from '../../../store/lock';
import { supportsPasskeys } from '../../../core/browser';
import { onVaultChanged, readVaultFile } from '../../../store/vault';
import { UnlockForm } from '../../shared/UnlockForm';
import { CodeAccessSetup } from '../../passkey/CodeAccessSetup';
import { useT } from '../../shared/use-t';
import { EnableForm } from './EnableForm';
import { LockedPanel } from './LockedPanel';
import { RecoveryStep } from './RecoveryStep';

type View =
  | { kind: 'loading' }
  | { kind: 'noVault' }
  | { kind: 'error' }
  | { kind: 'locked' }
  | { kind: 'off' }
  | { kind: 'on'; credIds: string[] };

export function LockSection() {
  const t = useT();
  const [view, setView] = useState<View>({ kind: 'loading' });
  const [setup, setSetup] = useState(false);
  // 켠 직후·새로 만든 복구 코드. 확인을 마치거나 잠기면 메모리에서 지운다.
  // commit 이 있으면(새 코드 만들기) 다시 입력해 맞춘 뒤에 금고의 코드를 바꾼다.
  const [recovery, setRecovery] = useState<{ code: string; commit?: () => Promise<void> } | null>(null);
  const seq = useRef(0);
  const alive = useRef(true);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    let next: View;
    try {
      const file = await readVaultFile();
      if (!file) next = { kind: 'noVault' };
      else if (file.lock === 'none') next = { kind: 'off' };
      else if (await isLocked()) next = { kind: 'locked' };
      else {
        const credIds = file.wrappedKeys
          .filter((k) => k.kind === 'prf' && k.credId !== undefined)
          .map((k) => k.credId as string);
        next = { kind: 'on', credIds };
      }
    } catch {
      next = { kind: 'error' };
    }
    if (alive.current && mine === seq.current) setView(next);
  }, []);

  useEffect(() => {
    alive.current = true;
    void load();
    const offVault = onVaultChanged(() => void load());
    // 다른 창·자동 잠금으로 잠기면 바로 잠김 상태로 하고 복구 코드를 걷는다. 풀릴 때도 다시 읽는다.
    const onSession = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== 'session' || !('vaultKey' in changes)) return;
      if (changes.vaultKey.newValue === undefined) setRecovery(null);
      void load();
    };
    chrome.storage.onChanged.addListener(onSession);
    return () => {
      alive.current = false;
      offVault();
      chrome.storage.onChanged.removeListener(onSession);
    };
  }, [load]);

  if (view.kind === 'loading') return <div class="screen-loading" role="status">{t('popup.loading')}</div>;

  if (setup) return (
    <div class="lock" data-section="lock">
      <CodeAccessSetup onDone={() => { setSetup(false); void load(); }} onCancel={() => { setSetup(false); void load(); }} />
    </div>
  );

  const showRecovery = recovery !== null && view.kind !== 'locked';

  return (
    <div class="lock" data-section="lock">
      {view.kind === 'noVault' && (
        <p class="muted" data-role="lock-no-vault">
          {t('lock.noVault')}
        </p>
      )}
      {view.kind === 'error' && (
        <p class="error" role="alert">
          {t('lock.loadError')}
        </p>
      )}
      {view.kind === 'locked' && <UnlockForm onUnlocked={() => void load()} />}
      {showRecovery && (
        <RecoveryStep
          t={t}
          code={recovery.code}
          onDone={async () => {
            await recovery.commit?.();
            setRecovery(null);
          }}
        />
      )}
      {view.kind === 'off' && !showRecovery && (
        <>
          <section data-role="fill-default-info">
            <h2>{t('lock.basicFill.title')}</h2>
            <p class="muted">{t('lock.basicFill.desc')}</p>
          </section>
          <section data-role="optional-fill-auth">
            <h2>{t('lock.codeAccess.title')}</h2>
            <p class="muted">{t(supportsPasskeys() ? 'lock.codeAccess.setupDesc' : 'lock.passkey.browserUnsupported')}</p>
            {supportsPasskeys() && <button type="button" data-role="code-access-setup-open" onClick={() => setSetup(true)}>
              {t('lock.codeAccess.setup')}
            </button>}
          </section>
          <EnableForm t={t} onEnabled={(code) => setRecovery({ code })} />
        </>
      )}
      {view.kind === 'on' && !showRecovery && (
        <LockedPanel t={t} credIds={view.credIds} onRecoveryCode={(code, commit) => setRecovery({ code, commit })} onSetup={() => setSetup(true)} />
      )}
    </div>
  );
}
