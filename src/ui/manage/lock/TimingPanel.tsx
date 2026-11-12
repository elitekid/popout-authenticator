import { useEffect, useRef, useState } from 'preact/hooks';
import type { LockTiming } from '../../../core/types';
import { readPolicy } from '../../../store/policy';
import { loadSettings, onSettingsChanged, saveSettings } from '../../../store/settings';
import type { useT } from '../../shared/use-t';

type T = ReturnType<typeof useT>;

const CHOICES = ['every', '5', '15', '60', 'browser-close', 'custom'] as const;
const DEFAULT_MINUTES = 30;

function choiceOf(timing: LockTiming): string {
  return typeof timing === 'object' ? 'custom' : String(timing);
}

function toTiming(choice: string, minutes: number): LockTiming {
  if (choice === 'every' || choice === 'browser-close') return choice;
  if (choice === '5') return 5;
  if (choice === '15') return 15;
  if (choice === '60') return 60;
  return { minutes };
}

export function TimingPanel({ t, onReady }: { t: T; onReady: () => void }) {
  // null: 아직 설정을 읽지 못함
  const [timing, setTiming] = useState<LockTiming | null>(null);
  const [minutes, setMinutes] = useState(String(DEFAULT_MINUTES));
  const [minutesError, setMinutesError] = useState(false);
  const savedMinutes = useRef(DEFAULT_MINUTES);
  const minutesDirty = useRef(false);
  // 관리자가 정한 분. 없으면 undefined.
  const [forced, setForced] = useState<number | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const saveSeq = useRef(0);
  const pending = useRef(0);

  useEffect(() => {
    let alive = true;
    const apply = (value: LockTiming) => {
      if (!alive) return;
      setTiming(value);
      if (typeof value === 'object') {
        savedMinutes.current = value.minutes;
        setMinutes(String(value.minutes));
      }
    };
    const off = onSettingsChanged((settings) => { if (pending.current === 0) apply(settings.lockTiming); });
    void Promise.all([loadSettings(), readPolicy()]).then(([settings, policy]) => {
      if (!alive) return;
      setForced(policy.enforceAutolock);
      apply(settings.lockTiming);
    }, () => alive && setFailed(true)).finally(() => { if (alive) onReady(); });
    return () => { alive = false; off(); };
  }, []);

  const save = (value: LockTiming) => {
    const previous = timing;
    const mine = ++saveSeq.current;
    pending.current++;
    setFailed(false);
    setTiming(value);
    void saveSettings({ lockTiming: value }).then((settings) => {
      if (mine === saveSeq.current) {
        setTiming(settings.lockTiming);
        if (typeof settings.lockTiming === 'object') savedMinutes.current = settings.lockTiming.minutes;
      }
    }, async () => {
      const stored = await loadSettings().catch(() => null);
      if (mine !== saveSeq.current) return;
      setTiming(stored?.lockTiming ?? previous);
      if (typeof stored?.lockTiming === 'object') savedMinutes.current = stored.lockTiming.minutes;
      setMinutes(String(savedMinutes.current));
      setFailed(true);
    }).finally(() => { pending.current--; });
  };

  const parsed = Number(minutes);
  const valid = minutes.trim() !== '' && Number.isInteger(parsed) && parsed >= 1 && parsed <= 1440;
  const choice = timing === null ? '' : choiceOf(timing);
  const commitMinutes = () => {
    if (!minutesDirty.current || forced !== undefined || timing === null) return;
    minutesDirty.current = false;
    if (!valid) {
      setMinutesError(true);
      setMinutes(String(savedMinutes.current));
      return;
    }
    setMinutesError(false);
    setMinutes(String(parsed));
    if (typeof timing !== 'object' || timing.minutes !== parsed) save({ minutes: parsed });
  };

  return (
    <section class="lock-timing" data-role="lock-timing-box">
      <h2>{t('lock.timing.title')}</h2>
      {failed && <p class="error" role="alert">{t(timing === null ? 'common.loadError' : 'add.error.save')}</p>}
      <div class="radio-list" role="radiogroup" data-role="lock-timing" aria-label={t('lock.timing.title')}>
        {CHOICES.map((c) => (
          <label key={c} class="check">
            <input
              type="radio"
              name="lock-timing"
              value={c}
              data-role={`lock-timing-${c}`}
              disabled={timing === null || forced !== undefined}
              checked={choice === c}
              onChange={() => {
                const value = valid ? parsed : savedMinutes.current;
                minutesDirty.current = false;
                setMinutesError(false);
                if (c === 'custom') setMinutes(String(value));
                save(toTiming(c, value));
              }}
            />
            <span>{t(`lock.timing.${c}`)}</span>
          </label>
        ))}
      </div>
      {choice === 'browser-close' && (
        <p class="muted" data-role="lock-timing-manual-hint">
          {t('lock.timing.manualHint')}
        </p>
      )}
      {forced !== undefined && (
        <p class="muted" data-role="lock-timing-forced">
          {t('lock.timing.forced', { minutes: forced })}
        </p>
      )}
      {choice === 'custom' && (
        <label>
          <span>{t('lock.timing.minutes')}</span>
          <input
            type="number"
            class="field"
            data-role="lock-minutes"
            min={1}
            max={1440}
            step={1}
            value={minutes}
            disabled={forced !== undefined}
            aria-invalid={minutesError}
            aria-describedby={minutesError ? 'lock-minutes-error' : undefined}
            onInput={(e) => { minutesDirty.current = true; setMinutes(e.currentTarget.value); setMinutesError(false); }}
            onBlur={commitMinutes}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitMinutes(); } }}
          />
          {minutesError && <span class="error" role="alert" id="lock-minutes-error" data-role="lock-minutes-error">{t('lock.timing.invalid')}</span>}
        </label>
      )}
    </section>
  );
}
