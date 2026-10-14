import type { AccountDraft } from './account';
import { encodeHex } from './base32';
import { isOwnBackup, readOwnBackup } from './export/own';
import { importText, NeedsPasswordError } from './import';
import type { Account } from './types';

export type CompareAccount = AccountDraft & { id?: string; deletedAt?: number };
export type AuthenticationField = 'secret' | 'type' | 'algorithm' | 'digits' | 'period' | 'counter';
export type ComparisonStatus = 'same' | 'missing' | 'changed' | 'uncertain';
type Name = { issuer: string; label: string };
export type ComparisonRow = Name & {
  id: string;
  status: ComparisonStatus;
  reason?: 'nameCandidate' | 'ambiguous';
  fields: AuthenticationField[];
};
export type BackupComparison = {
  rows: ComparisonRow[];
  backupOnly: Name[];
  counts: Record<ComparisonStatus, number>;
  failedCount: number;
};

export async function parseComparisonBackup(text: string, password?: string): Promise<{
  accounts: CompareAccount[]; ownIds: boolean; failedCount: number;
}> {
  const trimmed = text.replace(/^\uFEFF/, '').trim();
  if (isOwnBackup(trimmed)) {
    const head = JSON.parse(trimmed) as { encrypted?: boolean };
    if (head.encrypted === true && password === undefined) throw new NeedsPasswordError();
    return { accounts: await readOwnBackup(trimmed, password), ownIds: true, failedCount: 0 };
  }
  const parsed = await importText(trimmed, password);
  // 실패 source/reason 은 비밀키나 원문 링크를 포함할 수 있어 대조 결과에 담지 않는다.
  return { accounts: parsed.drafts, ownIds: false, failedCount: parsed.failed.length };
}

type Group = { first: number; count: number };
type Index = Map<string, Group>;
function index(keys: (string | null)[], excluded: Set<number>): Index {
  const map: Index = new Map();
  keys.forEach((key, i) => {
    if (key === null || excluded.has(i)) return;
    const group = map.get(key);
    if (group) group.count++;
    else map.set(key, { first: i, count: 1 });
  });
  return map;
}
function nameKey(account: CompareAccount): string | null {
  const issuer = account.issuer.normalize('NFKC').trim().toLowerCase();
  const label = account.label.normalize('NFKC').trim().toLowerCase();
  // 이름이 없는 계정끼리는 같은 계정이라는 근거가 없다.
  return issuer === '' && label === '' ? null : JSON.stringify([issuer, label]);
}
function differences(a: CompareAccount, b: CompareAccount, sameSecret: boolean): AuthenticationField[] {
  const fields: AuthenticationField[] = [];
  if (!sameSecret) fields.push('secret');
  if (a.type !== b.type) fields.push('type');
  if (a.algorithm !== b.algorithm) fields.push('algorithm');
  if (a.digits !== b.digits) fields.push('digits');
  if (a.type === 'hotp' || b.type === 'hotp') {
    if (a.counter !== b.counter) fields.push('counter');
  }
  if (a.type !== 'hotp' || b.type !== 'hotp') {
    if (a.period !== b.period) fields.push('period');
  }
  return fields;
}

