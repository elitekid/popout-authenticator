import { useEffect, useRef, useState } from 'preact/hooks';
import type { BackupComparison } from '../../../core/backup-compare';
import type { CompareRequest, CompareResponse } from '../../../core/backup-compare-worker';
import { loadAccounts, onVaultChanged } from '../../../store/vault';
import { openTaskWindow, useScreenContext } from '../../shared/screen-context';
import type { useT } from '../../shared/use-t';

type T = ReturnType<typeof useT>;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const PAGE_SIZE = 50;

export function ComparePanel({ t }: { t: T }) {
  const { toolbarPopup } = useScreenContext();
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const [result, setResult] = useState<BackupComparison | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const sequence = useRef(0);
  const running = useRef(false);
  const mounted = useRef(true);
  const worker = useRef<Worker | null>(null);
  const root = useRef<HTMLElement>(null);

  const clear = () => {
    sequence.current++;
    worker.current?.terminate();
    worker.current = null;
    setCancelled(running.current);
    running.current = false;
    setBusy(false);
    setPending(null);
    setPassword('');
    setResult(null);
    setError(null);
    setLimit(PAGE_SIZE);
  };

  useEffect(() => {
    mounted.current = true;
    const off = onVaultChanged(clear);
    const onSession = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'session' && 'vaultKey' in changes && changes.vaultKey.newValue === undefined) clear();
    };
    chrome.storage.onChanged.addListener(onSession);
    if (new URLSearchParams(location.search).get('panel') === 'compare') {
      root.current?.scrollIntoView({ block: 'start' });
    }
    return () => {
      mounted.current = false;
      sequence.current++;
      worker.current?.terminate();
      worker.current = null;
      off();
      chrome.storage.onChanged.removeListener(onSession);
    };
  }, []);

  const compare = async (read: () => Promise<string>, pw?: string) => {
    if (running.current) return;
    running.current = true;
    const mine = ++sequence.current;
    setBusy(true);
    setCancelled(false);
    setPending(null);
    setPassword('');
    setResult(null);
    setError(null);
    setLimit(PAGE_SIZE);
    const finish = () => {
      if (mine !== sequence.current) return;
      worker.current?.terminate();
      worker.current = null;
      running.current = false;
      if (mounted.current) setBusy(false);
    };
    try {
      const text = await read();
      if (mine !== sequence.current) return;
      const current = await loadAccounts();
      if (mine !== sequence.current) return;
      const work = new Worker(new URL('../../../core/backup-compare-worker.ts', import.meta.url), { type: 'module' });
      worker.current = work;
      work.onmessage = ({ data }: MessageEvent<CompareResponse>) => {
        if (mine !== sequence.current) return;
        if (data.kind === 'result') setResult(data.result);
        else if (data.kind === 'password' || data.kind === 'wrong') {
          setPending(text);
          if (data.kind === 'wrong') setError('backup.compare.error');
        } else setError('backup.compare.error');
        finish();
      };
      work.onerror = (event) => {
        event.preventDefault();
        if (mine !== sequence.current) return;
        setError('backup.compare.error');
        finish();
      };
      const request: CompareRequest = { text, password: pw, current };
      try {
        work.postMessage(request);
      } finally {
        // Worker에 복제한 뒤 페이지 쪽에서 새로 읽은 키는 바로 비운다.
        current.forEach((account) => account.secret.fill(0));
      }
    } catch {
      if (mine !== sequence.current) return;
      setError('backup.compare.error');
      finish();
    }
  };

  const onFile = (input: HTMLInputElement) => {
    const file = input.files?.[0];
    input.value = '';
    if (!file || running.current) return;
    clear();
    if (file.size > MAX_FILE_BYTES) {
      setError('backup.compare.tooLarge');
      return;
    }
    void compare(() => file.text());
  };

  const totalRows = result ? result.rows.length + result.backupOnly.length : 0;
  const visibleCurrent = result?.rows.slice(0, limit) ?? [];
  const visibleBackup = result?.backupOnly.slice(0, Math.max(0, limit - (result?.rows.length ?? 0))) ?? [];

  return (
    <section class="backup-compare" data-role="backup-compare" ref={root}>
      <h2>{t('backup.compare.title')}</h2>
      <p class="muted">{t('backup.compare.description')}</p>
      {toolbarPopup ? (
        <button type="button" data-role="compare-window" onClick={() => {
          void openTaskWindow('backup', { panel: 'compare' }).catch(() => setError('backup.compare.error'));
        }}>{t('backup.compare.open')}</button>
      ) : (
        <>
          <label>
            <span>{t('backup.compare.file')}</span>
            <input type="file" accept=".json,.txt,application/json,text/plain" data-role="compare-file"
              disabled={busy} onChange={(e) => onFile(e.currentTarget)} />
          </label>
          {pending !== null && (
            <form class="backup-ask" data-role="compare-ask" onSubmit={(e) => {
              e.preventDefault();
              const text = pending;
              if (!busy && password !== '' && text !== null) void compare(() => Promise.resolve(text), password);
            }}>
              <label>
                <span>{t('backup.compare.password')}</span>
                <input type="password" class="field" autoComplete="off" data-role="compare-password" value={password}
                  disabled={busy} onInput={(e) => setPassword(e.currentTarget.value)} />
              </label>
              <button type="submit" class="primary" data-role="compare-submit" disabled={busy || password === ''}>
                {t('backup.compare.run')}
              </button>
            </form>
          )}
          {(pending !== null || busy || result !== null) && (
            <button type="button" data-role="compare-cancel" onClick={clear}>
              {t('backup.cancel')}
            </button>
          )}
          {(busy || cancelled) && <p class="muted" role="status">{t(cancelled ? 'backup.compare.cancelled' : 'backup.compare.working')}</p>}
          {result && (
            <div data-role="compare-results">
              <p>{t('backup.compare.summary', { total: result.rows.length })}</p>
              <div class="compare-summary">
                {(['same', 'missing', 'changed', 'uncertain'] as const).map((status) => (
                  <span data-status={status}>{t(`backup.compare.${status}`)} <b>{result.counts[status]}</b></span>
                ))}
                <span>{t('backup.compare.backupOnly')} <b>{result.backupOnly.length}</b></span>
              </div>
              {result.failedCount > 0 && <p class="muted">{t('backup.compare.failed', { n: result.failedCount })}</p>}
              {totalRows === 0 && <p class="muted">{t('backup.compare.none')}</p>}
              <ul class="compare-list">
                {visibleCurrent.map((a, i) => (
                  <li key={`current-${i}`} data-compare-status={a.status}>
                    <div class="compare-account"><b>{a.issuer}</b><span>{a.label}</span></div>
                    <span class="compare-status">{t(`backup.compare.${a.status}`)}</span>
                    {a.reason && <p class="compare-detail">{t(`backup.compare.${a.reason}`)}</p>}
                    {a.fields.length > 0 && <p class="compare-detail">{t('backup.compare.fields', {
                      fields: a.fields.map((field) => t(`backup.compare.field.${field}`)).join(', '),
                    })}</p>}
                  </li>
                ))}
                {visibleBackup.map((a, i) => (
                  <li key={`backup-${i}`} data-compare-status="backupOnly">
                    <div class="compare-account"><b>{a.issuer}</b><span>{a.label}</span></div>
                    <span class="compare-status">{t('backup.compare.backupOnly')}</span>
                  </li>
                ))}
              </ul>
              {limit < totalRows && <button type="button" data-role="compare-more" onClick={() => setLimit((n) => n + PAGE_SIZE)}>
                {t('backup.compare.more')}
              </button>}
              <p class="muted">{t('backup.compare.disclaimer')}</p>
            </div>
          )}
        </>
      )}
      {error && <p class="error" role="alert">{t(error)}</p>}
    </section>
  );
}
