import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { autolockDeadline, checkAutolock, register, touchActivity } from '../../src/bg/autolock';
import { newAccount, type AccountDraft } from '../../src/core/account';
import { WrongSecretError } from '../../src/core/crypto/errors';
import { decryptVault } from '../../src/core/crypto/vault';
import type { Account } from '../../src/core/types';
import { LockedError } from '../../src/store/errors';
import { disableCodeProtectionWithPassword, enableCodeProtection, readCodeProtection } from '../../src/store/code-access';
import {
  addPrfKey,
  changePassword,
  confirmRecoveryCode,
  disableLock,
  enableLock,
  isLocked,
  issueOneTimeKey,
  lockNow,
  redeemOneTimeKey,
  removePrfKey,
  replaceRecoveryCode,
  unlockWithPassword,
  unlockWithPrf,
  unlockWithRecoveryCode,
} from '../../src/store/lock';
import { newRecoveryCode } from '../../src/core/crypto/recovery';
import { clearSessionKey, getSessionKey, setSessionKey } from '../../src/store/session';
import { saveSettings } from '../../src/store/settings';
import { _resetSnapshotsForTest, getSnapshot, listSnapshots } from '../../src/store/snapshots';
import { addDrafts, createVault, keyFromFile, loadAccounts, readVaultFile } from '../../src/store/vault';

const FAST = { iterations: 1, memoryKiB: 1024, parallelism: 1 };
const MIN = 60_000;
const FAKE_SECRET = [0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x21, 0xde, 0xad, 0xbe, 0xef];

function draft(n = 0): AccountDraft {
  const secret = new Uint8Array(FAKE_SECRET);
  secret[secret.length - 1] = n;
  return {
    type: 'totp',
    issuer: 'Example',
    label: `user${n}@example.com`,
    secret,
    algorithm: 'SHA-1',
    digits: 6,
    period: 30,
  };
}

const account = (n = 0): Account => newAccount(draft(n), 1_700_000_000_000);
const fakePrf = () => new Uint8Array(32).fill(7);
const bare = (code: string) => code.replace(/-/g, '');

async function lockedVault(): Promise<{ accounts: Account[]; code: string }> {
  const accounts = [account(1), account(2)];
  await createVault(accounts);
  const { recoveryCode } = await enableLock('fake-pass-5678', FAST);
  return { accounts, code: recoveryCode };
}

beforeAll(() => {
  register();
});

beforeEach(async () => {
  await chrome.storage.local.clear();
  await chrome.storage.session.clear();
  await chrome.alarms.clearAll();
  await _resetSnapshotsForTest();
  Object.defineProperty(globalThis, 'indexedDB', {
    value: new IDBFactory(),
    configurable: true,
    writable: true,
  });
});

describe('잠금 켜기·끄기', () => {
  it('켜면 복구 코드가 나오고 잠그면 읽을 수 없다', async () => {
    const { code } = await lockedVault();
    expect(bare(code)).toHaveLength(32);
    expect(await isLocked()).toBe(false);
    await lockNow();
    expect(await isLocked()).toBe(true);
    await expect(loadAccounts()).rejects.toBeInstanceOf(LockedError);
  });

  it('너무 짧은 비밀번호와 중복 켜기는 거절한다', async () => {
    await createVault([account(1)]);
    await expect(enableLock('short', FAST)).rejects.toThrow('password too short');
    await enableLock('fake-pass-5678', FAST);
    await expect(enableLock('fake-pass-5678', FAST)).rejects.toThrow('lock already enabled');
  });

  it('켜면 마스터 키가 바뀌어 옛 none 키로 풀리지 않는다', async () => {
    await createVault([account(1)]);
    const before = (await readVaultFile())!;
    const oldKey = await keyFromFile(before);
    await enableLock('fake-pass-5678', FAST);
    const after = (await readVaultFile())!;
    expect(after.lock).toBe('password');
    expect(after.lockChangedAt).toBeTypeOf('number');
    await expect(decryptVault(after, oldKey)).rejects.toThrow();
  });

  it('끄면 lock none 이고 세션 키 없이 읽힌다', async () => {
    const { accounts } = await lockedVault();
    await disableLock();
    expect((await readVaultFile())!.lock).toBe('none');
    expect(await getSessionKey()).toBeNull();
    expect(await loadAccounts()).toEqual(accounts);
  });

  it('풀리지 않은 상태에서는 끌 수 없다', async () => {
    await lockedVault();
    await lockNow();
    await expect(disableLock()).rejects.toBeInstanceOf(LockedError);
  });
});

