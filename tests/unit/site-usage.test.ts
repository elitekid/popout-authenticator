import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/store/settings', () => ({ loadSettings: async () => ({ suggestionsEnabled: true }) }));

import { MAX_SITES, readSiteUsage, recordSiteUse } from '../../src/store/site-usage';

let local: Record<string, unknown>;
let session: Record<string, unknown>;

const area = (store: Record<string, unknown>) => ({
  get: async (key: string) => {
    await Promise.resolve();
    return key in store ? { [key]: structuredClone(store[key]) } : {};
  },
  set: async (items: Record<string, unknown>) => {
    await Promise.resolve();
    Object.assign(store, structuredClone(items));
  },
  remove: async (key: string) => { delete store[key]; },
});

beforeEach(() => {
  local = {};
  session = {};
  // 실제 Web Lock 처럼 같은 이름의 요청을 차례로 돌린다.
  let tail: Promise<unknown> = Promise.resolve();
  vi.stubGlobal('navigator', {
    locks: {
      request: (_name: string, work: () => Promise<unknown>) => {
        const run = tail.then(work);
        tail = run.catch(() => undefined);
        return run;
      },
    },
  });
  vi.stubGlobal('chrome', { storage: { local: area(local), session: area(session) } });
});

afterEach(() => vi.unstubAllGlobals());

describe('사이트 사용 기록', () => {
  it('동시에 기록해도 횟수가 유실되지 않는다', async () => {
    await Promise.all(Array.from({ length: 20 }, () => recordSiteUse('example.com', 'a1', 'site')));
    expect((await readSiteUsage())['example.com']!['a1']).toEqual({ s: 20, c: 0 });
  });

  it('사이트가 상한을 넘으면 가장 오래 안 쓴 사이트부터 지운다', async () => {
    for (let i = 0; i < MAX_SITES + 3; i++) await recordSiteUse(`s${i}.example.com`, 'a1', 'copy');
    await recordSiteUse('s5.example.com', 'a1', 'copy');
    const usage = await readSiteUsage();
    expect(Object.keys(usage)).toHaveLength(MAX_SITES);
    expect(usage['s0.example.com']).toBeUndefined();
    expect(usage['s5.example.com']!['a1']).toEqual({ s: 0, c: 2 });
  });
});
