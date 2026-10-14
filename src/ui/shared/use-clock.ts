import { useEffect, useState } from 'preact/hooks';
import { checkClock, onClockChanged, readClockCorrection } from '../../store/clock';

const RENEW_MS = 60_000;

// 코드 계산에 더할 보정값(밀리초). 꺼져 있거나 못 읽으면 0.
export function useClockCorrection(): number {
  const [correction, setCorrection] = useState(0);
  useEffect(() => {
    let alive = true;
    let seq = 0;
    let renewTimer: ReturnType<typeof setInterval> | undefined;
    const read = () => {
      const mine = ++seq;
      if (document.hidden) return;
      void readClockCorrection().then((value) => {
        if (alive && !document.hidden && mine === seq) setCorrection(value);
      }, () => undefined);
    };
    const renew = () => { void checkClock().then(read, () => undefined); };
    const visibility = () => {
      if (renewTimer !== undefined) clearInterval(renewTimer);
      renewTimer = undefined;
      if (document.hidden) { seq++; return; }
      renew();
      renewTimer = setInterval(renew, RENEW_MS);
    };
    read();
    const off = onClockChanged(read);
    // 오래 열린 창: 측정이 낡으면 다시 잰다(새것이면 저장값만 읽음). 결과는 onClockChanged 로 들어온다.
    if (!document.hidden) renewTimer = setInterval(renew, RENEW_MS);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      alive = false;
      off();
      if (renewTimer !== undefined) clearInterval(renewTimer);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, []);
  return correction;
}
