import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PENDING_FIELD_TTL_MS,
  addPendingFieldButton,
  applyAccountEditPatch,
  applyPendingFieldButtons,
  readFieldButtons,
  releaseUnusedOrigins,
} from '../../src/store/field-buttons';
import type { Account } from '../../src/core/types';

let store: Record<string, unknown>;
let granted: Set<string>;
// 권한을 확인하는 사이에 다른 문서가 쓰는 상황을 흉내 낸다.
let duringContains: (() => Promise<void>) | undefined;

beforeEach(() => {
  store = {};
  duringContains = undefined;
  granted = new Set();
  vi.stubGlobal('navigator', { locks: { request: (_name: string, work: () => unknown) => work() } });
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: async (key: string | null) => (key === null ? { ...store } : key in store ? { [key]: store[key] } : {}),
        set: async (items: Record<string, unknown>) => { Object.assign(store, items); },
        remove: async (keys: string | string[]) => { for (const k of [keys].flat()) delete store[k]; },
      },
    },
    permissions: {
      contains: async ({ origins }: { origins: string[] }) => {
        await duringContains?.();
        return origins.every((o) => granted.has(o));
      },
    },
    scripting: {
      getRegisteredContentScripts: async () => [],
      registerContentScripts: async () => undefined,
      unregisterContentScripts: async () => undefined,
    },
    tabs: { query: async () => [] },
  });
});

afterEach(() => vi.unstubAllGlobals());

describe('대기 중인 단추 설정', () => {
  it('권한이 허용되면 단추 설정으로 옮기고 대기 항목을 지운다', async () => {
    await addPendingFieldButton('a1', ['example.com'], ['https://*.example.com/*'], 1000);
    await applyPendingFieldButtons(2000);
    expect(await readFieldButtons()).toEqual({});
    granted.add('https://*.example.com/*');
    await applyPendingFieldButtons(3000);
    expect(await readFieldButtons()).toEqual({ a1: ['example.com'] });
    expect(Object.keys(store).filter((k) => k.startsWith('pendingFieldButton:'))).toEqual([]);
    await applyPendingFieldButtons(4000);
    expect(await readFieldButtons()).toEqual({ a1: ['example.com'] });
  });

  it('10분이 지난 대기 항목은 허용돼 있어도 버린다', async () => {
    await addPendingFieldButton('a1', ['example.com'], ['https://*.example.com/*'], 1000);
    granted.add('https://*.example.com/*');
    await applyPendingFieldButtons(1000 + PENDING_FIELD_TTL_MS + 1);
    expect(await readFieldButtons()).toEqual({});
    expect(Object.keys(store).filter((k) => k.startsWith('pendingFieldButton:'))).toEqual([]);
  });

  it('계정 수정이 든 항목은 허용 뒤 수정을 먼저 적용하고 단추를 켠다', async () => {
    const patch = { issuer: 'Example', matchHosts: ['example.com'], group: null };
    await addPendingFieldButton('a1', ['example.com'], ['https://*.example.com/*'], 1000, patch);
    const applyPatch = vi.fn(async () => true);
    await applyPendingFieldButtons(2000, applyPatch);
    expect(applyPatch).not.toHaveBeenCalled();
    granted.add('https://*.example.com/*');
    await applyPendingFieldButtons(3000, applyPatch);
    expect(applyPatch).toHaveBeenCalledWith('a1', patch);
    expect(await readFieldButtons()).toEqual({ a1: ['example.com'] });
  });

  it('수정을 적용하지 못하면 항목을 남기고, 계정이 없으면 단추 없이 버린다', async () => {
    granted.add('https://*.example.com/*');
    await addPendingFieldButton('a1', ['example.com'], ['https://*.example.com/*'], 1000, { note: 'n' });
    await applyPendingFieldButtons(2000, async () => { throw new Error('locked'); });
    expect(await readFieldButtons()).toEqual({});
    expect(store['pendingFieldButton:a1']).toBeDefined();
    await applyPendingFieldButtons(3000, async () => false);
    expect(await readFieldButtons()).toEqual({});
    expect(store['pendingFieldButton:a1']).toBeUndefined();
  });

  it('계정 수정은 같은 값을 두 번 적용해도 결과가 같다', () => {
    const account = {
      id: 'a1', issuer: 'Old', label: 'me', note: '', matchHosts: [], pinned: false, group: 'g',
      algorithm: 'SHA-1', digits: 6, period: 30, updatedAt: 1,
    } as unknown as Account;
    const patch = { issuer: 'New', matchHosts: ['example.com'], group: null };
    const once = applyAccountEditPatch(account, patch, 5);
    expect(once).toMatchObject({ issuer: 'New', matchHosts: ['example.com'], updatedAt: 5 });
    expect('group' in once).toBe(false);
    expect(applyAccountEditPatch(once, patch, 9)).toBe(once);
  });

  it('거절된 앞 계정의 대기는 같은 사이트를 다른 계정이 허용해도 켜지지 않는다', async () => {
    await addPendingFieldButton('a1', ['example.com'], ['https://*.example.com/*'], 1000);
    await addPendingFieldButton('b1', ['example.com'], ['https://*.example.com/*'], 2000);
    expect(store['pendingFieldButton:a1']).toBeUndefined();
    granted.add('https://*.example.com/*');
    await applyPendingFieldButtons(3000);
    expect(await readFieldButtons()).toEqual({ b1: ['example.com'] });
  });

  it('겹치는 권한이 다른 단추에 쓰이면 반납하지 않는다', async () => {
    const remove = vi.fn(async () => true);
    const g = (chrome as unknown as { permissions: Record<string, unknown> }).permissions;
    g.getAll = async () => ({ origins: ['https://*.example.com/*', 'https://*.login.example.com/*'] });
    g.remove = remove;
    (chrome as unknown as { runtime: unknown }).runtime = {
      getManifest: () => ({ host_permissions: [], optional_host_permissions: ['https://*/*'] }),
    };
    store.fieldButtons = { a1: ['example.com'] };
    await releaseUnusedOrigins();
    expect(remove).not.toHaveBeenCalled();
    store.fieldButtons = {};
    await releaseUnusedOrigins();
    expect(remove).toHaveBeenCalledWith({ origins: ['https://*.example.com/*', 'https://*.login.example.com/*'] });
  });

  it('처리하는 사이 같은 계정에 새 항목이 쓰였으면 그 항목은 지우지 않는다', async () => {
    await addPendingFieldButton('a1', ['example.com'], ['https://*.example.com/*'], 1000);
    granted.add('https://*.example.com/*');
    duringContains = () => addPendingFieldButton('a1', ['other.com'], ['https://*.other.com/*'], 1500);
    await applyPendingFieldButtons(2000);
    duringContains = undefined;
    expect(await readFieldButtons()).toEqual({ a1: ['example.com'] });
    expect((store['pendingFieldButton:a1'] as { hosts: string[] }).hosts).toEqual(['other.com']);
    granted.add('https://*.other.com/*');
    await applyPendingFieldButtons(3000);
    expect(await readFieldButtons()).toEqual({ a1: ['other.com'] });
    expect(store['pendingFieldButton:a1']).toBeUndefined();
  });
});
