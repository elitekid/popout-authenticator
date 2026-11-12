import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { savePendingFill, takePendingFill } from '../../src/bg/pending-fill';

let store: Record<string, unknown>;
const entry = {
  accountId: 'a1', submit: true, origin: 'https://example.com/*',
  target: { tabId: 3, pageUrl: 'https://example.com/login' },
};

beforeEach(() => {
  store = {};
  vi.stubGlobal('navigator', { locks: { request: (_name: string, work: () => unknown) => work() } });
  vi.stubGlobal('chrome', {
    storage: {
      session: {
        get: async (key: string) => (key in store ? { [key]: store[key] } : {}),
        set: async (items: Record<string, unknown>) => { Object.assign(store, items); },
        remove: async (key: string) => { delete store[key]; },
      },
    },
  });
});

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('pending fill', () => {
  it('먼저 꺼낸 쪽만 받는다', async () => {
    await savePendingFill(entry);
    expect((await takePendingFill(() => true))?.accountId).toBe('a1');
    expect(await takePendingFill(() => true)).toBeUndefined();
  });

  it('origin 이 다르면 남겨 둔다', async () => {
    await savePendingFill(entry);
    expect(await takePendingFill((e) => e.origin === 'https://other.test/*')).toBeUndefined();
    expect(await takePendingFill((e) => e.origin === entry.origin)).toBeDefined();
  });

  it('기한이 지나면 받지 못한다', async () => {
    vi.useFakeTimers();
    await savePendingFill(entry);
    vi.advanceTimersByTime(121_000);
    expect(await takePendingFill(() => true)).toBeUndefined();
  });
});