// ID → 키/이름 인덱스로 연결한다. 반환값에는 인증키와 원문 파일을 절대 넣지 않는다.
// 후보 그룹은 count/first 만 보관하므로 중복된 키가 수천 개여도 교차 탐색하지 않는다.
export function compareBackupAccounts(
  current: Account[],
  backup: CompareAccount[],
  options: { ownIds?: boolean; failedCount?: number } = {},
): BackupComparison {
  const live = current.filter((a) => a.deletedAt === undefined);
  const saved = backup.filter((a) => a.deletedAt === undefined);
  const currentKeys = live.map((a) => encodeHex(a.secret));
  const backupKeys = saved.map((a) => encodeHex(a.secret));
  const currentNames = live.map(nameKey);
  const backupNames = saved.map(nameKey);
  const rows: (ComparisonRow | undefined)[] = Array(live.length);
  const doneCurrent = new Set<number>();
  const doneBackup = new Set<number>();
  const name = (a: CompareAccount): Name => ({ issuer: a.issuer, label: a.label });
  const row = (i: number, status: ComparisonStatus, fields: AuthenticationField[] = [], reason?: ComparisonRow['reason']): ComparisonRow => ({
    ...name(live[i]!), id: live[i]!.id, status, fields, ...(reason ? { reason } : {}),
  });
  const match = (i: number, j: number) => {
    const fields = differences(live[i]!, saved[j]!, currentKeys[i] === backupKeys[j]);
    rows[i] = row(i, fields.length === 0 ? 'same' : 'changed', fields);
    doneCurrent.add(i);
    doneBackup.add(j);
  };

  if (options.ownIds) {
    const currentIds = live.map((a) => a.id || null);
    const backupIds = saved.map((a) => a.id || null);
    const ci = index(currentIds, doneCurrent);
    const bi = index(backupIds, doneBackup);
    const disputed = new Set<string>();
    live.forEach((a, i) => {
      const b = bi.get(a.id);
      if (!b) return;
      if (ci.get(a.id)!.count === 1 && b.count === 1) match(i, b.first);
      else {
        rows[i] = row(i, 'uncertain', [], 'ambiguous');
        doneCurrent.add(i);
        disputed.add(a.id);
      }
    });
    backupIds.forEach((id, i) => { if (id !== null && disputed.has(id)) doneBackup.add(i); });
  }

  const ck = index(currentKeys, doneCurrent);
  const bk = index(backupKeys, doneBackup);
  const cn = index(currentNames, doneCurrent);
  const bn = index(backupNames, doneBackup);
  const touchedKeys = new Set<string>();
  const touchedNames = new Set<string>();
  const claims = new Map<number, number>();
  type Candidate = { key?: Group; name?: Group; ambiguous: boolean };
  const candidates = new Map<number, Candidate>();
  live.forEach((_a, i) => {
    if (doneCurrent.has(i)) return;
    const k = currentKeys[i]!;
    const n = currentNames[i]!;
    const key = bk.get(k);
    const byName = n === null ? undefined : bn.get(n);
    if (key) touchedKeys.add(k);
    if (byName && n !== null) touchedNames.add(n);
    const ambiguous = Boolean(
      (key && (key.count !== 1 || ck.get(k)!.count !== 1)) ||
      (byName && (byName.count !== 1 || cn.get(n!)!.count !== 1)) ||
      (key && byName && key.first !== byName.first),
    );
    candidates.set(i, { key, name: byName, ambiguous });
    if (key?.count === 1) claims.set(key.first, (claims.get(key.first) ?? 0) + 1);
    if (byName?.count === 1 && byName.first !== key?.first) {
      claims.set(byName.first, (claims.get(byName.first) ?? 0) + 1);
    }
  });
  candidates.forEach(({ key, name: byName, ambiguous }, i) => {
    const conflict = (key && (claims.get(key.first) ?? 0) > 1) ||
      (byName && (claims.get(byName.first) ?? 0) > 1);
    if (ambiguous || conflict) rows[i] = row(i, 'uncertain', [], 'ambiguous');
    else if (key) match(i, key.first);
    else if (byName) {
      rows[i] = row(i, 'uncertain', differences(live[i]!, saved[byName.first]!, false), 'nameCandidate');
    } else rows[i] = row(i, 'missing');
  });

  const backupOnly = saved.flatMap((a, i) => {
    if (doneBackup.has(i) || touchedKeys.has(backupKeys[i]!) ||
      (backupNames[i] !== null && touchedNames.has(backupNames[i]!))) return [];
    return [name(a)];
  });
  const counts: BackupComparison['counts'] = { same: 0, missing: 0, changed: 0, uncertain: 0 };
  const result = rows as ComparisonRow[];
  result.forEach((r) => counts[r.status]++);
  return { rows: result, backupOnly, counts, failedCount: options.failedCount ?? 0 };
}
