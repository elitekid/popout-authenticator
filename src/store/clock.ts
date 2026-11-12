// 시계 확인 결과는 chrome.storage.local 의 'clock' 에 둔다.
import { correctionFor, measureClock, type ClockResult, type ClockState } from '../core/clock';
import { loadSettings } from './settings';

const KEY = 'clock';
const FRESH_OK_MS = 6 * 60 * 60 * 1000;
const FRESH_OTHER_MS = 5 * 60 * 1000;

export type ClockStatus = ClockResult & { checkedAt: number };

// 확인 중인 측정은 하나만 둔다.
let inflight: Promise<ClockStatus> | null = null;

function asStatus(raw: unknown): ClockStatus | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { state, offsetMs, correctionMs, checkedAt } = raw as Record<string, unknown>;
  if (state !== 'ok' && state !== 'off' && state !== 'unknown') return null;
  if (typeof checkedAt !== 'number' || !Number.isFinite(checkedAt)) return null;
  const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : 0);
  return {
    state: state as ClockState,
    offsetMs: num(offsetMs),
    correctionMs: num(correctionMs),
    checkedAt,
  };
}

export async function readClockStatus(): Promise<ClockStatus | null> {
  try {
    const got = await chrome.storage.local.get(KEY);
    return asStatus(got[KEY]);
  } catch {
    return null;
  }
}

export async function readClockCorrection(): Promise<number> {
  try {
    if (!(await loadSettings()).clockCheck) return 0;
    // 낡은 측정(시계가 뒤로 간 경우 포함)의 보정은 쓰지 않는다. 다시 재면 그때 새 값이 들어온다.
    const status = await readClockStatus();
    if (!status || !isFresh(status, Date.now())) return 0;
    return correctionFor(status.correctionMs);
  } catch {
    return 0;
  }
}

function isFresh(status: ClockStatus, now: number): boolean {
  const age = now - status.checkedAt;
  if (age < 0) return false;
  const limit = status.state === 'ok' && status.correctionMs === 0 ? FRESH_OK_MS : FRESH_OTHER_MS;
  return age < limit;
}

function measureAndStore(): Promise<ClockStatus> {
  const mine: Promise<ClockStatus> = (async () => {
    const result = await measureClock();
    const status: ClockStatus = { ...result, checkedAt: Date.now() };
    try {
      await chrome.storage.local.set({ [KEY]: status });
    } catch {
      // 저장하지 못해도 이번 결과는 돌려준다.
    }
    return status;
  })();
  inflight = mine;
  const clear = () => {
    if (inflight === mine) inflight = null;
  };
  mine.then(clear, clear);
  return mine;
}

export async function checkClock(opts: { force?: boolean } = {}): Promise<ClockStatus | null> {
  if (!(await loadSettings()).clockCheck) return null;
  if (opts.force !== true) {
    const saved = await readClockStatus();
    if (saved && isFresh(saved, Date.now())) return saved;
    if (inflight) return inflight;
  }
  return measureAndStore();
}

export function onClockChanged(cb: () => void): () => void {
  const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area !== 'local') return;
    if (KEY in changes) return cb();
    // 설정은 시계 확인 켜기·끄기가 바뀔 때만 알린다.
    const s = changes.settings;
    if (s && (s.oldValue as { clockCheck?: unknown } | undefined)?.clockCheck !==
      (s.newValue as { clockCheck?: unknown } | undefined)?.clockCheck) cb();
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
