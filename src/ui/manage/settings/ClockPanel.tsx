import { useEffect, useRef, useState } from 'preact/hooks';
import { checkClock, onClockChanged, readClockStatus, type ClockStatus } from '../../../store/clock';
import type { Settings } from '../../../core/types';
import type { useT } from '../../shared/use-t';

type T = ReturnType<typeof useT>;

export function ClockPanel({ t, enabled, save, onReady }: { t: T; enabled: boolean; save: (patch: Partial<Settings>) => Promise<void>; onReady: () => void }) {
  const [status, setStatus] = useState<ClockStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const pending = useRef(0);
  const alive = useRef(true);

  const run = async (force: boolean) => {
    pending.current++;
    setChecking(true);
    try {
      const result = await checkClock(force ? { force: true } : {});
      if (alive.current && result) setStatus(result);
    } catch {
      // 확인하지 못하면 저장된 값을 그대로 보인다.
    } finally {
      pending.current--;
      if (alive.current) setChecking(pending.current > 0);
    }
  };

  useEffect(() => {
    alive.current = true;
    let seq = 0;
    const reread = () => {
      const mine = ++seq;
      void readClockStatus().then((s) => {
        if (alive.current && mine === seq) setStatus(s);
      }, () => undefined).finally(() => { if (alive.current) onReady(); });
    };
    const offClock = onClockChanged(reread);
    reread();
    return () => {
      alive.current = false;
      offClock();
    };
  }, []);

  useEffect(() => {
    if (enabled) void run(false);
  }, []);

  const toggle = (checked: boolean) => {
    void save({ clockCheck: checked }).then(() => { if (checked && alive.current) void run(false); });
  };

  const off = enabled === false;
  const shownState = off ? 'disabled' : checking ? 'checking' : (status?.state ?? 'unknown');
  const signed = (ms: number) => {
    const s = Math.round(ms / 1000);
    return s > 0 ? `+${s}` : String(s);
  };
  const seconds = status ? signed(status.offsetMs) : '0';
  const corrected = status !== null && status.correctionMs !== 0;

  let text = '';
  let extra = '';
  if (shownState === 'disabled') {
    text = t('settings.clock.disabled');
  } else if (shownState === 'checking') {
    text = t('settings.clock.checking');
  } else if (status && status.state === 'ok') {
    text = t('settings.clock.ok', { seconds });
    if (corrected) extra = t('settings.clock.corrected');
  } else if (status && status.state === 'off') {
    text = t('settings.clock.off', { seconds });
    extra = corrected ? t('settings.clock.corrected') : t('settings.clock.notCorrected');
  } else {
    text = t('settings.clock.unknown');
  }
  const showTime = shownState === 'ok' || shownState === 'off' || shownState === 'unknown';

  return (
    <section class="settings-clock" data-role="clock">
      <h2>{t('settings.clock.title')}</h2>
      <label class="check switch">
        <input
          type="checkbox"
          data-role="clock-check"
          checked={enabled === true}
          onChange={(e) => toggle(e.currentTarget.checked)}
        />
        <span>{t('settings.clock.toggle')}</span>
      </label>
      <p data-role="clock-status" data-state={shownState}>
        <span>{text}</span>
        {extra !== '' && <> <span>{extra}</span></>}
        {status !== null && showTime && (
          <>
            {' '}
            <span class="muted">
              {t('settings.clock.checkedAt', { time: new Date(status.checkedAt).toLocaleString() })}
            </span>
          </>
        )}
      </p>
      <button
        type="button"
        data-role="clock-recheck"
        disabled={off || checking}
        onClick={() => void run(true)}
      >
        {t('settings.clock.recheck')}
      </button>
    </section>
  );
}
