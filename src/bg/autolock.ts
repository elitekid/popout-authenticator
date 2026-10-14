// 자동 잠금: 마지막 활동 뒤 정해진 시간이 지나면 세션 키를 지운다.
import type { LockTiming } from '../core/types';
import { lockNow } from '../store/lock';
import { getLastActivityAt, getUnlockedAt, setLastActivityAt } from '../store/session';
import { loadSettings } from '../store/settings';
import { readVaultFile } from '../store/vault';

const ALARM = 'autolock';
const MINUTE = 60_000;
const PORT_NAME = 'popout-ui';

export function autolockDeadline(timing: LockTiming, lastActivityAt: number): number | null {
  if (timing === 'every' || timing === 'browser-close') return null;
  if (typeof timing === 'number') return lastActivityAt + timing * MINUTE;
  if (typeof timing === 'object' && timing !== null) {
    const m = Number.isFinite(timing.minutes) ? Math.floor(timing.minutes) : 1;
    return lastActivityAt + Math.max(1, m) * MINUTE;
  }
  return null;
}

export async function touchActivity(now: number = Date.now()): Promise<void> {
  await setLastActivityAt(now);
  const { lockTiming } = await loadSettings();
  const deadline = autolockDeadline(lockTiming, now);
  if (deadline === null) await chrome.alarms.clear(ALARM);
  else await chrome.alarms.create(ALARM, { when: deadline });
}

export async function checkAutolock(now: number = Date.now()): Promise<void> {
  const file = await readVaultFile();
  if (!file || file.lock === 'none') return;
  const { lockTiming } = await loadSettings();
  const base = (await getLastActivityAt()) ?? (await getUnlockedAt());
  if (base === null) return;
  const deadline = autolockDeadline(lockTiming, base);
  if (deadline !== null && now >= deadline) await lockNow();
}

function warn(error: unknown): void {
  console.warn('autolock', error);
}

export function register(): void {
  let ports = 0;

  const touch = () => void touchActivity().catch(warn);

  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== PORT_NAME) return;
    ports++;
    touch();
    port.onMessage.addListener(touch);
    port.onDisconnect.addListener(() => {
      ports = Math.max(0, ports - 1);
      void (async () => {
        await touchActivity();
        if (ports === 0 && (await loadSettings()).lockTiming === 'every') await lockNow();
      })().catch(warn);
    });
  });

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM) void checkAutolock().catch(warn);
  });

  // 서비스 워커가 다시 깨어날 때 지난 시간을 반영한다.
  chrome.runtime.onStartup.addListener(() => void checkAutolock().catch(warn));

  // 'browser-close' 는 할 일 없음: storage.session 은 브라우저를 닫으면 사라진다.
}
