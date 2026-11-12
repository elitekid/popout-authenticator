// 만든 내보내기 결과를 다시 해석해 계정과 대조한다("만든 직후 다시 해석해 N개 중 N개").
import { duplicateKey, type AccountDraft } from '../account';
import { decodeMigration } from '../migration';
import type { Account } from '../types';
import { parseLinks } from '../uri';
import { readCxf } from './cxf';
import { readOwnBackup } from './own';

export type ExportKind = 'own-plain' | 'own-encrypted' | 'otpauth-text' | 'cxf' | 'google-batch';

export type VerifyResult = { expected: number; found: number; missing: string[] };

type Comparable = Pick<
  AccountDraft,
  'type' | 'secret' | 'algorithm' | 'digits' | 'period' | 'counter' | 'label'
>;

// 같음 판정: 종류+비밀키, 알고리즘, 자릿수, totp 는 주기, hotp 는 카운터.
function signature(a: Comparable): string {
  const tail = a.type === 'hotp' ? `c${a.counter ?? 0}` : `p${a.period}`;
  return `${duplicateKey(a)}|${a.algorithm}|${a.digits}|${tail}`;
}

// 각 형식이 표현하지 못해 skipped 되는 계정은 기대 집합에서 뺀다.
function representable(kind: ExportKind, a: Account): boolean {
  switch (kind) {
    case 'own-plain':
    case 'own-encrypted':
      return true;
    case 'otpauth-text':
      return a.type === 'totp' || a.type === 'hotp';
    case 'cxf':
      return a.type === 'totp';
    case 'google-batch':
      return (
        (a.type === 'totp' || a.type === 'hotp') &&
        (a.digits === 6 || a.digits === 8) &&
        a.period === 30
      );
  }
}

async function reread(
  kind: ExportKind,
  output: string | string[],
  password: string | undefined,
): Promise<Comparable[]> {
  const joined = Array.isArray(output) ? output.join('\n') : output;
  switch (kind) {
    case 'own-plain':
    case 'own-encrypted':
      return readOwnBackup(joined, password);
    case 'otpauth-text':
      return parseLinks(joined, Number.MAX_SAFE_INTEGER).drafts;
    case 'cxf':
      return readCxf(joined);
    case 'google-batch': {
      const uris = Array.isArray(output) ? output : output.split(/\s+/).filter((s) => s !== '');
      return uris.flatMap((uri) => decodeMigration(uri).drafts);
    }
  }
}

export async function verifyExport(
  accounts: Account[],
  kind: ExportKind,
  output: string | string[],
  password?: string,
): Promise<VerifyResult> {
  const expected = accounts.filter((a) => a.deletedAt === undefined && representable(kind, a));
  const available = new Map<string, number>();
  for (const item of await reread(kind, output, password)) {
    const key = signature(item);
    available.set(key, (available.get(key) ?? 0) + 1);
  }

  const missing: string[] = [];
  let found = 0;
  for (const a of expected) {
    const key = signature(a);
    const left = available.get(key) ?? 0;
    if (left > 0) {
      available.set(key, left - 1);
      found++;
    } else {
      missing.push(a.label);
    }
  }
  return { expected: expected.length, found, missing };
}
