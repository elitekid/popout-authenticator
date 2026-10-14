import { compareBackupAccounts, parseComparisonBackup, type BackupComparison } from './backup-compare';
import { WrongSecretError } from './crypto/errors';
import { NeedsPasswordError } from './import';
import type { Account } from './types';

export type CompareRequest = { text: string; password?: string; current: Account[] };
export type CompareResponse =
  | { kind: 'result'; result: BackupComparison }
  | { kind: 'password' | 'wrong' | 'error' };

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<CompareRequest>) => void) | null;
  postMessage: (response: CompareResponse) => void;
};

// Argon2·큰 JSON이 화면 입력·취소를 막지 않게 한다. 페이지가 terminate하면 계산도 중지된다.
scope.onmessage = async ({ data }) => {
  let parsed: Awaited<ReturnType<typeof parseComparisonBackup>> | undefined;
  try {
    parsed = await parseComparisonBackup(data.text, data.password);
    scope.postMessage({ kind: 'result', result: compareBackupAccounts(data.current, parsed.accounts, parsed) });
  } catch (error) {
    scope.postMessage({ kind: error instanceof NeedsPasswordError ? 'password' : error instanceof WrongSecretError ? 'wrong' : 'error' });
  } finally {
    parsed?.accounts.forEach((a) => a.secret.fill(0));
    data.current.forEach((a) => a.secret.fill(0));
    data.text = '';
    data.password = undefined;
  }
};
