import { describe, expect, it } from 'vitest';
import { judgeSamples, measureClock } from '../../src/core/clock';

describe('judgeSamples', () => {
  it('가장 큰 무리에서 rtt 가 가장 작은 표본을 쓴다', () => {
    expect(
      judgeSamples([
        { offset: 5000, rtt: 100 },
        { offset: 5500, rtt: 50 },
        { offset: -200000, rtt: 10 },
      ]),
    ).toEqual({ state: 'ok', offsetMs: 5500, correctionMs: 5500 });
  });

  it('90초 이상 어긋나면 off', () => {
    expect(
      judgeSamples([
        { offset: 120000, rtt: 80 },
        { offset: 121000, rtt: 90 },
      ]),
    ).toEqual({ state: 'off', offsetMs: 120000, correctionMs: 120000 });
  });

  it('3초 미만이면 보정하지 않는다', () => {
    expect(
      judgeSamples([
        { offset: 1000, rtt: 10 },
        { offset: 1500, rtt: 20 },
      ]),
    ).toEqual({ state: 'ok', offsetMs: 1000, correctionMs: 0 });
  });

  it('서로 맞지 않으면 unknown', () => {
    expect(
      judgeSamples([
        { offset: 0, rtt: 10 },
        { offset: 10000, rtt: 10 },
        { offset: 20000, rtt: 10 },
      ]),
    ).toEqual({ state: 'unknown', offsetMs: 0, correctionMs: 0 });
  });

  it('표본이 하나이거나 없으면 unknown', () => {
    const unknown = { state: 'unknown', offsetMs: 0, correctionMs: 0 };
    expect(judgeSamples([{ offset: 5000, rtt: 10 }])).toEqual(unknown);
    expect(judgeSamples([])).toEqual(unknown);
  });

  it('12시간을 넘게 어긋나면 off 이되 보정하지 않는다', () => {
    expect(
      judgeSamples([
        { offset: 46800000, rtt: 10 },
        { offset: 46800500, rtt: 20 },
      ]),
    ).toEqual({ state: 'off', offsetMs: 46800000, correctionMs: 0 });
  });
});

function reply(ok: boolean, body: string): Response {
  return {
    ok,
    status: ok ? 200 : 500,
    text: async () => body,
    json: async () => JSON.parse(body) as unknown,
  } as unknown as Response;
}

describe('measureClock', () => {
  it('두 곳이 합의하면 그 값을 쓴다', async () => {
    const fakeFetch = (async (url: string) => {
      if (url.includes('akamai')) return reply(true, '1970-01-01T00:16:45Z');
      if (url.includes('cloudflare')) return reply(true, 'fl=1\nts=1005.000\n');
      return reply(false, '');
    }) as unknown as typeof fetch;
    expect(await measureClock(fakeFetch, () => 1_000_000)).toEqual({
      state: 'ok',
      offsetMs: 5500,
      correctionMs: 5500,
    });
  });

  it('모두 실패하면 unknown', async () => {
    const fakeFetch = (async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    expect(await measureClock(fakeFetch, () => 1_000_000)).toEqual({
      state: 'unknown',
      offsetMs: 0,
      correctionMs: 0,
    });
  });
});
