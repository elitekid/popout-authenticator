// 크롬 동기화 트리거: 금고 변경·sync 영역 변경(2초 디바운스)과 30분 알람.
import { syncNow } from '../store/sync';
import { onVaultChanged } from '../store/vault';
import { BROWSER_TARGET, supportsBrowserSync } from '../core/browser';

export const SYNC_ALARM = 'sync';
const DEBOUNCE_MS = 2000;

async function ensureAlarm(): Promise<void> {
  if (await chrome.alarms.get(SYNC_ALARM)) return;
  await chrome.alarms.create(SYNC_ALARM, { delayInMinutes: 1, periodInMinutes: 30 });
}

export function register(): void {
  if (!supportsBrowserSync()) return;
  const run = () => {
    syncNow().catch((error) => console.warn('sync: failed', error));
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      run();
    }, DEBOUNCE_MS);
  };

  onVaultChanged(schedule);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && Object.keys(changes).some((k) => k.startsWith('pa_'))) schedule();
  });
  // 파이어폭스: 부가 기능 관리자에서 데이터 전송을 허용하면 바로 동기화한다.
  if (BROWSER_TARGET === 'firefox') chrome.permissions.onAdded.addListener(schedule);

  const ensure = () => {
    ensureAlarm().catch((error) => console.warn('sync: alarm failed', error));
  };
  chrome.runtime.onInstalled.addListener(ensure);
  chrome.runtime.onStartup.addListener(ensure);
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === SYNC_ALARM) run();
  });
}
