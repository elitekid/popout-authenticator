import { useEffect, useRef, useState } from 'preact/hooks';
import { WrongSecretError } from '../../../core/crypto/errors';
import { supportsPasskeys } from '../../../core/browser';
import {
  disableCodeProtectionWithPassword,
  enableCodeProtection,
  onCodeProtectionChanged,
  readCodeProtection,
  requestCodeAccess,
} from '../../../store/code-access';
import type { useT } from '../../shared/use-t';

type T = ReturnType<typeof useT>;

export function CodeAccessPanel({
  t,
  credIds,
  onReady,
  onProtectionChanged,
  onSetup,
}: {
  t: T;
  credIds: string[];
  onReady: () => void;
  onProtectionChanged: (enabled: boolean) => void;
  onSetup: () => void;
}) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const alive = useRef(true);
  const sequence = useRef(0);

  useEffect(() => {
    alive.current = true;
    const apply = (value: boolean) => {
      if (!alive.current) return;
      setEnabled(value);
      onProtectionChanged(value);
      if (!value) setPassword('');
    };
    const mine = ++sequence.current;
    const off = onCodeProtectionChanged((value) => {
      sequence.current++;
      apply(value);
    });
    void readCodeProtection().then((value) => {
      if (sequence.current === mine) apply(value);
    }, () => {
      if (alive.current && sequence.current === mine) setError('common.loadError');
    }).finally(() => { if (alive.current) onReady(); });
    return () => {
      alive.current = false;
      sequence.current++;
      off();
    };
  }, [onReady, onProtectionChanged]);

  const change = async (next: boolean) => {
    if (!supportsPasskeys() || busy || enabled === null || (next && credIds.length === 0)) return;
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      if (next) await enableCodeProtection();
      else await requestCodeAccess('disable');
      const actual = await readCodeProtection();
      if (!alive.current) return;
      setEnabled(actual);
      onProtectionChanged(actual);
      if (actual === next) setDone(next ? 'lock.codeAccess.enabled' : 'lock.codeAccess.disabled');
    } catch {
      if (alive.current) setError('lock.codeAccess.error');
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  const retryLoad = async () => {
    const mine = ++sequence.current;
    setError(null);
    try {
      const value = await readCodeProtection();
      if (!alive.current || sequence.current !== mine) return;
      setEnabled(value);
      onProtectionChanged(value);
    } catch {
      if (alive.current && sequence.current === mine) setError('common.loadError');
    }
  };

  const recover = async (event: Event) => {
    event.preventDefault();
    if (busy || !enabled || password === '') return;
    const value = password;
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      await disableCodeProtectionWithPassword(value);
      if (alive.current) {
        setEnabled(false);
        onProtectionChanged(false);
        setDone('lock.codeAccess.disabled');
      }
    } catch (failure) {
      if (alive.current) setError(failure instanceof WrongSecretError ? 'lock.error.wrong' : 'lock.error.failed');
    } finally {
      if (alive.current) {
        setPassword('');
        setBusy(false);
      }
    }
  };

  return (
    <section data-role="code-access-panel">
      <h2>{t('lock.codeAccess.title')}</h2>
      {enabled !== null && <p class="muted" data-role="code-access-state">{t(enabled ? 'lock.codeAccess.onHint' : 'lock.codeAccess.offHint')}</p>}
      <label class="check switch">
        <input
          type="checkbox"
          data-role="code-access-toggle"
          checked={enabled === true}
          disabled={!supportsPasskeys() || busy || enabled === null || (!enabled && credIds.length === 0)}
          onChange={(event) => {
            const next = event.currentTarget.checked;
            event.currentTarget.checked = enabled === true;
            void change(next);
          }}
        />
        <span>{t('lock.codeAccess.toggle')}</span>
      </label>
      <p class="muted">{t(supportsPasskeys() ? 'lock.codeAccess.desc' : 'lock.passkey.browserUnsupported')}</p>
      {supportsPasskeys() && credIds.length === 0 && (
        <>
          <p class="muted" data-role="code-access-needs-passkey">{t('lock.codeAccess.needsPasskey')}</p>
          <button type="button" data-role="code-access-setup-open" disabled={busy || enabled === null} onClick={onSetup}>
            {t('lock.codeAccess.setup')}
          </button>
        </>
      )}
      {enabled && (
        <details open={!supportsPasskeys()} data-role="code-access-recovery" onToggle={(event) => { if (!event.currentTarget.open) setPassword(''); }}>
          <summary>{t('lock.codeAccess.recover')}</summary>
          <p class="muted">{t('lock.codeAccess.recoverDesc')}</p>
          <form onSubmit={(event) => void recover(event)}>
            <label>
              <span>{t('lock.reauth')}</span>
              <input
                type="password"
                class="field"
                data-role="code-access-recovery-password"
                autocomplete="current-password"
                value={password}
                disabled={busy}
                onInput={(event) => { setPassword(event.currentTarget.value); setError(null); setDone(null); }}
              />
            </label>
            <button type="submit" disabled={busy || password === ''} data-role="code-access-recovery-submit">
              {t('lock.codeAccess.recoverAction')}
            </button>
          </form>
        </details>
      )}
      {error && <p class="error" role="alert" data-role="code-access-error">{t(error)}</p>}
      {enabled === null && error && <button type="button" onClick={() => void retryLoad()}>{t('common.retry')}</button>}
      {done && <p role="status" data-role="code-access-done">{t(done)}</p>}
    </section>
  );
}
