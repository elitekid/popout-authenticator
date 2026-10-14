import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { CorruptVaultError } from '../../../core/crypto/errors';
import { LockedError } from '../../../store/errors';
import { readPolicy, type Policy } from '../../../store/policy';
import { loadAccounts, onVaultChanged, readVaultFile } from '../../../store/vault';
import { UnlockForm } from '../../shared/UnlockForm';
import { useT } from '../../shared/use-t';
import { openTaskWindow, useScreenContext } from '../../shared/screen-context';
import { ExportPanel } from './ExportPanel';
import { RawImport, RawSave } from './RawPanel';
import { SnapshotPanel } from './SnapshotPanel';
import { ComparePanel } from './ComparePanel';

type State =
  | { kind: 'loading' }
  | { kind: 'locked' }
  | { kind: 'corrupt' }
  | { kind: 'error' }
  | { kind: 'ready'; lockOn: boolean };

export function BackupSection() {
  const t = useT();
  const { toolbarPopup } = useScreenContext();
  const [windowFailed, setWindowFailed] = useState(false);
  const openFiles = () => void openTaskWindow('backup').catch(() => setWindowFailed(true));
  const [state, setState] = useState<State>({ kind: 'loading' });
  // 관리자 정책: 읽기 전(null)에는 내보내기 영역을 그리지 않아 잠깐 보였다 사라지지 않게 한다.
  const [policy, setPolicy] = useState<Policy | null>(null);
  const sequence = useRef(0);

  useEffect(() => {
    void readPolicy().then(setPolicy);
  }, []);

  const load = useCallback(async () => {
    const mine = ++sequence.current;
    try {
      const file = await readVaultFile();
      if (file) await loadAccounts();
      if (mine !== sequence.current) return;
      setState({ kind: 'ready', lockOn: file !== null && file.lock !== 'none' });
    } catch (error) {
      if (mine !== sequence.current) return;
      if (error instanceof LockedError) setState({ kind: 'locked' });
      else if (error instanceof CorruptVaultError) setState({ kind: 'corrupt' });
      else setState({ kind: 'error' });
    }
  }, []);

  useEffect(() => {
    void load();
    const offVault = onVaultChanged(() => void load());
    // 다른 창·자동 잠금으로 잠기면 만든 내보내기·QR 을 바로 걷는다.
    const onSession = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== 'session' || !('vaultKey' in changes)) return;
      if (changes.vaultKey.newValue === undefined) {
        sequence.current++;
        setState((prev) => (prev.kind === 'ready' && prev.lockOn ? { kind: 'locked' } : prev));
      }
      void load();
    };
    chrome.storage.onChanged.addListener(onSession);
    return () => {
      sequence.current++;
      offVault();
      chrome.storage.onChanged.removeListener(onSession);
    };
  }, [load]);

  if (state.kind === 'loading' || policy === null) return <div class="screen-loading" role="status">{t('popup.loading')}</div>;

  return (
    <div class="backup" data-section="backup">
      {state.kind === 'locked' && <UnlockForm onUnlocked={() => void load()} />}
      {state.kind === 'error' && (
        <p class="error" role="alert">
          {t('backup.loadError')}
        </p>
      )}
      {state.kind === 'corrupt' && (
        <div class="backup-alert" data-role="corrupt">
          <p>{t('backup.corrupt')}</p>
          {policy !== null && !policy.disableExport && (toolbarPopup
            ? <button type="button" onClick={openFiles}>{t('backup.raw.save')}</button>
            : <RawSave t={t} big />)}
        </div>
      )}
      {state.kind === 'ready' && (
        <>
          <ComparePanel t={t} />
          {policy?.disableExport ? (
            <p class="muted" data-role="export-blocked">
              {t('backup.policy.noExport')}
            </p>
          ) : (
            policy !== null && (toolbarPopup
              ? <section class="backup-export"><button type="button" data-role="backup-file-window" onClick={openFiles}>{t('backup.export.title')}</button></section>
              : <ExportPanel t={t} lockOn={state.lockOn} />)
          )}
          <SnapshotPanel t={t} />
        </>
      )}
      {(state.kind === 'ready' || state.kind === 'corrupt') && (
        <>
          {state.kind === 'corrupt' && <SnapshotPanel t={t} />}
          {/* 정책: 내보내기를 막으면 원시 사본 저장도 숨기고, 비밀번호를 강제하는데 잠금이 꺼져 있으면 가져오기도 막는다. */}
          {policy !== null && !(policy.enforcePassword && state.kind === 'ready' && !state.lockOn) && (
            toolbarPopup
              ? <section class="backup-raw"><button type="button" data-role="raw-file-window" onClick={openFiles}>{t('backup.raw.import')}</button></section>
              : <RawImport t={t} showSave={state.kind === 'ready' && !policy.disableExport} />
          )}
        </>
      )}
      <p class="muted" data-role="backup-notice">
        {t('backup.notice')}
      </p>
      {windowFailed && <p class="error" role="alert">{t('backup.loadError')}</p>}
    </div>
  );
}
