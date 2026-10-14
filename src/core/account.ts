// 계정 초안·알고리즘 대응·중복 판정. 브라우저 API 를 쓰지 않는다.
import { encodeHex } from './base32';
import type { Account, Algorithm } from './types';

export type AccountDraft = Pick<
  Account,
  'type' | 'issuer' | 'label' | 'secret' | 'algorithm' | 'digits' | 'period' | 'counter'
>;

export type DraftInput = Pick<AccountDraft, 'type' | 'issuer' | 'label' | 'secret' | 'algorithm'> & {
  digits?: number;
  period?: number;
  counter?: number;
};

export class UnsupportedAlgorithmError extends Error {
  constructor(name: string) {
    super(`unsupported algorithm: ${name}`);
    this.name = 'UnsupportedAlgorithmError';
  }
}

export function newAccount(draft: AccountDraft, now: number = Date.now()): Account {
  return {
    id: crypto.randomUUID(),
    type: draft.type,
    issuer: draft.issuer,
    label: draft.label,
    secret: draft.secret,
    algorithm: draft.algorithm,
    digits: draft.digits,
    period: draft.period,
    ...(draft.counter !== undefined ? { counter: draft.counter } : {}),
    note: '',
    pinned: false,
    matchHosts: [],
    createdAt: now,
    updatedAt: now,
  };
}

const BY_NAME: Record<string, Algorithm> = {
  SHA1: 'SHA-1',
  'SHA-1': 'SHA-1',
  SHA256: 'SHA-256',
  'SHA-256': 'SHA-256',
  SHA512: 'SHA-512',
  'SHA-512': 'SHA-512',
};

// 원본 인증 도구 백업의 열거값. 4(MD5)·5 는 지원하지 않는다.
const BY_NUMBER: Record<number, Algorithm> = {
  1: 'SHA-1',
  2: 'SHA-256',
  3: 'SHA-512',
};

const UNSUPPORTED_NAMES = new Set(['GOST3411_2012_256', 'GOST3411_2012_512', 'MD5']);
const UNSUPPORTED_NUMBERS: Record<number, string> = { 4: 'MD5', 5: 'GOST3411_2012_256' };

// 모르는 값을 SHA-1 로 바꾸지 않는다(원본 버그 #1593).
export function algorithmFrom(value: string | number): Algorithm {
  if (typeof value === 'number') {
    const found = BY_NUMBER[value];
    if (found) return found;
    const name = UNSUPPORTED_NUMBERS[value];
    if (name) throw new UnsupportedAlgorithmError(`${name} (${value})`);
    throw new Error(`unknown algorithm: ${value}`);
  }
  const key = value.replace(/\s+/g, '').toUpperCase();
  const found = BY_NAME[key];
  if (found) return found;
  if (UNSUPPORTED_NAMES.has(key)) throw new UnsupportedAlgorithmError(key);
  throw new Error(`unknown algorithm: ${value}`);
}

export function checkDraft(draft: AccountDraft): void {
  if (!(draft.secret instanceof Uint8Array) || draft.secret.length < 1) {
    throw new Error('secret must have at least 1 byte');
  }
  if (!Number.isInteger(draft.digits) || draft.digits < 6 || draft.digits > 10) {
    throw new Error('digits must be an integer from 6 to 10');
  }
  if (!Number.isInteger(draft.period) || draft.period < 1 || draft.period > 3600) {
    throw new Error('period must be an integer from 1 to 3600');
  }
  if (draft.type === 'hotp') {
    const c = draft.counter;
    if (c === undefined || !Number.isSafeInteger(c) || c < 0) {
      throw new Error('counter must be a non-negative integer');
    }
  }
}

// 기본값을 채우고 형식별 고정값(steam: 6자리·30초, battle: 8자리·30초, 둘 다 SHA-1)을 적용한 뒤 검사한다.
export function makeDraft(input: DraftInput): AccountDraft {
  let { algorithm, digits, period } = input;
  digits = digits ?? 6;
  period = period ?? 30;
  if (input.type === 'steam') {
    algorithm = 'SHA-1';
    digits = 6;
    period = 30;
  } else if (input.type === 'battle') {
    algorithm = 'SHA-1';
    digits = 8;
    period = 30;
  }
  const draft: AccountDraft = {
    type: input.type,
    issuer: input.issuer,
    label: input.label,
    secret: input.secret,
    algorithm,
    digits,
    period,
    ...(input.type === 'hotp' ? { counter: input.counter ?? 0 } : {}),
  };
  checkDraft(draft);
  return draft;
}

export function duplicateKey(draft: Pick<AccountDraft, 'type' | 'secret'>): string {
  return `${draft.type}:${encodeHex(draft.secret)}`;
}

export function dedupe(
  existing: Pick<Account, 'type' | 'secret' | 'deletedAt'>[],
  incoming: AccountDraft[],
): { fresh: AccountDraft[]; duplicates: number } {
  const seen = new Set<string>();
  for (const account of existing) {
    if (account.deletedAt === undefined) seen.add(duplicateKey(account));
  }
  const fresh: AccountDraft[] = [];
  let duplicates = 0;
  for (const draft of incoming) {
    const key = duplicateKey(draft);
    if (seen.has(key)) {
      duplicates++;
    } else {
      seen.add(key);
      fresh.push(draft);
    }
  }
  return { fresh, duplicates };
}
