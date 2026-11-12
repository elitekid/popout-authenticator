import { useEffect, useState } from 'preact/hooks';
import { saveSettings } from '../../../store/settings';
import { useT } from '../../shared/use-t';

export function PermissionsSection() {
  const t = useT();
  const manifest = chrome.runtime.getManifest();
  const required = manifest.permissions ?? [];
  const optional = manifest.optional_permissions ?? [];
  // 선택 권한별 허용 여부. 아직 모르면 비어 있다.
  const [granted, setGranted] = useState<Record<string, boolean>>({});
  const [loadFailed, setLoadFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [failed, setFailed] = useState(false);
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    let seq = 0;
    const reread = () => {
      const mine = ++seq;
      setLoadFailed(false);
      const names = (chrome.runtime.getManifest().optional_permissions ?? []) as string[];
      void Promise.all(
        names.map(async (name) => [name, await chrome.permissions.contains({ permissions: [name] } as chrome.permissions.Permissions)] as const),
      ).then((pairs) => {
        if (alive && mine === seq) setGranted(Object.fromEntries(pairs));
      }, () => {
        if (alive && mine === seq) {
          setGranted({});
          setLoadFailed(true);
        }
      });
    };
    reread();
    chrome.permissions.onAdded.addListener(reread);
    chrome.permissions.onRemoved.addListener(reread);
    // @types/chrome 에 removeListener 가 빠져 있다(실제 API 에는 있음).
    type Ev = { removeListener: (fn: () => void) => void };
    return () => {
      alive = false;
      (chrome.permissions.onAdded as unknown as Ev).removeListener(reread);
      (chrome.permissions.onRemoved as unknown as Ev).removeListener(reread);
    };
  }, [retry]);

  const revoke = async (name: string) => {
    setFailed(false);
    setPending(name);
    try {
      const removed = await chrome.permissions.remove({ permissions: [name] } as chrome.permissions.Permissions);
      if (!removed) setFailed(true);
      if (removed && name === 'clipboardRead') await saveSettings({ clipboardClearAfterCopy: false });
    } catch {
      setFailed(true);
    } finally { setPending(null); }
  };

  return (
    <div class="permissions">
      <ul class="permissions-list">
        {required.map((name) => (
          <li key={name} data-role="perm-item" data-perm={name}>
            <span class="permission-description">{t(`settings.perm.${name}`)}</span>
            <code dir="ltr">{name}</code>
          </li>
        ))}
        {optional.map((name) => (
          <li key={name} data-role="perm-item" data-perm={name} data-optional="true">
            <span class="permission-description">{t(`settings.perm.${name}`)}</span>
            <code dir="ltr">{name}</code>
            <div class="permission-actions">
              <span class="muted" data-role="perm-state" aria-live="polite">
                {loadFailed ? t('common.loadError') : granted[name] === undefined ? t('popup.loading') : granted[name] ? t('settings.perm.granted') : t('settings.perm.notGranted')}
              </span>
              {granted[name] === true && (
                <button type="button" data-role="perm-remove" data-perm={name} disabled={pending !== null} onClick={() => void revoke(name)}>
                  {t('settings.perm.remove')}
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {loadFailed && <button type="button" onClick={() => setRetry((value) => value + 1)}>{t('common.retry')}</button>}
      {failed && <p class="error" role="alert">{t('common.actionError')}</p>}
      <p class="muted" data-role="perm-none">
        {t('settings.perm.none')}
      </p>
    </div>
  );
}