describe('비밀번호·복구 코드', () => {
  it.each(['password', 'recovery', 'enable'])('%s 처리 중 명시적 잠금은 늦은 세션 저장 뒤에도 유지한다', async (mode) => {
    let code = '';
    if (mode === 'enable') await createVault([account(1)]);
    else {
      ({ code } = await lockedVault());
      await lockNow();
    }
    let lock: Promise<void> | undefined;
    const original = chrome.storage.session.set.bind(chrome.storage.session);
    const save = vi.spyOn(chrome.storage.session, 'set').mockImplementation(async (values) => {
      if ('vaultKey' in values) {
        lock = lockNow();
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      await original(values);
    });
    try {
      if (mode === 'enable') await enableLock('fake-pass-5678', FAST);
      else if (mode === 'password') await unlockWithPassword('fake-pass-5678');
      else await unlockWithRecoveryCode(code);
      await lock;
      expect(await getSessionKey()).toBeNull();
    } finally { save.mockRestore(); }
  });

  it('비밀번호를 바꾸면 옛것은 안 통하고 새것은 통한다', async () => {
    const { accounts, code } = await lockedVault();
    await changePassword('new-pass-9012', FAST);
    await lockNow();
    await expect(unlockWithPassword('fake-pass-5678')).rejects.toBeInstanceOf(WrongSecretError);
    await unlockWithPassword('new-pass-9012');
    expect(await loadAccounts()).toEqual(accounts);

    await lockNow();
    const next = await unlockWithRecoveryCode(code);
    expect(bare(next.recoveryCode)).toHaveLength(32);
    expect(next.recoveryCode).not.toBe(code);
    expect(await loadAccounts()).toEqual(accounts);

    // 새 코드를 확인하기 전에는 옛 코드도 통하고, 확인하면 새 코드만 남는다.
    await lockNow();
    await unlockWithRecoveryCode(code);
    await confirmRecoveryCode(next.recoveryCode);
    await lockNow();
    await expect(unlockWithRecoveryCode(code)).rejects.toBeInstanceOf(WrongSecretError);
    await unlockWithRecoveryCode(next.recoveryCode);
  });

  it('복구 코드로 풀고 새 코드를 못 받아도 옛 코드로 다시 풀린다', async () => {
    const { accounts, code } = await lockedVault();
    await lockNow();
    const first = await unlockWithRecoveryCode(code);
    await lockNow();
    await unlockWithRecoveryCode(code);
    expect(await loadAccounts()).toEqual(accounts);
    await expect(confirmRecoveryCode(newRecoveryCode())).rejects.toBeInstanceOf(WrongSecretError);
    await confirmRecoveryCode(first.recoveryCode);
    expect((await readVaultFile())!.wrappedKeys.filter((k) => k.kind === 'recovery')).toHaveLength(1);
  });

  it('잠금을 켜면 옛 스냅샷도 새 키로 다시 암호화되어 비밀번호로만 열린다', async () => {
    const accounts = [account(1)];
    await createVault(accounts);
    await addDrafts([draft(2)]);
    const before = await listSnapshots();
    expect(before.length).toBeGreaterThan(0);
    const oldFile = (await getSnapshot(before[0]!.id))!;
    const oldKey = await keyFromFile(oldFile);
    await enableLock('fake-pass-5678', FAST);

    const after = await listSnapshots();
    // 기존 스냅샷은 id 를 지키고, 잠금 직전 판이 하나 더 생긴다.
    expect(after).toHaveLength(before.length + 1);
    expect(before.every((s) => after.some((a) => a.id === s.id && a.takenAt === s.takenAt))).toBe(true);
    expect(after.every((s) => s.lock === 'password')).toBe(true);
    const vault = (await readVaultFile())!;
    for (const { id } of after) {
      const snap = (await getSnapshot(id))!;
      expect(snap.wrappedKeys.some((k) => k.kind === 'none')).toBe(false);
      expect(snap.wrappedKeys).toEqual(vault.wrappedKeys);
      await expect(decryptVault(snap, oldKey)).rejects.toThrow();
      const key = await keyFromFile(snap, { password: 'fake-pass-5678' });
      expect((await decryptVault(snap, key)).length).toBe(snap.count);
    }
  });

  it('복구 코드를 새로 만들면 옛 코드는 안 통하고 새 코드는 통한다', async () => {
    const { accounts, code } = await lockedVault();
    const next = newRecoveryCode();
    await replaceRecoveryCode(next);

    await lockNow();
    await expect(unlockWithRecoveryCode(code)).rejects.toBeInstanceOf(WrongSecretError);
    await unlockWithRecoveryCode(next);
    expect(await loadAccounts()).toEqual(accounts);
  });
});

describe('패스키(PRF)', () => {
  it('패스키 세션을 저장하는 동안 취소하면 풀린 키를 남기지 않는다', async () => {
    await lockedVault();
    await addPrfKey(fakePrf(), 'cred-1');
    await lockNow();
    const controller = new AbortController();
    const original = chrome.storage.session.set.bind(chrome.storage.session);
    const save = vi.spyOn(chrome.storage.session, 'set').mockImplementation(async (values) => {
      await original(values);
      if ('vaultKey' in values) controller.abort();
    });
    try {
      await expect(unlockWithPrf('cred-1', fakePrf(), { signal: controller.signal }))
        .rejects.toMatchObject({ name: 'AbortError' });
      expect(await getSessionKey()).toBeNull();
    } finally { save.mockRestore(); }
  });

  it('패스키 해제 중 명시적 잠금은 뒤에 실행되어 최종 잠금을 유지한다', async () => {
    await lockedVault();
    await addPrfKey(fakePrf(), 'cred-1');
    await lockNow();
    let lock: Promise<void> | undefined;
    const original = chrome.storage.session.set.bind(chrome.storage.session);
    const save = vi.spyOn(chrome.storage.session, 'set').mockImplementation(async (values) => {
      if ('vaultKey' in values) lock = lockNow();
      await original(values);
    });
    try {
      await unlockWithPrf('cred-1', fakePrf());
      await lock;
      expect(await getSessionKey()).toBeNull();
    } finally { save.mockRestore(); }
  });

  it('추가·풀기·제거', async () => {
    const { accounts } = await lockedVault();
    await addPrfKey(fakePrf(), 'cred-1');
    expect((await readVaultFile())!.lock).toBe('password+prf');
    await lockNow();
    await unlockWithPrf('cred-1', fakePrf());
    expect(await loadAccounts()).toEqual(accounts);

    await lockNow();
    await expect(unlockWithPrf('cred-1', new Uint8Array(32).fill(9))).rejects.toBeInstanceOf(
      WrongSecretError,
    );

    await unlockWithPassword('fake-pass-5678');
    await removePrfKey('cred-1');
    expect((await readVaultFile())!.lock).toBe('password');
  });
});

describe('자동 잠금', () => {
  it('15분 뒤에 잠긴다', async () => {
    await lockedVault();
    await saveSettings({ lockTiming: 15 });
    const t0 = 1_800_000_000_000;
    await touchActivity(t0);
    expect((await chrome.alarms.get('autolock'))!.scheduledTime).toBe(t0 + 15 * MIN);

    await checkAutolock(t0 + 14 * MIN);
    expect(await getSessionKey()).not.toBeNull();
    await checkAutolock(t0 + 15 * MIN);
    expect(await getSessionKey()).toBeNull();
  });

  it('알람 이벤트로도 잠긴다', async () => {
    await lockedVault();
    await saveSettings({ lockTiming: 5 });
    const t0 = Date.now() - 6 * MIN;
    await touchActivity(t0);
    (chrome.alarms.onAlarm as unknown as { dispatch: (a: unknown) => void }).dispatch({
      name: 'autolock',
      scheduledTime: t0 + 5 * MIN,
    });
    await vi.waitFor(async () => {
      expect(await getSessionKey()).toBeNull();
    });
  });

  it("'every' 는 마지막 연결이 끊기면 잠근다", async () => {
    await lockedVault();
    await saveSettings({ lockTiming: 'every' });
    const listeners = { disconnect: [] as Array<() => void>, message: [] as Array<() => void> };
    const port = {
      name: 'popout-ui',
      onDisconnect: { addListener: (fn: () => void) => void listeners.disconnect.push(fn) },
      onMessage: { addListener: (fn: () => void) => void listeners.message.push(fn) },
    };
    (chrome.runtime.onConnect as unknown as { dispatch: (p: unknown) => void }).dispatch(port);
    await vi.waitFor(() => expect(listeners.disconnect).toHaveLength(1));
    expect(await getSessionKey()).not.toBeNull();

    listeners.disconnect.forEach((fn) => fn());
    await vi.waitFor(async () => {
      expect(await getSessionKey()).toBeNull();
    });
  });

  it('마감 시각 표', () => {
    const t = 1_000_000;
    expect(autolockDeadline(5, t)).toBe(t + 5 * MIN);
    expect(autolockDeadline(60, t)).toBe(t + 60 * MIN);
    expect(autolockDeadline({ minutes: 0 }, t)).toBe(t + MIN);
    expect(autolockDeadline({ minutes: 7.9 }, t)).toBe(t + 7 * MIN);
    expect(autolockDeadline('every', t)).toBeNull();
    expect(autolockDeadline('browser-close', t)).toBeNull();
  });
});

describe('1회용 키', () => {
  it('한 번만 쓸 수 있고 만료되면 못 쓴다', async () => {
    await lockedVault();
    const token = await issueOneTimeKey();
    await clearSessionKey();
    await expect(loadAccounts()).rejects.toBeInstanceOf(LockedError);

    const key = await redeemOneTimeKey(token);
    const result = await addDrafts([draft(9)], undefined, Date.now(), { key });
    expect(result.added).toHaveLength(1);
    expect(await loadAccounts({ key })).toHaveLength(3);
    await expect(redeemOneTimeKey(token)).rejects.toBeInstanceOf(LockedError);

    await setSessionKey(key);
    const late = await issueOneTimeKey(1000);
    await expect(redeemOneTimeKey(late, Date.now() + 2000)).rejects.toBeInstanceOf(LockedError);
  });

  it('lockNow 가 남은 1회용 키를 지운다', async () => {
    await lockedVault();
    const token = await issueOneTimeKey();
    await lockNow();
    await expect(redeemOneTimeKey(token)).rejects.toBeInstanceOf(LockedError);
    await expect(issueOneTimeKey()).rejects.toBeInstanceOf(LockedError);
  });
});

describe('감사 반영', () => {
  it('같은 복구 코드를 동시에 두 번 써도 쓰기 잠금으로 차례로 처리되고 확인한 새 코드가 통한다', async () => {
    const { code } = await lockedVault();
    await lockNow();
    const results = await Promise.allSettled([unlockWithRecoveryCode(code), unlockWithRecoveryCode(code)]);
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
    const ok = results[0] as PromiseFulfilledResult<{ recoveryCode: string }>;
    await confirmRecoveryCode(ok.value.recoveryCode);
    await lockNow();
    await expect(unlockWithRecoveryCode(code)).rejects.toBeInstanceOf(WrongSecretError);
    await unlockWithRecoveryCode(ok.value.recoveryCode);
  });

  it('같은 1회용 토큰을 동시에 두 번 쓰면 하나만 통한다', async () => {
    await lockedVault();
    const token = await issueOneTimeKey();
    const results = await Promise.allSettled([redeemOneTimeKey(token), redeemOneTimeKey(token)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  });
});


describe('코드 사용할 때 기기 인증', () => {
  it('기본은 꺼져 있고 잠금과 등록된 패스키 없이 켤 수 없다', async () => {
    expect(await readCodeProtection()).toBe(false);
    await createVault([account(1)]);
    await expect(enableCodeProtection()).rejects.toThrow('codeProtection.setupFirst');
    await enableLock('fake-pass-5678', FAST);
    await expect(enableCodeProtection()).rejects.toThrow('codeProtection.setupFirst');
    await addPrfKey(fakePrf(), 'cred-1');
    await lockNow();
    await expect(enableCodeProtection()).rejects.toThrow('codeProtection.setupFirst');
    expect(await readCodeProtection()).toBe(false);
  });

  it('켜져 있으면 잠금을 끄거나 마지막 패스키를 없앨 수 없다', async () => {
    await lockedVault();
    await addPrfKey(fakePrf(), 'cred-1');
    await enableCodeProtection();
    expect(await readCodeProtection()).toBe(true);
    await expect(disableLock()).rejects.toThrow('codeProtection.disableFirst');
    await expect(removePrfKey('cred-1')).rejects.toThrow('codeProtection.disableFirst');
    expect((await readVaultFile())!.wrappedKeys.some((k) => k.credId === 'cred-1')).toBe(true);
    await addPrfKey(new Uint8Array(32).fill(8), 'cred-2');
    await removePrfKey('cred-1');
    expect((await readVaultFile())!.wrappedKeys.filter((k) => k.kind === 'prf')).toHaveLength(1);
  });

  it('기기 분실 복구는 마스터 비밀번호를 실제로 확인한 뒤 보호만 끈다', async () => {
    await lockedVault();
    await addPrfKey(fakePrf(), 'cred-1');
    await enableCodeProtection();
    await chrome.storage.session.set({ codeAccessRequests: { fake: { expiresAt: Date.now() + MIN } } });
    await expect(disableCodeProtectionWithPassword('wrong-pass')).rejects.toBeInstanceOf(WrongSecretError);
    expect(await readCodeProtection()).toBe(true);
    await disableCodeProtectionWithPassword('fake-pass-5678');
    expect(await readCodeProtection()).toBe(false);
    expect((await chrome.storage.session.get('codeAccessRequests')).codeAccessRequests).toBeUndefined();
    expect((await readVaultFile())!.lock).toBe('password+prf');
    await disableLock();
    expect((await readVaultFile())!.lock).toBe('none');
  });

  it('잠그면 진행 중인 코드 인증 요청도 버린다', async () => {
    await lockedVault();
    await chrome.storage.session.set({ codeAccessRequests: { fake: { expiresAt: Date.now() + MIN } } });
    await lockNow();
    expect((await chrome.storage.session.get('codeAccessRequests')).codeAccessRequests).toBeUndefined();
  });
});
