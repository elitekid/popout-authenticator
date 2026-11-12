// 주기 정리: 오래된 스냅샷, 만료된 휴지통.
import { LockedError, NoVaultError } from '../store/errors';
import { pruneSnapshots } from '../store/snapshots';
import { purgeExpiredTrash } from '../store/trash';

export const HOUSEKEEPING_ALARM = 'housekeeping';

export async function runHousekeeping(now: number = Date.now()): Promise<void> {
  try {
    await pruneSnapshots(now);
  } catch (error) {
    console.warn('housekeeping: prune snapshots failed', error);
  }
  try {
    await purgeExpiredTrash(now);
  } catch (error) {
    // 잠겨 있거나 금고가 없으면 다음 기회에.
    if (!(error instanceof LockedError) && !(error instanceof NoVaultError)) {
      console.warn('housekeeping: purge trash failed', error);
    }
  }
}

async function ensureAlarm(): Promise<void> {
  if (await chrome.alarms.get(HOUSEKEEPING_ALARM)) return;
  await chrome.alarms.create(HOUSEKEEPING_ALARM, { delayInMinutes: 1, periodInMinutes: 360 });
}

export function register(): void {
  const ensure = () => {
    ensureAlarm().catch((error) => console.warn('housekeeping: alarm failed', error));
  };
  chrome.runtime.onInstalled.addListener(ensure);
  chrome.runtime.onStartup.addListener(ensure);
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === HOUSEKEEPING_ALARM) void runHousekeeping();
  });
}
