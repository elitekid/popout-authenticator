import { useEffect, useState } from 'preact/hooks';
import { WrongSecretError } from '../../../core/crypto/errors';
import { LockedError } from '../../../store/errors';
import { restoreSnapshot } from '../../../store/recover';
import { listSnapshots, type SnapshotInfo } from '../../../store/snapshots';
import type { useT } from '../../shared/use-t';

type T = ReturnType<typeof useT>;
type Mode = 'merge' | 'replace';
type Ask = { id: number; mode: Mode; wrong: boolean };

export function SnapshotPanel({ t }: { t: T }) {
  const [list, setList] = useState<SnapshotInfo[] | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [ask, setAsk] = useState<Ask | null>(null);
  const [password, setPassword] = useState('');
  const [added, setAdded] = useState<number | null>(null);
  const [failed, setFailed] = useState<'load' | 'restore' | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = () => listSnapshots().then(setList, () => setFailed('load'));
  useEffect(() => {
    void refresh();
  }, []);

  const run = async (id: number, mode: Mode, pw?: string) => {
    setBusy(true);
    setFailed(null);
    setAdded(null);
    setAsk(null);
    try {
      const out = await restoreSnapshot(id, mode, pw === undefined ? undefined : { password: pw });
      setAdded(out.added);
      setAsk(null);
      setConfirmId(null);
      await refresh();
    } catch (error) {
      // 다른 비밀번호로 잠긴 판이면 그 판의 비밀번호를 묻는다.
      if (error instanceof LockedError || error instanceof WrongSecretError) {
        setAsk({ id, mode, wrong: error instanceof WrongSecretError });
      } else {
        setFailed('restore');
      }
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: Event) => {
    e.preventDefault();
    if (!ask || password === '') return;
    const pw = password;
    setPassword('');
    void run(ask.id, ask.mode, pw);
  };

  // 취소하면 비밀번호 묻기도 함께 걷는다(취소한 판을 비밀번호 제출로 덮어쓰지 않게).
  const cancel = () => {
    setConfirmId(null);
    setAsk(null);
    setPassword('');
  };

  return (
    <section class="backup-snapshots" data-role="snapshots">
      <h2>{t('backup.snapshot.title')}</h2>
      {list === null && !failed && <p class="muted" role="status">{t('popup.loading')}</p>}
      {list && list.length === 0 && <p class="muted">{t('backup.snapshot.empty')}</p>}
      <ul class="backup-list">
        {(list ?? []).map((s) => (
          <li key={s.id} data-role="snapshot" data-id={s.id} data-count={s.count}>
            <span>
              {t('backup.snapshot.row', { time: new Date(s.takenAt).toLocaleString(), count: s.count })}
              {s.lock !== 'none' && ` · ${t('backup.snapshot.locked')}`}
            </span>
            {confirmId === s.id ? (
              <>
                <p>{t('backup.snapshot.confirm')}</p>
                <button
                  type="button"
                  class="danger"
                  data-role="snapshot-replace-confirm"
                  disabled={busy}
                  onClick={() => void run(s.id, 'replace')}
                >
                  {t('backup.snapshot.confirmYes')}
                </button>
                <button type="button" onClick={cancel}>
                  {t('backup.cancel')}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  data-role="snapshot-merge"
                  disabled={busy}
                  onClick={() => void run(s.id, 'merge')}
                >
                  {t('backup.snapshot.merge')}
                </button>
                <button
                  type="button"
                  data-role="snapshot-replace"
                  disabled={busy}
                  onClick={() => setConfirmId(s.id)}
                >
                  {t('backup.snapshot.replace')}
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
      {ask && (
        <form class="backup-ask" data-role="snapshot-ask" onSubmit={submit}>
          <label>
            <span>{t('backup.snapshot.password')}</span>
            <input
              type="password"
              class="field"
              data-role="snapshot-password"
              value={password}
              onInput={(e) => setPassword(e.currentTarget.value)}
            />
          </label>
          {ask.wrong && (
            <p class="error" role="alert">
              {t('backup.wrong')}
            </p>
          )}
          <button type="submit" class="primary" data-role="snapshot-password-submit" disabled={busy}>
            {t('backup.submit')}
          </button>
          <button type="button" onClick={cancel}>
            {t('backup.cancel')}
          </button>
        </form>
      )}
      {added !== null && (
        <p class="ok" data-role="restore-result" data-added={added}>
          {t('backup.snapshot.result', { added })}
        </p>
      )}
      {failed && (
        <p class="error" role="alert">
          {t(failed === 'load' ? 'common.loadError' : 'backup.snapshot.error')}
        </p>
      )}
    </section>
  );
}
