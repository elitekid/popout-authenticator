import type { Settings } from '../../../core/types';
import { LANGS } from '../../../i18n';
import type { PanelProps } from './panel-props';
import { supportsSidePanel } from '../../../core/browser';

const OPEN_MODES = ['popup', 'window', 'sidepanel'] as const;
const VIEWS = ['normal', 'compact', 'hidden'] as const;
const POPUP_SIZES = ['small', 'medium', 'large'] as const;
const THEMES = ['light', 'dark', 'system'] as const;

const ZOOM_MIN = 20;
const ZOOM_MAX = 125;

function clampZoom(value: number): number {
  if (!Number.isFinite(value)) return 100;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(value)));
}

// 붙은 단추 줄(세그먼트). 고른 값은 aria-pressed 로 알린다.
function Segment<V extends string>({
  label,
  role,
  value,
  options,
  text,
  onPick,
}: {
  label: string;
  role: string;
  value: V;
  options: readonly V[];
  text: (option: V) => string;
  onPick: (option: V) => void;
}) {
  return (
    <div class="seg-field">
      <span>{label}</span>
      <div class="seg" role="group" aria-label={label} data-role={role}>
        {options.map((o) => (
          <button
            key={o}
            type="button"
            data-value={o}
            aria-pressed={value === o}
            onClick={() => onPick(o)}
          >
            {text(o)}
          </button>
        ))}
      </div>
    </div>
  );
}

export function DisplayPanel({ t, settings, save }: PanelProps) {
  // 사이드 패널 API 가 없는 브라우저에서는 고르지 못하게 한다.
  const openModes = OPEN_MODES.filter((m) => m !== 'sidepanel' || supportsSidePanel());

  return (
    <section class="settings-display" data-role="settings-display">
      <h2>{t('settings.display.title')}</h2>
      <Segment
        label={t('settings.openMode.label')}
        role="settings-open-mode"
        value={settings.openMode}
        options={openModes}
        text={(m) => t(`settings.openMode.${m}`)}
        onPick={(openMode) => save({ openMode })}
      />
      <Segment
        label={t('settings.view.label')}
        role="settings-view"
        value={settings.view}
        options={VIEWS}
        text={(v) => t(`settings.view.${v}`)}
        onPick={(view) => save({ view })}
      />
      {settings.openMode === 'popup' && (
        <Segment
          label={t('settings.popupSize.label')}
          role="settings-popup-size"
          value={settings.popupSize}
          options={POPUP_SIZES}
          text={(s) => t(`settings.popupSize.${s}`)}
          onPick={(popupSize) => save({ popupSize })}
        />
      )}
      <Segment
        label={t('settings.theme.label')}
        role="settings-theme"
        value={settings.theme}
        options={THEMES}
        text={(v) => t(`settings.theme.${v}`)}
        onPick={(theme) => save({ theme })}
      />
      <label class="check switch">
        <input
          type="checkbox"
          data-role="settings-avatars"
          checked={settings.avatars}
          onChange={(e) => save({ avatars: e.currentTarget.checked })}
        />
        <span>{t('settings.avatars')}</span>
      </label>
      <label class="check switch">
        <input
          type="checkbox"
          data-role="settings-list-only"
          checked={settings.listOnly}
          onChange={(e) => save({ listOnly: e.currentTarget.checked })}
        />
        <span>{t('settings.openMode.window')} · {t('popup.listOnly')}</span>
      </label>
      <label>
        <span>{t('settings.zoom.label')}</span>
        <span class="settings-zoom">
          <input
            type="range"
            data-role="settings-zoom"
            min={ZOOM_MIN}
            max={ZOOM_MAX}
            step={5}
            value={settings.zoom}
            onChange={(e) => save({ zoom: clampZoom(Number(e.currentTarget.value)) })}
          />
          <span data-role="settings-zoom-value">{settings.zoom}%</span>
        </span>
      </label>
      <label>
        <span>{t('settings.language.label')}</span>
        <select
          class="field"
          data-role="settings-language"
          value={settings.language}
          onChange={(e) => save({ language: e.currentTarget.value })}
        >
          <option value="auto">{t('settings.language.auto')}</option>
          {LANGS.map(([code, name]) => (
            <option key={code} value={code}>
              {name}
            </option>
          ))}
        </select>
      </label>
    </section>
  );
}
