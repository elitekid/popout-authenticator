import { useEffect, useState } from 'preact/hooks';
import { isForced } from '../../../store/policy';
import { deleteSyncData, syncNow, type SyncStatus } from '../../../store/sync';
import { onVaultChanged, readVaultFile } from '../../../store/vault';
import type { PanelProps } from './panel-props';
import { BROWSER_TARGET, requestSyncConsent, supportsBrowserSync, syncConsentGranted } from '../../../core/browser';

const STATUSES: readonly string[] = ['off', 'locked', 'held', 'needs-join', 'overflow', 'ok'];

function storedStatus(raw: unknown): SyncStatus | null {
  const status = (raw as { status?: unknown } | undefined)?.status;
  return typeof status === 'string' && STATUSES.includes(status) ? (status as SyncStatus) : null;
}

export function SyncPanel({ t, settings, policy, save, onReady }: PanelProps & { onReady: () => void }) {
  // null: 아직 금고를 읽지 못함·금고 없음
  const [ready, setReady] = useState(false);
  const [lockOff, setLockOff] = useState<boolean | null>(null);
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ack, setAck] = useState(false);
  const [cleared, setCleared] = useState(false);
  // Firefox 데이터 전송 동의. 다른 브라우저는 늘 true.
  const [consent, setConsent] = useState(true);

  const readConsent = () => syncConsentGranted().then(setConsent, () => setConsent(false));

  useEffect(() => {
    if (!supportsBrowserSync()) {
      onReady();
      return;
    }
    let alive = true;
    const applyFile = (file: { lock: string } | null) => {
      if (alive) setLockOff(file === null ? null : file.lock === 'none');
    };
    const offVault = onVaultChanged(applyFile);
    void Promise.all([readVaultFile(), chrome.storage.local.get('syncStatus')]).then(([file, got]) => {
      if (!alive) return;
      applyFile(file);
      setStatus((prev) => prev ?? storedStatus(got.syncStatus));
      setReady(true);
    }, () => { if (alive) setFailed(true); }).finally(() => { if (alive) onReady(); });
    // 백그라운드 동기화가 남긴 상태도 따라간다.
    const onStorage = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== 'local' || !('syncStatus' in changes)) return;
      const next = storedStatus(changes.syncStatus.newValue);
      if (alive && next !== null) setStatus(next);
    };
    chrome.storage.onChanged.addListener(onStorage);
    // about:addons 에서 동의를 바꿔도 따라간다.
    const onPermission = () => { if (alive) void readConsent(); };
    if (BROWSER_TARGET === 'firefox') {
      void readConsent();
      chrome.permissions.onAdded.addListener(onPermission);
      chrome.permissions.onRemoved.addListener(onPermission);
    }
    return () => {
      alive = false;
      offVault();
      chrome.storage.onChanged.removeListener(onStorage);
      if (BROWSER_TARGET === 'firefox') {
        type Ev = { removeListener(cb: () => void): void };
        (chrome.permissions.onAdded as unknown as Ev).removeListener(onPermission);
        (chrome.permissions.onRemoved as unknown as Ev).removeListener(onPermission);
      }
    };
  }, []);

  const forced = isForced(policy, 'syncEnabled');
  const needsLock = settings.syncEnabled && lockOff === true && !settings.syncPlaintextAllowed;
  const needsConsent = settings.syncEnabled && !needsLock && !consent;
  const shownStatus = !settings.syncEnabled ? 'off' : needsLock ? 'needs-lock' : status === 'off' ? null : status;

  const runNow = async () => {
    setBusy(true);
    setFailed(false);
    try {
      setStatus(await syncNow());
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  // 클릭 처리기에서 기다림 없이 바로 요청한다(Firefox 는 사용자 동작 안에서만 동의 창을 띄운다).
  const allow = () => {
    void requestSyncConsent().then(async (granted) => {
      await readConsent();
      if (granted) await runNow();
    }, () => setFailed(true));
  };

  const clear = async () => {
    setBusy(true);
    setFailed(false);
    try {
      await deleteSyncData();
      setAck(false);
      setCleared(true);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  if (!supportsBrowserSync()) return <section class="settings-sync" data-role="settings-sync-box">
    <h2>{t('settings.sync.title')}</h2>
    <p class="muted" data-role="settings-sync-unavailable">{t('settings.sync.unsupported')}</p>
  </section>;

  if (!ready) return <section class="settings-sync" data-role="settings-sync-box">
    <h2>{t('settings.sync.title')}</h2>
    <p class={failed ? 'error' : 'muted'} role={failed ? 'alert' : 'status'}>{t(failed ? 'common.loadError' : 'popup.loading')}</p>
  </section>;

  return (
    <section class="settings-sync" data-role="settings-sync-box">
      <h2>{t('settings.sync.title')}</h2>
      <label class="check switch">
        <input
          type="checkbox"
          data-role="settings-sync"
          checked={settings.syncEnabled}
          disabled={forced}
          onClick={(e) => {
            if (BROWSER_TARGET === 'firefox' && e.currentTarget.checked) {
              void requestSyncConsent().then(() => readConsent(), () => undefined);
            }
          }}
          onChange={(e) => save({ syncEnabled: e.currentTarget.checked })}
        />
        <span>{t('settings.sync.toggle')}</span>
      </label>
      {forced && (
        <p class="muted" data-role="settings-sync-forced">
          {t('settings.policy.forced')}
        </p>
      )}
      {settings.syncEnabled && lockOff === true && (
        <>
          <label class="check switch">
            <input
              type="checkbox"
              data-role="settings-sync-plain"
              checked={settings.syncPlaintextAllowed}
              onChange={(e) => save({ syncPlaintextAllowed: e.currentTarget.checked })}
            />
            <span>{t('settings.sync.plain')}</span>
          </label>
          <p class="error" data-role="settings-sync-plain-warn">
            {t('settings.sync.plainWarn')}
          </p>
        </>
      )}
      <p data-role="settings-sync-status" data-state={failed ? 'failed' : needsConsent ? 'needs-consent' : (shownStatus ?? 'unknown')}>
        {failed
          ? t('settings.sync.failed')
          : needsConsent
            ? t(lockOff === true ? 'settings.sync.consentPlain' : 'settings.sync.consent')
            : shownStatus === null
            ? t('settings.sync.status.unknown')
            : t(`settings.sync.status.${shownStatus}`)}
      </p>
      {needsLock && <a href="#lock" data-role="settings-sync-lock">{t('add.policy.openLock')}</a>}
      {needsConsent && (
        <button type="button" class="primary" data-role="settings-sync-consent" disabled={busy} onClick={allow}>
          {t('popup.tabs.allow')}
        </button>
      )}
      <button type="button" data-role="settings-sync-now" disabled={busy || !settings.syncEnabled || needsLock || needsConsent} onClick={() => void runNow()}>
        {t('settings.sync.now')}
      </button>
      <label class="check">
        <input
          type="checkbox"
          data-role="settings-sync-clear-ack"
          checked={ack}
          onChange={(e) => {
            setAck(e.currentTarget.checked);
            setCleared(false);
          }}
        />
        <span>{t('settings.sync.clearAck')}</span>
      </label>
      <button
        type="button"
        class="danger"
        data-role="settings-sync-clear"
        disabled={!ack || busy}
        onClick={() => void clear()}
      >
        {t('settings.sync.clear')}
      </button>
      {cleared && (
        <p class="ok" data-role="settings-sync-cleared">
          {t('settings.sync.cleared')}
        </p>
      )}
    </section>
  );
}
