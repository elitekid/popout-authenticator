import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/core/types';
import { NO_POLICY, applyPolicy, isForced, normalizePolicy, passwordMeetsPolicy } from '../../src/store/policy';

describe('normalizePolicy', () => {
  it('객체가 아니면 정책 없음', () => {
    expect(normalizePolicy(null)).toBe(NO_POLICY);
    expect(normalizePolicy('x')).toBe(NO_POLICY);
    expect(normalizePolicy([])).toBe(NO_POLICY);
  });

  it('불리언 키는 true 만 채택한다', () => {
    const on = normalizePolicy({ disableExport: true, enforcePassword: true });
    expect(on.disableExport).toBe(true);
    expect(on.enforcePassword).toBe(true);
    const off = normalizePolicy({ disableExport: 'yes', enforcePassword: 1 });
    expect(off.disableExport).toBe(false);
    expect(off.enforcePassword).toBe(false);
  });

  it('storageArea 는 sync·local 만', () => {
    expect(normalizePolicy({ storageArea: 'cloud' }).storageArea).toBeUndefined();
    expect(normalizePolicy({ storageArea: 'local' }).storageArea).toBe('local');
  });

  it('enforceAutolock 은 유한 양수만, 1440 이 상한', () => {
    expect(normalizePolicy({ enforceAutolock: 0 }).enforceAutolock).toBeUndefined();
    expect(normalizePolicy({ enforceAutolock: -5 }).enforceAutolock).toBeUndefined();
    expect(normalizePolicy({ enforceAutolock: NaN }).enforceAutolock).toBeUndefined();
    expect(normalizePolicy({ enforceAutolock: 30 }).enforceAutolock).toBe(30);
    expect(normalizePolicy({ enforceAutolock: 5000 }).enforceAutolock).toBe(1440);
  });

  it('passwordPolicy 는 올바른 정규식만', () => {
    expect(normalizePolicy({ passwordPolicy: '[' }).passwordPolicy).toBeUndefined();
    expect(normalizePolicy({ passwordPolicy: '^.{12,}$' }).passwordPolicy).toBeInstanceOf(RegExp);
  });

  it('feedbackURL 은 http·https 만', () => {
    expect(normalizePolicy({ feedbackURL: 'javascript:alert(1)' }).feedbackURL).toBeUndefined();
    expect(normalizePolicy({ feedbackURL: 'https://example.com/help' }).feedbackURL).toBe('https://example.com/help');
  });
});

describe('applyPolicy', () => {
  it('storageArea 로 동기화를 강제한다', () => {
    const local = applyPolicy({ ...DEFAULT_SETTINGS, syncEnabled: true }, normalizePolicy({ storageArea: 'local' }));
    expect(local.syncEnabled).toBe(false);
    const sync = applyPolicy({ ...DEFAULT_SETTINGS, syncEnabled: false }, normalizePolicy({ storageArea: 'sync' }));
    expect(sync.syncEnabled).toBe(true);
  });

  it('enforceAutolock 으로 잠금 시점을 강제한다', () => {
    const next = applyPolicy({ ...DEFAULT_SETTINGS, lockTiming: 'every' }, normalizePolicy({ enforceAutolock: 30 }));
    expect(next.lockTiming).toEqual({ minutes: 30 });
  });

  it('정책이 없으면 같은 값', () => {
    const base = { ...DEFAULT_SETTINGS, syncEnabled: false, lockTiming: 'every' as const };
    const next = applyPolicy(base, NO_POLICY);
    expect(next).toEqual(base);
    expect(next).not.toBe(base);
  });
});

describe('passwordMeetsPolicy', () => {
  it('정규식에 맞는지 본다', () => {
    const policy = normalizePolicy({ passwordPolicy: '^.{12,}$' });
    expect(passwordMeetsPolicy(policy, 'short')).toBe(false);
    expect(passwordMeetsPolicy(policy, 'long-enough-pass')).toBe(true);
  });

  it('정책이 없으면 통과', () => {
    expect(passwordMeetsPolicy(NO_POLICY, 'x')).toBe(true);
  });
});

describe('isForced', () => {
  it('강제된 칸을 알려 준다', () => {
    expect(isForced(normalizePolicy({ storageArea: 'local' }), 'syncEnabled')).toBe(true);
    expect(isForced(NO_POLICY, 'syncEnabled')).toBe(false);
    expect(isForced(normalizePolicy({ enforceAutolock: 10 }), 'lockTiming')).toBe(true);
    expect(isForced(NO_POLICY, 'lockTiming')).toBe(false);
  });
});
