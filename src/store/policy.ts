// 원본 인증 도구(MIT)의 managed_schema 키를 그대로 받는다. storageArea 는 계획 0장대로 '동기화 강제 켬/끔'으로 읽는다(주 저장은 local 고정, 어느 저장소도 비우지 않음).
import type { Settings } from '../core/types';

export type Policy = {
  storageArea?: 'sync' | 'local';
  disableBackup: boolean;
  disableExport: boolean;
  enforcePassword: boolean;
  enforceAutolock?: number; // 분
  passwordPolicy?: RegExp;
  passwordPolicyHint?: string;
  feedbackURL?: string;
};

export const NO_POLICY: Policy = {
  disableBackup: false,
  disableExport: false,
  enforcePassword: false,
};

const MAX_AUTOLOCK_MINUTES = 1440;
const READ_TIMEOUT_MS = 1000;

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

export function normalizePolicy(raw: unknown): Policy {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return NO_POLICY;
  const r = raw as Record<string, unknown>;
  const policy: Policy = {
    disableBackup: r.disableBackup === true,
    disableExport: r.disableExport === true,
    enforcePassword: r.enforcePassword === true,
  };
  if (r.storageArea === 'sync' || r.storageArea === 'local') policy.storageArea = r.storageArea;
  if (typeof r.enforceAutolock === 'number' && Number.isFinite(r.enforceAutolock) && r.enforceAutolock > 0) {
    policy.enforceAutolock = Math.min(r.enforceAutolock, MAX_AUTOLOCK_MINUTES);
  }
  const pattern = nonEmptyString(r.passwordPolicy);
  if (pattern !== undefined) {
    try {
      policy.passwordPolicy = new RegExp(pattern);
    } catch {
      // 잘못된 정규식은 무시한다.
    }
  }
  const hint = nonEmptyString(r.passwordPolicyHint);
  if (hint !== undefined) policy.passwordPolicyHint = hint;
  const url = nonEmptyString(r.feedbackURL);
  if (url !== undefined) {
    try {
      const { protocol } = new URL(url);
      if (protocol === 'https:' || protocol === 'http:') policy.feedbackURL = url;
    } catch {
      // URL 로 읽히지 않으면 무시한다.
    }
  }
  return policy;
}

// 페이지·서비스 워커마다 한 번만 읽는다. 진행 중인 Promise 를 같이 쓴다.
let cached: Promise<Policy> | null = null;
let subscribed = false;

// ok 가 거짓(시간 초과·오류)이면 이번만 정책 없음으로 보고 캐시하지 않는다(다음 읽기에서 다시 묻는다).
async function readManaged(): Promise<{ policy: Policy; ok: boolean }> {
  const area = chrome.storage.managed;
  if (!area) return { policy: NO_POLICY, ok: true };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), READ_TIMEOUT_MS);
    });
    const raw = await Promise.race([area.get(null), timeout]);
    return raw === null ? { policy: NO_POLICY, ok: false } : { policy: normalizePolicy(raw), ok: true };
  } catch {
    return { policy: NO_POLICY, ok: false };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

const watchers = new Set<() => void>();

// 정책이 바뀌면 캐시를 비우고 구독자에게 알린다. 페이지 수명 동안 수신기는 하나만 둔다.
function subscribe(): void {
  if (subscribed) return;
  subscribed = true;
  chrome.storage.onChanged?.addListener((_changes, areaName) => {
    if (areaName !== 'managed') return;
    cached = null;
    for (const fn of [...watchers]) fn();
  });
}

// managed 정책이 바뀔 때마다 부른다. 받은 쪽은 readPolicy() 로 새 값을 읽는다. 반환값으로 구독을 끊는다.
export function onPolicyChanged(fn: () => void): () => void {
  subscribe();
  watchers.add(fn);
  return () => void watchers.delete(fn);
}

export function readPolicy(): Promise<Policy> {
  subscribe();
  if (!cached) {
    const mine: Promise<Policy> = readManaged().then(({ policy, ok }) => {
      if (!ok && cached === mine) cached = null;
      return policy;
    });
    cached = mine;
  }
  return cached;
}

export function applyPolicy(settings: Settings, policy: Policy): Settings {
  const next: Settings = { ...settings };
  if (policy.storageArea !== undefined) next.syncEnabled = policy.storageArea === 'sync';
  if (policy.enforceAutolock !== undefined) next.lockTiming = { minutes: policy.enforceAutolock };
  return next;
}

export function passwordMeetsPolicy(policy: Policy, password: string): boolean {
  return policy.passwordPolicy === undefined || policy.passwordPolicy.test(password);
}

export function isForced(policy: Policy, key: 'syncEnabled' | 'lockTiming'): boolean {
  return key === 'syncEnabled' ? policy.storageArea !== undefined : policy.enforceAutolock !== undefined;
}
