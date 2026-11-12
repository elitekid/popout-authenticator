import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import type { Account } from '../../../core/types';
import { LockedError } from '../../../store/errors';
import { RestoreDuplicateError, TRASH_DAYS, emptyTrash, listTrash, restoreFromTrash } from '../../../store/trash';
import { onVaultChanged } from '../../../store/vault';
import { UnlockForm } from '../../shared/UnlockForm';
import { useT } from '../../shared/use-t';

const DAY_MS = 86_400_000;

function daysLeft(a: Account, now: number): number {
  const passed = Math.floor((now - (a.deletedAt ?? now)) / DAY_MS);
  return Math.max(0, TRASH_DAYS - Math.max(0, passed));
}

export function TrashSection() {
  const t = useT();
  const [list, setList] = useState<Account[] | null>(null);
  const [locked, setLocked] = useState(false);
  const [failed, setFailed] = useState<'load' | 'action' | 'duplicate' | null>(null);
  // 확인 중인 것: 줄 id, 'all', 없으면 null
  const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const sequence = useRef(0);

  const load = useCallback(async () => {
    const mine = ++sequence.current;
    try {
      const next = await listTrash();
      if (mine !== sequence.current) return;
      setList(next);
      setLocked(false);
      setFailed(null);
    } catch (error) {
      if (mine !== sequence.current) return;
      if (error instanceof LockedError) { setList(null); setLocked(true); }
      else setFailed('load');
    }
  }, []);

  useEffect(() => {
    void load();
    const offVault = onVaultChanged(() => void load());
    const onSession = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== 'session' || !('vaultKey' in changes)) return;
      if (changes.vaultKey.newValue === undefined) {
        sequence.current++;
        setList(null);
        setConfirm(null);
        setLocked(true);
      } else void load();
    };
    chrome.storage.onChanged.addListener(onSession);
    return () => { sequence.current++; offVault(); chrome.storage.onChanged.removeListener(onSession); };
  }, [load]);

  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await work();
      setFailed(null);
      setConfirm(null);
      await load();
    } catch (error) {
      if (error instanceof LockedError) setLocked(true);
      else setFailed(error instanceof RestoreDuplicateError ? 'duplicate' : 'action');
    } finally {
      setBusy(false);
    }
  };

  const now = Date.now();

  return (
    <div class="trash" data-section="trash">
      {!locked && !failed && list === null && <div class="screen-loading" role="status">{t('popup.loading')}</div>}
      {locked && <UnlockForm onUnlocked={() => void load()} />}
      {failed && (
        <p class="error" role="alert">
          {t(failed === 'load' ? 'common.loadError' : failed === 'duplicate' ? 'accounts.error.duplicate' : 'common.actionError')}
        </p>
      )}
      {!locked && list && list.length === 0 && (
        <p class="empty" data-role="trash-empty">
          {t('trash.empty')}
        </p>
      )}
      {!locked && list && list.length > 0 && (
        <>
          <div class="trash-head">
            {confirm === 'all' ? (
              <>
                <span>{t('trash.emptyAll.confirm')}</span>
                <button
                  type="button"
                  class="danger"
                  data-role="empty-confirm"
                  disabled={busy}
                  onClick={() => void run(() => emptyTrash())}
                >
                  {t('trash.emptyAll.yes')}
                </button>
                <button type="button" onClick={() => setConfirm(null)}>
                  {t('accounts.cancel')}
                </button>
              </>
            ) : (
              <button type="button" class="danger" data-role="empty-trash" onClick={() => setConfirm('all')}>
                {t('trash.emptyAll')}
              </button>
            )}
          </div>
          <ul class="trash-list">
            {list.map((a) => (
              <li key={a.id} data-role="trash-row" data-account-id={a.id}>
                <span class="issuer">{a.issuer}</span> <span class="label">{a.label}</span>
                <span class="muted">{t('trash.daysLeft', { days: daysLeft(a, now) })}</span>
                <button
                  type="button"
                  data-role="restore"
                  disabled={busy}
                  onClick={() => void run(() => restoreFromTrash([a.id]))}
                >
                  {t('trash.restore')}
                </button>
                {confirm === a.id ? (
                  <>
                    <span>{t('trash.purge.confirm')}</span>
                    <button
                      type="button"
                      class="danger"
                      data-role="purge-confirm"
                      disabled={busy}
                      onClick={() => void run(() => emptyTrash([a.id]))}
                    >
                      {t('trash.purge.yes')}
                    </button>
                    <button type="button" onClick={() => setConfirm(null)}>
                      {t('accounts.cancel')}
                    </button>
                  </>
                ) : (
                  <button type="button" class="danger" data-role="purge" onClick={() => setConfirm(a.id)}>
                    {t('trash.purge')}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
