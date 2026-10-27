import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import type { Settings } from '../../../core/types';
import { readPolicy, type Policy } from '../../../store/policy';
import { loadSettings, onSettingsChanged, saveSettings } from '../../../store/settings';
import { useT } from '../../shared/use-t';
import { currentLang } from '../../../i18n';
import { BROWSER_TARGET } from '../../../core/browser';
import { siteUrl } from '../../popup/logic';

import { InfoCard, RateCard } from './AboutCards';
import { AdvisorPanel } from './AdvisorPanel';
import { ClockPanel } from './ClockPanel';
import { DisplayPanel } from './DisplayPanel';
import { FieldButtonsPanel } from './FieldButtonsPanel';
import { PrivacyPanel } from './PrivacyPanel';
import { SyncPanel } from './SyncPanel';

const DEFAULT_FEEDBACK_URL = 'https://github.com/elitekid/popout-authenticator/issues';

const SHORTCUT_COMMANDS = ['copy-pinned-1', 'copy-pinned-2', 'copy-pinned-3'];

// 전역 단축키 안내: 지금 실제로 붙은 키를 보여 주고 브라우저 단축키 화면을 연다.
function ShortcutsBlock({ t }: { t: ReturnType<typeof useT> }) {
  const [rows, setRows] = useState<chrome.commands.Command[]>([]);

  useEffect(() => {
    let alive = true;
    // 읽기 실패나 commands API 없음은 줄 목록만 생략
    const read = () => {
      try {
        void chrome.commands.getAll().then((all) => {
          if (alive) setRows(SHORTCUT_COMMANDS.flatMap((name) => all.filter((c) => c.name === name)));
        }, () => undefined);
      } catch { /* 줄 목록 생략 */ }
    };
    // 단축키 화면(새 탭)에서 바꾸고 돌아오면 다시 읽음
    const onVisible = () => { if (document.visibilityState === 'visible') read(); };
    read();
    window.addEventListener('focus', read);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      window.removeEventListener('focus', read);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const open = () => {
    const url = BROWSER_TARGET === 'edge' ? 'edge://extensions/shortcuts' : 'chrome://extensions/shortcuts';
    try {
      void chrome.tabs.create({ url }).catch(() => undefined);
    } catch { /* 열기 실패는 무시 */ }
  };

  return (
    <div data-role="settings-shortcuts">
      <p class="muted" data-role="settings-shortcuts-hint">{t('settings.shortcuts.hint')}</p>
      {rows.length > 0 && (
        <ul class="muted">
          {rows.map((c) => (
            <li key={c.name} data-role="settings-shortcut-row">
              {c.description}: {c.shortcut || t('settings.shortcuts.unset')}
            </li>
          ))}
        </ul>
      )}
      <button type="button" class="link" data-role="settings-shortcuts-open" onClick={open}>
        {t('settings.shortcuts.open')}
      </button>
    </div>
  );
}

export function SettingsSection() {
  const t = useT();
  // null: 아직 설정을 읽지 못함
  const [settings, setSettings] = useState<Settings | null>(null);
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  // 읽기 전에는 true(정보 카드 위)로 둬서 맨 위 카드가 깜빡이지 않게 함
  const [reviewDismissed, setReviewDismissed] = useState(true);
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

  useEffect(() => {
    let alive = true;
    // 읽기 실패는 평가 전으로 보지 않고 아래 자리 유지
    void chrome.storage.local.get('reviewDismissed').then((r) => {
      if (alive) setReviewDismissed(r.reviewDismissed === true);
    }, () => undefined);
    const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && changes.reviewDismissed) setReviewDismissed(changes.reviewDismissed.newValue === true);
    };
    chrome.storage.onChanged.addListener(onChanged);
    return () => {
      alive = false;
      chrome.storage.onChanged.removeListener(onChanged);
    };
  }, []);

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
  const rateCard = <RateCard t={t} />;

  return (
    <div class="settings" aria-busy={readyPanels !== 15}>
      {readyPanels !== 15 && <div class="screen-loading" role="status">{t('popup.loading')}</div>}
      <div class="settings-panels" hidden={readyPanels !== 15}>
        {saveFailed && <p class="error" role="alert" data-role="settings-save-error">{t('add.error.save')}</p>}
        {!reviewDismissed && rateCard}
        <DisplayPanel t={t} settings={settings} policy={policy} save={save} />
        <SyncPanel t={t} settings={settings} policy={policy} save={save} onReady={syncReady} />
        <PrivacyPanel t={t} settings={settings} policy={policy} save={save} />
        <FieldButtonsPanel t={t} onReady={fieldButtonsReady} ready={readyPanels === 15} />
        <ClockPanel t={t} enabled={settings.clockCheck} save={save} onReady={clockReady} />
        <AdvisorPanel t={t} onReady={advisorReady} />
        {(BROWSER_TARGET === 'chrome' || BROWSER_TARGET === 'edge') && <ShortcutsBlock t={t} />}
        {reviewDismissed && rateCard}
        <InfoCard t={t} helpUrl={siteUrl(lang, 'guides')} siteHref={siteUrl(lang, 'home')} feedbackUrl={feedbackUrl} />
      </div>
    </div>
  );
}
