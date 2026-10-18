import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import type { Settings } from '../../../core/types';
import { readPolicy, type Policy } from '../../../store/policy';
import { loadSettings, onSettingsChanged, saveSettings } from '../../../store/settings';
import { useT } from '../../shared/use-t';
import { currentLang } from '../../../i18n';
import { STORE_REVIEW_URL, siteUrl } from '../../popup/logic';
import { AdvisorPanel } from './AdvisorPanel';
import { ClockPanel } from './ClockPanel';
import { DisplayPanel } from './DisplayPanel';
import { FieldButtonsPanel } from './FieldButtonsPanel';
import { PrivacyPanel } from './PrivacyPanel';
import { SyncPanel } from './SyncPanel';

const DEFAULT_FEEDBACK_URL = 'https://github.com/elitekid/popout-authenticator/issues';

export function SettingsSection() {
  const t = useT();
  // null: 아직 설정을 읽지 못함
  const [settings, setSettings] = useState<Settings | null>(null);
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const saveSeq = useRef(0);
  const pending = useRef(0);
  const [readyPanels, setReadyPanels] = useState(0);
  const syncReady = useCallback(() => setReadyPanels((value) => value | 1), []);
  const clockReady = useCallback(() => setReadyPanels((value) => value | 2), []);
  const advisorReady = useCallback(() => setReadyPanels((value) => value | 4), []);
  const fieldButtonsReady = useCallback(() => setReadyPanels((value) => value | 8), []);

  useEffect(() => {
    let alive = true;
    setLoadFailed(false);
    const off = onSettingsChanged((s) => {
      if (alive && pending.current === 0) setSettings(s);
    });
    void Promise.all([loadSettings(), readPolicy()]).then(([s, p]) => {
      if (!alive) return;
      setPolicy(p);
      setSettings((prev) => prev ?? s);
    }, () => alive && setLoadFailed(true));
    return () => {
      alive = false;
      off();
    };
  }, [retry]);

  const save = (patch: Partial<Settings>) => {
    if (settings === null) return Promise.resolve();
    const previous = settings;
    const mine = ++saveSeq.current;
    pending.current++;
    setSaveFailed(false);
    setSettings((prev) => prev && ({ ...prev, ...patch }));
    return saveSettings(patch).then((s) => {
      if (mine === saveSeq.current) setSettings(s);
    }, async () => {
      const stored = await loadSettings().catch(() => previous);
      if (mine === saveSeq.current) {
        setSettings(stored);
        setSaveFailed(true);
      }
    }).finally(() => { pending.current--; });
  };

  useEffect(() => {
    if (readyPanels !== 15 || new URLSearchParams(location.search).get('panel') !== 'privacy') return;
    const toggle = document.querySelector<HTMLInputElement>('[data-role="settings-clipboard-clear"]');
    toggle?.scrollIntoView({ block: 'center' });
    toggle?.focus();
  }, [readyPanels]);

  if (settings === null || policy === null) return (
    <div class="screen-loading" role={loadFailed ? 'alert' : 'status'}>
      <p>{t(loadFailed ? 'common.loadError' : 'popup.loading')}</p>
      {loadFailed && <button type="button" onClick={() => setRetry((n) => n + 1)}>{t('common.retry')}</button>}
    </div>
  );

  const feedbackUrl = policy.feedbackURL ?? DEFAULT_FEEDBACK_URL;
  const lang = currentLang(settings.language);

  return (
    <div class="settings" aria-busy={readyPanels !== 15}>
      {readyPanels !== 15 && <div class="screen-loading" role="status">{t('popup.loading')}</div>}
      <div class="settings-panels" hidden={readyPanels !== 15}>
        {saveFailed && <p class="error" role="alert" data-role="settings-save-error">{t('add.error.save')}</p>}
        <DisplayPanel t={t} settings={settings} policy={policy} save={save} />
        <SyncPanel t={t} settings={settings} policy={policy} save={save} onReady={syncReady} />
        <PrivacyPanel t={t} settings={settings} policy={policy} save={save} />
        <FieldButtonsPanel t={t} onReady={fieldButtonsReady} ready={readyPanels === 15} />
        <ClockPanel t={t} enabled={settings.clockCheck} save={save} onReady={clockReady} />
        <AdvisorPanel t={t} onReady={advisorReady} />
        <p class="settings-about muted" data-role="settings-about">
          <span data-role="settings-version">{t('settings.about.version', { version: chrome.runtime.getManifest().version })}</span>{' '}
          <a href={siteUrl(lang, 'guides')} target="_blank" rel="noopener" data-role="settings-help">
            {t('settings.about.help')}
          </a>{' '}
          <a href={siteUrl(lang, 'home')} target="_blank" rel="noopener" data-role="settings-site">
            {t('settings.about.site')}
          </a>{' '}
          <a href={feedbackUrl} target="_blank" rel="noopener" data-role="settings-feedback">
            {t('settings.about.feedback')}
          </a>{' '}
          {STORE_REVIEW_URL && <a href={STORE_REVIEW_URL} target="_blank" rel="noopener" data-role="settings-review">
            {t('settings.about.review')}
          </a>}
        </p>
      </div>
    </div>
  );
}
