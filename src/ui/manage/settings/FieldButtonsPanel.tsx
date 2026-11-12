import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { KNOWN_FIELD_ORIGINS } from '../../../core/known-sites';
import { LockedError, NoVaultError } from '../../../store/errors';
import { readAutoFieldButtons, releaseUnusedOrigins, setAutoFieldButtonsEnabled } from '../../../store/field-buttons';
import { loadAccounts } from '../../../store/vault';
import { UnlockForm } from '../../shared/UnlockForm';
import { openTaskWindow, useScreenContext } from '../../shared/screen-context';
import type { PanelProps } from './panel-props';

export function FieldButtonsPanel({ t, onReady, ready }: Pick<PanelProps, 't'> & { onReady: () => void; ready: boolean }) {
  const { toolbarPopup } = useScreenContext();
  const [enabled, setEnabled] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sequence = useRef(0);
  const alive = useRef(true);
  const toggle = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    const mine = ++sequence.current;
    try {
      const [state, permission] = await Promise.all([
        readAutoFieldButtons(),
        chrome.permissions.contains({ origins: KNOWN_FIELD_ORIGINS }),
      ]);
      if (!alive.current || mine !== sequence.current) return;
      setEnabled(state.enabled);
      setAllowed(permission);
      setLoaded(true);
    } catch {
      if (alive.current && mine === sequence.current) setError('common.loadError');
    } finally {
      if (alive.current && mine === sequence.current) onReady();
    }
  }, [onReady]);

  useEffect(() => {
    alive.current = true;
    void refresh();
    const onStorage = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && 'autoFieldButtons' in changes) void refresh();
    };
    const onPermission = () => { void refresh(); };
    chrome.storage.onChanged.addListener(onStorage);
    chrome.permissions.onAdded.addListener(onPermission);
    chrome.permissions.onRemoved.addListener(onPermission);
    return () => {
      alive.current = false;
      sequence.current++;
      chrome.storage.onChanged.removeListener(onStorage);
      // 현재 chrome 타입 선언에만 removeListener가 빠져 있다.
      type Event = { removeListener: (listener: () => void) => void };
      (chrome.permissions.onAdded as unknown as Event).removeListener(onPermission);
      (chrome.permissions.onRemoved as unknown as Event).removeListener(onPermission);
    };
  }, [refresh]);

  useEffect(() => {
    if (!ready || new URLSearchParams(location.search).get('panel') !== 'field-buttons') return;
    toggle.current?.scrollIntoView({ block: 'center' });
    toggle.current?.focus();
  }, [ready]);

  const enable = () => {
    if (busy) return;
    setError(null);
    setLocked(false);
    if (toolbarPopup) {
      void openTaskWindow('settings', { panel: 'field-buttons' }).catch(() => setError('common.actionError'));
      return;
    }
    setBusy(true);
    // 사용자 클릭이 살아 있을 때 권한 요청을 먼저 시작한다.
    void chrome.permissions.request({ origins: KNOWN_FIELD_ORIGINS }).then(async (granted) => {
      if (!granted) {
        setError('settings.fieldButtons.denied');
        return;
      }
      const accounts = await loadAccounts().catch((failure: unknown) => {
        if (failure instanceof NoVaultError) return [];
        throw failure;
      });
      await setAutoFieldButtonsEnabled(true, accounts);
    }).catch(async (failure) => {
      if (failure instanceof LockedError) setLocked(true);
      else setError('common.actionError');
      // 켜지 못한 첫 설정에서만 받은 권한은 남겨 두지 않는다.
      await releaseUnusedOrigins().catch(() => undefined);
    }).finally(() => {
      if (alive.current) {
        setBusy(false);
        void refresh();
      }
    });
  };

  const disable = async () => {
    setBusy(true);
    setError(null);
    setLocked(false);
    try { await setAutoFieldButtonsEnabled(false, []); }
    catch { setError('common.actionError'); }
    finally {
      if (alive.current) {
        setBusy(false);
        void refresh();
      }
    }
  };

  return (
    <section class="settings-field-buttons" data-role="settings-field-buttons">
      <h2>{t('settings.fieldButtons.title')}</h2>
      <p class="muted" data-role="settings-field-buttons-basic">{t('settings.fieldButtons.basicHint')}</p>
      <label class="check switch">
        <input
          ref={toggle}
          type="checkbox"
          data-role="settings-field-buttons-toggle"
          checked={enabled}
          disabled={!loaded || busy}
          onChange={(event) => {
            const checked = event.currentTarget.checked;
            event.currentTarget.checked = enabled;
            if (checked) enable();
            else void disable();
          }}
        />
        <span>{t('settings.fieldButtons.toggle')}</span>
      </label>
      <p class="muted indent">{t('settings.fieldButtons.desc')}</p>
      <p class="muted indent">{t('settings.fieldButtons.supported')}</p>
      {enabled && !allowed && (
        <div data-role="settings-field-buttons-permission">
          <p class="muted">{t('settings.fieldButtons.permission')}</p>
          <button type="button" disabled={busy} data-role="settings-field-buttons-allow" onClick={enable}>
            {t('settings.fieldButtons.allow')}
          </button>
        </div>
      )}
      {error && <p class="error" role="alert" data-role="settings-field-buttons-error">{t(error)}</p>}
      {!loaded && error && <button type="button" onClick={() => { setError(null); void refresh(); }}>{t('common.retry')}</button>}
      {locked && <>
        <p class="muted">{t('settings.fieldButtons.locked')}</p>
        <UnlockForm onUnlocked={() => setLocked(false)} />
      </>}
    </section>
  );
}
