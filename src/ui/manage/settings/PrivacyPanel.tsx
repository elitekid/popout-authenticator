import { useState } from 'preact/hooks';
import { loadSettings } from '../../../store/settings';
import type { PanelProps } from './panel-props';
import { openTaskWindow, useScreenContext } from '../../shared/screen-context';
import { supportsClipboardClear } from '../../../core/browser';
import { normalizeClipboardSeconds } from '../../../core/types';

const USAGE_KEY = 'siteUsage';

export function PrivacyPanel({ t, settings, save }: PanelProps) {
  const [denied, setDenied] = useState(false);
  const [actionFailed, setActionFailed] = useState(false);
  const { toolbarPopup } = useScreenContext();

  // 권한 요청은 사용자 동작(클릭 처리기) 안에서 바로 불러야 한다.
  const toggleClipboard = (checked: boolean) => {
    if (!supportsClipboardClear()) return;
    if (!checked) {
      setDenied(false);
      save({ clipboardClearAfterCopy: false });
      return;
    }
    if (toolbarPopup) {
      void openTaskWindow('settings', { panel: 'privacy' }).catch(() => setDenied(true));
      return;
    }
    void chrome.permissions.request({ permissions: ['clipboardRead'] }).then(
      (granted) => {
        setDenied(!granted);
        if (granted) save({ clipboardClearAfterCopy: true });
      },
      () => setDenied(true),
    );
  };

  const toggleSuggestions = async (checked: boolean) => {
    setActionFailed(false);
    try {
      await save({ suggestionsEnabled: checked });
      if (checked || (await loadSettings()).suggestionsEnabled) return;
      // 설정 저장이 실제로 성공해 꺼진 경우에만 사이트 사용 기록을 지운다.
      await Promise.all([
        chrome.storage.local.remove(USAGE_KEY),
        chrome.storage.session.remove(USAGE_KEY),
      ]);
    } catch {
      setActionFailed(true);
    }
  };

  return (
    <section class="settings-privacy" data-role="settings-privacy">
      <h2>{t('settings.privacy.title')}</h2>
      <label class="check switch">
        <input
          type="checkbox"
          data-role="settings-clipboard-clear"
          checked={settings.clipboardClearAfterCopy}
          disabled={!supportsClipboardClear()}
          onChange={(e) => {
            const checked = e.currentTarget.checked;
            if (toolbarPopup && checked) e.currentTarget.checked = settings.clipboardClearAfterCopy;
            toggleClipboard(checked);
          }}
        />
        <span>{t('settings.clipboard.toggle')}</span>
      </label>
      <p class="muted indent">{t(supportsClipboardClear() ? 'settings.clipboard.desc' : 'settings.clipboard.unsupported')}</p>
      {supportsClipboardClear() && settings.clipboardClearAfterCopy && (
        <label class="field indent">
          <span>{t('settings.clipboard.delay')}</span>
          <select
            data-role="settings-clipboard-delay"
            value={String(settings.clipboardClearSeconds)}
            onChange={(e) => save({ clipboardClearSeconds: normalizeClipboardSeconds(Number(e.currentTarget.value)) })}
          >
            <option value="30">{t('settings.clipboard.s30')}</option>
            <option value="60">{t('settings.clipboard.m1')}</option>
            <option value="120">{t('settings.clipboard.m2')}</option>
            <option value="300">{t('settings.clipboard.m5')}</option>
          </select>
        </label>
      )}
      {denied && (
        <p class="error" data-role="settings-clipboard-denied">
          {t('settings.clipboard.denied')}
        </p>
      )}
      <label class="check switch">
        <input
          type="checkbox"
          data-role="settings-autofill-on-copy"
          checked={settings.autofillOnCopy}
          onChange={(e) => save({ autofillOnCopy: e.currentTarget.checked })}
        />
        <span>{t('settings.autofillOnCopy')}</span>
      </label>
      <label class="check switch">
        <input
          type="checkbox"
          data-role="settings-auto-submit"
          checked={settings.autoSubmit}
          onChange={(e) => save({ autoSubmit: e.currentTarget.checked })}
        />
        <span>{t('settings.autoSubmit')}</span>
      </label>
      <p class="muted indent">{t('settings.autoSubmit.desc')}</p>
      <label class="check switch">
        <input
          type="checkbox"
          data-role="settings-suggestions"
          checked={settings.suggestionsEnabled}
          onChange={(e) => void toggleSuggestions(e.currentTarget.checked)}
        />
        <span>{t('settings.suggestions')}</span>
      </label>
      {actionFailed && <p class="error" role="alert" data-role="settings-privacy-error">{t('common.actionError')}</p>}
    </section>
  );
}
