// authenticator-sh/2fa (MIT) src/utils/time-sync.ts 의 판정 규칙을 옮겼다.
// 공개 시간 서버 3곳에 한 번씩 물어 기기 시계의 어긋남을 재고, 보정값을 정한다.

export type ClockState = 'ok' | 'off' | 'unknown';
export type ClockSample = { offset: number; rtt: number };
export type ClockResult = { state: ClockState; offsetMs: number; correctionMs: number };

const TIMEOUT_MS = 3000;
// 표본끼리 이 안이면 같은 무리로 본다.
const AGREE_MS = 3000;
// 이만큼 넘게 어긋나면 'off'.
const OFF_MS = 90000;
// 보정은 3초 이상 12시간 이하일 때만 한다.
const CORRECT_MIN_MS = 3000;
const CORRECT_MAX_MS = 12 * 60 * 60 * 1000;

const UNKNOWN: ClockResult = { state: 'unknown', offsetMs: 0, correctionMs: 0 };

export function correctionFor(offsetMs: number): number {
  const size = Math.abs(offsetMs);
  return size >= CORRECT_MIN_MS && size <= CORRECT_MAX_MS ? offsetMs : 0;
}

// 서로 3초 이내인 가장 큰 무리(2개 이상)에서 rtt 가 가장 작은 표본의 offset 을 쓴다.
export function judgeSamples(samples: ClockSample[]): ClockResult {
  // 같은 크기면 대표(무리에서 rtt 가 가장 작은 표본)의 rtt 가 작은 무리.
  let best: { size: number; pick: ClockSample } | null = null;
  for (const anchor of samples) {
    const group = samples.filter((s) => Math.abs(s.offset - anchor.offset) <= AGREE_MS);
    if (group.length < 2) continue;
    const pick = group.reduce((a, b) => (b.rtt < a.rtt ? b : a));
    if (best === null || group.length > best.size || (group.length === best.size && pick.rtt < best.pick.rtt)) {
      best = { size: group.length, pick };
    }
  }
  if (best === null) return { ...UNKNOWN };
  const offsetMs = best.pick.offset;
  return {
    state: Math.abs(offsetMs) < OFF_MS ? 'ok' : 'off',
    offsetMs,
    correctionMs: correctionFor(offsetMs),
  };
}

export function parseAkamai(body: string): number | null {
  const ms = Date.parse(body.trim());
  return Number.isFinite(ms) ? ms : null;
}

export function parseCloudflare(body: string): number | null {
  const found = /^ts=([0-9.]+)$/m.exec(body);
  if (!found) return null;
  const ms = Math.round(Number(found[1]) * 1000);
  return Number.isFinite(ms) && ms > 0 ? ms : null;
}

export function parseTimeApi(json: unknown): number | null {
  if (typeof json !== 'object' || json === null) return null;
  const { year, month, day, hour, minute, seconds, milliSeconds } = json as Record<string, unknown>;
  if (
    typeof year !== 'number' ||
    typeof month !== 'number' ||
    typeof day !== 'number' ||
    typeof hour !== 'number' ||
    typeof minute !== 'number' ||
    typeof seconds !== 'number'
  ) {
    return null;
  }
  const milli = typeof milliSeconds === 'number' ? milliSeconds : 0;
  const ms = Date.UTC(year, month - 1, day, hour, minute, seconds, milli);
  return Number.isFinite(ms) ? ms : null;
}

type Source = {
  url: string;
  // 초 단위로 잘려 오는 곳은 값이 정각이면 반 초를 더한다.
  truncated: boolean;
  read: (response: Response) => Promise<number | null>;
};

const SOURCES: Source[] = [
  {
    url: 'https://time.akamai.com/?iso',
    truncated: true,
    read: async (r) => parseAkamai(await r.text()),
  },
  {
    url: 'https://timeapi.io/api/time/current/zone?timeZone=UTC',
    truncated: false,
    read: async (r) => parseTimeApi(await r.json()),
  },
  {
    url: 'https://cloudflare.com/cdn-cgi/trace',
    truncated: true,
    read: async (r) => parseCloudflare(await r.text()),
  },
];

async function sampleOf(
  source: Source,
  fetchImpl: typeof fetch,
  now: () => number,
): Promise<ClockSample | null> {
  try {
    const t0 = now();
    const response = await fetchImpl(source.url, {
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const t1 = now();
    if (!response.ok) return null;
    let serverMs = await source.read(response);
    if (serverMs === null) return null;
    if (source.truncated && serverMs % 1000 === 0) serverMs += 500;
    const rtt = t1 - t0;
    // 재는 사이 시계가 뒤로 가면 rtt 가 음수가 된다. 그 표본은 버린다.
    if (rtt < 0 || rtt > TIMEOUT_MS) return null;
    return { offset: serverMs - (t0 + t1) / 2, rtt };
  } catch {
    return null;
  }
}

export async function measureClock(
  fetchImpl: typeof fetch = fetch,
  now: () => number = Date.now,
): Promise<ClockResult> {
  const settled = await Promise.allSettled(SOURCES.map((s) => sampleOf(s, fetchImpl, now)));
  const samples: ClockSample[] = [];
  for (const r of settled) {
    if (r.status === 'fulfilled' && r.value !== null) samples.push(r.value);
  }
  return judgeSamples(samples);
}
