// otpauth:// 링크 글(한 줄에 하나). 휴지통 계정은 넣지 않는다.
import { buildOtpauth } from '../uri';
import type { Account } from '../types';

export function buildOtpauthText(accounts: Account[]): { text: string; skipped: string[] } {
  const lines: string[] = [];
  const skipped: string[] = [];
  for (const account of accounts) {
    if (account.deletedAt !== undefined) continue;
    const link = buildOtpauth(account);
    if (link === null) skipped.push(account.label);
    else lines.push(link);
  }
  return { text: lines.length > 0 ? `${lines.join('\n')}\n` : '', skipped };
}
