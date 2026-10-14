import { useEffect, useState } from 'preact/hooks';
import { clearFieldButtons } from '../../../store/field-buttons';
import { readPolicy, type Policy } from '../../../store/policy';
import { openTaskWindow, useScreenContext } from '../../shared/screen-context';
import { buildRawCopy } from '../../../store/recover';
import { clearSnapshots } from '../../../store/snapshots';
import { withVaultWriteLock } from '../../../store/vault';
import { useT } from '../../shared/use-t';
import { downloadText, today } from '../backup/download';

export function ResetSection() {
  const t = useT();
  const { toolbarPopup } = useScreenContext();
  const [policy, setPolicy] = useState<Policy | null>(null);
  useEffect(() => {
    let alive = true;
    void readPolicy().then((next) => alive && setPolicy(next));
    return () => { alive = false; };
  }, []);
  const [saved, setSaved] = useState(false);
  const [ack, setAck] = useState(false);
  const [withSync, setWithSync] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<'backup' | 'reset' | null>(null);

  // 백업 내용은 받는 즉시 버린다. 상태에는 받았는지만 남긴다.
  const saveBackup = async () => {
    setError(null);
    setBusy(true);
    try {
      const latest = await readPolicy();
      setPolicy(latest);
      if (latest.disableExport) return;
      if (toolbarPopup) {
        await openTaskWindow('reset');
        return;
      }
      downloadText(`popout-authenticator-before-reset-${today()}.json`, await buildRawCopy(), 'application/json');
      setSaved(true);
    } catch {
      setSaved(false);
      setError('backup');
    } finally {
      setBusy(false);
    }
  };

  const run = async () => {
    if (!saved || !ack || busy) return;
    setBusy(true);
    setError(null);
    try {
      // 금고 쓰기 잠금 안에서 지운다. 다른 창의 저장·동기화가 지운 뒤 옛 금고를 다시 쓰지 못하게 줄을 세운다.
      await withVaultWriteLock(async () => {
        if (withSync) await chrome.storage.sync.clear();
        await chrome.storage.local.clear();
        await chrome.storage.session.clear();
        await clearSnapshots();
      });
      // 데이터를 지운 뒤 페이지 스크립트 등록과 사이트 권한도 거둔다(실패해도 초기화는 끝난 것이다).
      await clearFieldButtons().catch(() => undefined);
      setDone(true);
    } catch {
      setError('reset');
    } finally {
      setBusy(false);
    }
  };

  if (policy === null) return <div class="screen-loading" role="status">{t('popup.loading')}</div>;
  if (policy.disableExport) return <p class="muted" data-role="export-blocked">{t('backup.policy.noExport')}</p>;

  if (done) {
    return (
      <div class="reset" data-section="reset">
        <p class="ok" data-role="reset-done">
          {t('reset.done')}
        </p>
        <p class="muted">{t('reset.done.note')}</p>
      </div>
    );
  }

  return (
    <div class="reset" data-section="reset">
      <section data-role="reset-backup">
        <p class="muted">{t('reset.backup.desc')}</p>
        <button type="button" data-role="reset-backup-save" disabled={busy} onClick={() => void saveBackup()}>
          {t('reset.backup.save')}
        </button>
        {saved && (
          <p class="ok" data-role="reset-backup-saved">
            {t('reset.backup.saved')}
          </p>
        )}
        {error === 'backup' && (
          <p class="error" role="alert" data-role="reset-backup-failed">
            {t('reset.backup.failed')}
          </p>
        )}
      </section>
      {saved && (
        <section data-role="reset-confirm">
          <p class="error">{t('reset.warn')}</p>
          <label class="check">
            <input
              type="checkbox"
              data-role="reset-sync"
              checked={withSync}
              onChange={(e) => setWithSync(e.currentTarget.checked)}
            />
            <span>{t('reset.sync')}</span>
          </label>
          <label class="check">
            <input
              type="checkbox"
              data-role="reset-ack"
              checked={ack}
              onChange={(e) => setAck(e.currentTarget.checked)}
            />
            <span>{t('reset.ack')}</span>
          </label>
          <button
            type="button"
            class="danger"
            data-role="reset-run"
            disabled={!saved || !ack || busy}
            onClick={() => void run()}
          >
            {t('reset.run')}
          </button>
          {error === 'reset' && (
            <p class="error" role="alert" data-role="reset-failed">
              {t('reset.failed')}
            </p>
          )}
        </section>
      )}
    </div>
  );
}
