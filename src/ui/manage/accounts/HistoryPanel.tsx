import { useEffect, useRef, useState } from 'preact/hooks';
import { AccountHistoryError, createAccountHistory, type AccountHistorySession, type HistoryEntry, type HistoryPreview } from '../../../store/account-history';
import { useT } from '../../shared/use-t';

export function HistoryPanel({ accountId, onDone }: { accountId: string; onDone?: () => void }) {
  const t = useT();
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<HistoryPreview | null>(null);
  const [askId, setAskId] = useState<number | null>(null);
  const [password, setPassword] = useState('');
  const [done, setDone] = useState(false);
  const session = useRef<AccountHistorySession | null>(null);
  const abort = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  // 금고 알림에 의한 무효화와, 사용자가 새로 연 기록 화면을 구분한다.
  const generation = useRef(0);
  const working = useRef(false);
  const savedPassword = useRef('');
  const mounted = useRef(false);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const element = selected ? confirmRef.current : askId !== null ? passwordRef.current : null;
    element?.scrollIntoView({ block: 'nearest' });
    element?.focus({ preventScroll: true });
  }, [selected, askId]);

  const clear = () => {
    sequence.current++;
    abort.current?.abort();
    session.current?.dispose();
    session.current = null;
    savedPassword.current = '';
    working.current = false;
    setEntries([]);
    setSelected(null);
    setAskId(null);
    setPassword('');
    setHasMore(false);
    setBusy(false);
  };
  const errorKey = (e: unknown) => e instanceof AccountHistoryError ? `history.${e.reason}` : 'history.error';
  const reload = async () => {
    generation.current++;
    clear();
    setDone(false);
    setError(null);
    const mine = sequence.current;
    const controller = new AbortController();
    abort.current = controller;
    working.current = true;
    setBusy(true);
    try {
      const opened = await createAccountHistory(accountId, { signal: controller.signal });
      if (!mounted.current || mine !== sequence.current) { opened.dispose(); return; }
      session.current = opened;
      const page = await opened.readPage();
      if (!mounted.current || mine !== sequence.current) return;
      setEntries(page.entries);
      setHasMore(page.hasMore);
    } catch (e) {
      if (mounted.current && mine === sequence.current) setError(errorKey(e));
    } finally {
      if (mounted.current && mine === sequence.current) { working.current = false; setBusy(false); }
    }
  };

  useEffect(() => {
    mounted.current = true;
    void reload();
    const changed = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      const locked = area === 'session' && 'vaultKey' in changes && !changes.vaultKey.newValue;
      if (!locked && !(area === 'local' && 'vault' in changes)) return;
      // 자신의 쓰기 알림에서도 이전 표시·비밀번호를 버린다. 성공 표시는 runRestore가 맡는다.
      clear();
      // 자기 저장 알림인지 외부 변경인지 아직 알 수 없다. 성공이 확인될 때만 이 안내를 지운다.
      setError(locked ? 'history.locked' : 'history.stale');
    };
    chrome.storage.onChanged.addListener(changed);
    return () => {
      mounted.current = false;
      generation.current++;
      sequence.current++;
      abort.current?.abort();
      session.current?.dispose();
      savedPassword.current = '';
      chrome.storage.onChanged.removeListener(changed);
    };
  }, [accountId]);

  const more = async () => {
    if (working.current || !session.current) return;
    working.current = true;
    setBusy(true);
    setError(null);
    const mine = sequence.current;
    try {
      const page = await session.current.readPage();
      if (mine !== sequence.current || !mounted.current) return;
      setEntries((old) => [...old, ...page.entries]);
      setHasMore(page.hasMore);
    } catch (e) {
      if (mine === sequence.current && mounted.current) setError(errorKey(e));
    } finally {
      if (mine === sequence.current && mounted.current) { working.current = false; setBusy(false); }
    }
  };
  const preview = async (id: number, pw?: string) => {
    if (working.current || !session.current) return;
    working.current = true;
    setBusy(true);
    setError(null);
    setSelected(null);
    savedPassword.current = '';
    const mine = sequence.current;
    try {
      const result = await session.current.preview(id, pw);
      if (mine !== sequence.current || !mounted.current) return;
      savedPassword.current = pw ?? '';
      setSelected(result);
      setAskId(null);
      setPassword('');
    } catch (e) {
      if (mine !== sequence.current || !mounted.current) return;
      if (e instanceof AccountHistoryError && (e.reason === 'passwordNeeded' || e.reason === 'wrongPassword')) setAskId(id);
      setError(errorKey(e));
    } finally {
      if (mine === sequence.current && mounted.current) { working.current = false; setBusy(false); }
    }
  };
  const runRestore = async () => {
    if (working.current || !session.current || !selected) return;
    working.current = true;
    setBusy(true);
    setError(null);
    const mine = sequence.current;
    const screen = generation.current;
    try {
      await session.current.restore(selected.id, savedPassword.current || undefined);
      if (mounted.current && screen === generation.current) { clear(); setError(null); setDone(true); onDone?.(); }
    } catch (e) {
      if (mounted.current && screen === generation.current) setError((previous) => previous === 'history.locked'
        ? previous : mine !== sequence.current ? 'history.stale' : errorKey(e));
    } finally {
      if (mounted.current && screen === generation.current) {
        savedPassword.current = '';
        working.current = false;
        setBusy(false);
      }
    }
  };
  const cancel = () => {
    savedPassword.current = '';
    setSelected(null);
    setAskId(null);
    setPassword('');
    setError(null);
  };
  const showValue = (value: string | boolean | undefined) => typeof value === 'boolean' ? t(value ? 'history.yes' : 'history.no') : value || t('history.none');

  return (
    <section class="account-history" data-role="account-history">
      <h2>{t('history.title')}</h2>
      <p class="muted">{t('history.intro')}</p>
      {busy && <p class="muted" role="status">{t('popup.loading')}</p>}
      {error && <p class="error" role="alert">{t(error)}</p>}
      {done && <p class="ok" role="status">{t('history.done')}</p>}
      {!busy && !error && !done && !hasMore && entries.length === 0 && <p class="muted">{t('history.empty')}</p>}
      <ul class="history-list">
        {entries.map((entry) => (
          <li class="history-entry" key={entry.id} data-role="history-entry" data-id={entry.id}>
            <time dateTime={new Date(entry.takenAt).toISOString()}>{new Date(entry.takenAt).toLocaleString()}</time>
            {entry.status === 'changed' ? (
              <p>{entry.fields.map((field) => t(`history.field.${field}`)).join(' · ')}</p>
            ) : <p class="muted">{t(`history.${entry.status}`)}</p>}
            {(entry.status === 'changed' || entry.status === 'passwordNeeded') && (
              <button type="button" data-role="history-preview" disabled={busy} onClick={() => void preview(entry.id)}>{t('history.preview')}</button>
            )}
          </li>
        ))}
      </ul>
      {hasMore && <button type="button" data-role="history-more" disabled={busy} onClick={() => void more()}>{t('history.more')}</button>}
      {askId !== null && <form class="history-password" onSubmit={(e) => { e.preventDefault(); const pw = password; setPassword(''); void preview(askId, pw); }}>
        <label>{t('history.password')}<input ref={passwordRef} class="field" type="password" autoComplete="off" data-role="history-password" value={password} disabled={busy} onInput={(e) => setPassword(e.currentTarget.value)} /></label>
        <div class="history-actions">
          <button type="submit" class="primary" data-role="history-unlock" disabled={busy || !password}>{t('history.unlock')}</button>
          <button type="button" disabled={busy} onClick={cancel}>{t('backup.cancel')}</button>
        </div>
      </form>}
      {selected && <section ref={confirmRef} tabIndex={-1} class="history-confirm" data-role="history-confirm">
        <p>{t('history.confirm')}</p>
        <dl class="history-fields">
          {selected.changes.map((change) => <div key={change.field}>
            <dt>{t(`history.field.${change.field}`)}</dt>
            <dd>{change.field === 'secret' ? t('history.keyChanged') : <>{t('history.before')}: {showValue(change.before)}<br />{t('history.after')}: {showValue(change.after)}</>}</dd>
          </div>)}
        </dl>
        {selected.hotp && <p class="muted">{t('history.hotp')}</p>}
        {selected.changes.some((c) => c.field === 'secret') && <p>{t('history.keyWarning')}</p>}
        {selected.changes.length === 0 && <p class="muted">{t('history.noChanges')}</p>}
        <div class="history-actions">
          <button type="button" class="primary" data-role="history-restore" disabled={busy || selected.changes.length === 0} onClick={() => void runRestore()}>{t('history.restore')}</button>
          <button type="button" disabled={busy} onClick={cancel}>{t('backup.cancel')}</button>
        </div>
      </section>}
      {!busy && (error || done) && <button type="button" data-role="history-reload" onClick={() => void reload()}>{t('history.refresh')}</button>}
    </section>
  );
}
