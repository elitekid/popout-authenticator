import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { qrMatrix } from '../../core/export';
import {
  SHARE_DURATIONS,
  SHARE_PAGE_URL,
  buildShareLink,
  createShareFragment,
  shareValidUntilMs,
} from '../../core/share';
import type { Account } from '../../core/types';
import { QrSvg } from '../shared/QrSvg';
import type { useT } from '../shared/use-t';

type T = ReturnType<typeof useT>;

const COPIED_MS = 2000;
const DEFAULT_SECONDS = 3600;

type Result = { url: string; until: number; withPassword: boolean };

function durationText(t: T, seconds: number): string {
  return seconds >= 3600 ? t('share.hour') : t('share.minutes', { n: Math.round(seconds / 60) });
}

// 코드 공유 창. 링크를 만들기까지 첫 화면, 만든 뒤 결과 화면.
export function ShareDialog(p: {
  account: Account;
  t: T;
  correction: number;
  onClose: () => void;
}) {
  const { account, t, correction, onClose } = p;
  const [name, setName] = useState(
    account.issuer !== '' ? `${account.issuer} ${account.label}` : account.label,
  );
  const [seconds, setSeconds] = useState<number>(DEFAULT_SECONDS);
  const [password, setPassword] = useState('');
  const [creating, setCreating] = useState(false);
  const [failed, setFailed] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [copied, setCopied] = useState(false);
  const aliveRef = useRef(true);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      clearTimeout(copiedTimer.current);
    };
  }, []);

  // QR 은 링크가 너무 길면 못 그린다. 그러면 QR 칸 없이 나머지만 보인다.
  const canQr = useMemo(() => {
    if (result === null) return false;
    try {
      qrMatrix(result.url);
      return true;
    } catch {
      return false;
    }
  }, [result]);

  const create = async (e: Event) => {
    e.preventDefault();
    if (creating) return;
    setCreating(true);
    setFailed(false);
    const copy = { ...account, issuer: '', label: name.trim() };
    const used = password !== '';
    try {
      const at = Date.now();
      const fragment = await createShareFragment(copy, at + correction, seconds, password || undefined);
      if (!aliveRef.current) return;
      setResult({
        url: buildShareLink(SHARE_PAGE_URL, fragment),
        // 받는 쪽 만료는 보정된 시계의 코드 칸 끝이다. 실제 시계로 되돌려 표시한다.
        until: shareValidUntilMs(at + correction, account.period, seconds) - correction,
        withPassword: used,
      });
      setPassword('');
    } catch {
      if (aliveRef.current) setFailed(true);
    } finally {
      if (aliveRef.current) setCreating(false);
    }
  };

  const copyLink = async () => {
    if (result === null) return;
    try {
      await navigator.clipboard.writeText(result.url);
    } catch {
      return;
    }
    if (!aliveRef.current) return;
    setCopied(true);
    clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(false), COPIED_MS);
  };

  return (
    <div class="ovl popup-qr popup-share" data-role="share-dialog">
      <div class="top">
        <h2>{t('share.title')}</h2>
        <button type="button" data-role="share-close" onClick={onClose}>
          {t('share.close')}
        </button>
      </div>
      {result === null ? (
        <form class="share-form" data-role="share-form" onSubmit={(e) => void create(e)}>
          <p>{t('share.intro', { duration: durationText(t, seconds) })}</p>
          <label class="share-field">
            <span>{t('share.name')}</span>
            <input
              type="text"
              class="field"
              data-role="share-name"
              autocomplete="off"
              value={name}
              onInput={(e) => setName(e.currentTarget.value)}
            />
          </label>
          <div class="share-field">
            <span id="share-duration-label">{t('share.duration')}</span>
            <div class="share-durations" role="radiogroup" aria-labelledby="share-duration-label">
              {SHARE_DURATIONS.map((sec) => (
                <button
                  type="button"
                  key={sec}
                  role="radio"
                  aria-checked={seconds === sec}
                  data-role="share-duration"
                  data-seconds={sec}
                  onClick={() => setSeconds(sec)}
                >
                  {durationText(t, sec)}
                </button>
              ))}
            </div>
          </div>
          <label class="share-field">
            <span>{t('share.password')}</span>
            <input
              type="password"
              class="field"
              data-role="share-password"
              autocomplete="new-password"
              value={password}
              onInput={(e) => setPassword(e.currentTarget.value)}
            />
          </label>
          <p class="muted">{t('share.passwordHint')}</p>
          {failed && (
            <p class="error" role="alert">
              {t('share.failed')}
            </p>
          )}
          <button type="submit" class="primary" data-role="share-create" disabled={creating}>
            {t(creating ? 'share.creating' : 'share.create')}
          </button>
        </form>
      ) : (
        <div class="share-result" data-role="share-result">
          {canQr && (
            <div class="share-qr">
              <QrSvg text={result.url} />
            </div>
          )}
          <p>{t('share.scan')}</p>
          <input
            type="text"
            class="field"
            data-role="share-link"
            readOnly
            value={result.url}
            onFocus={(e) => e.currentTarget.select()}
          />
          <button type="button" data-role="share-copy" onClick={() => void copyLink()}>
            {t(copied ? 'share.copied' : 'share.copy')}
          </button>
          <p>
            {t('share.validUntil', {
              time: new Date(result.until).toLocaleTimeString(undefined, {
                hour: '2-digit',
                minute: '2-digit',
              }),
            })}
          </p>
          {result.withPassword && <p>{t('share.passwordReminder')}</p>}
          <p class="muted">{t('share.caution')}</p>
          <button type="button" class="primary" data-role="share-done" onClick={onClose}>
            {t('share.done')}
          </button>
        </div>
      )}
    </div>
  );
}
