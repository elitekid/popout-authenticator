// FIDO Credential Exchange Format(CXF) JSON 쓰기·읽기. totp 자격 증명만 다룬다.
import { makeDraft, type AccountDraft } from '../account';
import { encodeBase32, parseSecret } from '../base32';
import type { ImportFailure } from '../import/types';
import type { Account, Algorithm } from '../types';

type CxfCredential = {
  type: 'totp';
  secret: string;
  period: number;
  digits: number;
  username?: string;
  algorithm: 'sha1' | 'sha256' | 'sha512';
  issuer?: string;
};

type CxfItem = {
  id: string;
  creationAt: number;
  modifiedAt: number;
  type: 'login';
  title: string;
  credentials: CxfCredential[];
};

type CxfFile = {
  version: { major: 1; minor: 0 };
  exporterRpId: string;
  exporterDisplayName: string;
  timestamp: number;
  accounts: {
    id: string;
    username: string;
    email: string;
    fullName: string;
    collections: unknown[];
    items: CxfItem[];
  }[];
};

const WRITE_ALGORITHM: Record<Algorithm, CxfCredential['algorithm']> = {
  'SHA-1': 'sha1',
  'SHA-256': 'sha256',
  'SHA-512': 'sha512',
};
const READ_ALGORITHM: Record<string, Algorithm> = {
  sha1: 'SHA-1',
  'sha-1': 'SHA-1',
  sha256: 'SHA-256',
  'sha-256': 'SHA-256',
  sha512: 'SHA-512',
  'sha-512': 'SHA-512',
};

export function buildCxf(
  accounts: Account[],
  nowMs: number = Date.now(),
): { text: string; skipped: string[] } {
  const items: CxfItem[] = [];
  const skipped: string[] = [];
  for (const a of accounts) {
    if (a.deletedAt !== undefined) continue;
    if (a.type !== 'totp') {
      skipped.push(a.label);
      continue;
    }
    items.push({
      id: a.id,
      creationAt: Math.floor(a.createdAt / 1000),
      modifiedAt: Math.floor(a.updatedAt / 1000),
      type: 'login',
      title: a.issuer !== '' ? a.issuer : a.label,
      credentials: [
        {
          type: 'totp',
          secret: encodeBase32(a.secret),
          period: a.period,
          digits: a.digits,
          username: a.label,
          algorithm: WRITE_ALGORITHM[a.algorithm],
          ...(a.issuer !== '' ? { issuer: a.issuer } : {}),
        },
      ],
    });
  }
  const file: CxfFile = {
    version: { major: 1, minor: 0 },
    exporterRpId: 'popout-authenticator',
    exporterDisplayName: 'Popout Authenticator',
    timestamp: Math.floor(nowMs / 1000),
    accounts: [{ id: 'popout-authenticator', username: '', email: '', fullName: '', collections: [], items }],
  };
  return { text: JSON.stringify(file, null, 2), skipped };
}

function asObject(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parse(text: string): Record<string, unknown> | null {
  try {
    return asObject(JSON.parse(text));
  } catch {
    return null;
  }
}

// 두 모양을 읽는다: 규격(머리 아래 accounts[].items)과 기준 확장 1.13 의 평평한 모양(머리에 바로 items, version 숫자·exporter 글자).
function itemLists(root: Record<string, unknown>): unknown[][] {
  if (Array.isArray(root.items)) return [root.items];
  if (!Array.isArray(root.accounts)) return [];
  return root.accounts.map((a) => asObject(a)?.items).filter((items): items is unknown[] => Array.isArray(items));
}

export function isCxf(text: string): boolean {
  const root = parse(text);
  if (!root) return false;
  if (Array.isArray(root.items)) return typeof root.version === 'number' && typeof root.exporter === 'string';
  if (asObject(root.version) === null || !Array.isArray(root.accounts)) return false;
  return root.accounts.every((a) => {
    const account = asObject(a);
    return account !== null && Array.isArray(account.items);
  });
}

export function readCxf(text: string): AccountDraft[] {
  return readCxfWithFailures(text).drafts;
}

// 읽지 못한 totp 항목은 다른 가져오기 형식처럼 failed 로 돌려준다.
export function readCxfWithFailures(text: string): { drafts: AccountDraft[]; failed: ImportFailure[] } {
  const root = parse(text);
  if (!root || (!Array.isArray(root.accounts) && !Array.isArray(root.items))) throw new Error('not a CXF file');
  const drafts: AccountDraft[] = [];
  const failed: ImportFailure[] = [];
  for (const items of itemLists(root)) {
    for (const rawItem of items) {
      const item = asObject(rawItem);
      if (!item || !Array.isArray(item.credentials)) continue;
      const title = typeof item.title === 'string' ? item.title.trim() : '';
      const subtitle = typeof item.subtitle === 'string' ? item.subtitle.trim() : '';
      for (const rawCred of item.credentials) {
        const cred = asObject(rawCred);
        if (!cred || cred.type !== 'totp' || typeof cred.secret !== 'string') continue;
        try {
          const algorithmText = typeof cred.algorithm === 'string' ? cred.algorithm.toLowerCase() : 'sha1';
          const algorithm = READ_ALGORITHM[algorithmText];
          if (!algorithm) throw new Error(`unsupported algorithm: ${algorithmText}`);
          const username = (typeof cred.username === 'string' ? cred.username.trim() : '') || subtitle;
          const issuer =
            (typeof cred.issuer === 'string' ? cred.issuer.trim() : '') || (title !== username ? title : '');
          drafts.push(
            makeDraft({
              type: 'totp',
              issuer,
              label: username !== '' ? username : title,
              secret: parseSecret(cred.secret),
              algorithm,
              ...(typeof cred.digits === 'number' ? { digits: cred.digits } : {}),
              ...(typeof cred.period === 'number' ? { period: cred.period } : {}),
            }),
          );
        } catch (e) {
          failed.push({ source: title.slice(0, 60), reason: e instanceof Error ? e.message : String(e) });
        }
      }
    }
  }
  return { drafts, failed };
}
