// 가져오기 해석 결과·오류. 브라우저 API 를 쓰지 않는다.
import type { AccountDraft } from '../account';

export type ImportFailure = { source: string; reason: string };

export type ImportMeta = { pinned?: boolean; group?: string; note?: string; matchHosts?: string[] };

export type ImportOutcome = {
  drafts: AccountDraft[];
  failed: ImportFailure[];
  meta?: ImportMeta[]; // drafts 와 같은 순서
  format: string;
};

// 암호화된 파일인데 비밀번호가 없음.
export class NeedsPasswordError extends Error {
  constructor(message = 'password required') {
    super(message);
    this.name = 'NeedsPasswordError';
  }
}

// 'encrypted': 남의 앱이 자기 비밀번호로 암호화한 파일. 그 앱에서 평문으로 내보내야 한다.
export class ImportRejectedError extends Error {
  readonly reason: 'encrypted' | 'unknown';
  readonly app?: string;

  constructor(reason: 'encrypted' | 'unknown', app?: string) {
    super(reason === 'encrypted' ? `encrypted ${app ?? ''} backup`.replace('  ', ' ') : 'unknown import format');
    this.name = 'ImportRejectedError';
    this.reason = reason;
    if (app !== undefined) this.app = app;
  }
}

// 파싱 도중 쌓는 도우미: drafts·meta 를 같은 순서로 유지한다.
export class Collector {
  readonly drafts: AccountDraft[] = [];
  readonly failed: ImportFailure[] = [];
  readonly meta: ImportMeta[] = [];

  add(draft: AccountDraft, meta: ImportMeta = {}): void {
    this.drafts.push(draft);
    this.meta.push(meta);
  }

  fail(source: string, error: unknown): void {
    this.failed.push({ source: source.slice(0, 60), reason: error instanceof Error ? error.message : String(error) });
  }

  outcome(format: string): ImportOutcome {
    return { drafts: this.drafts, failed: this.failed, meta: this.meta, format };
  }
}

export type Json = Record<string, unknown>;

export function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function asString(value: unknown): string {
  return typeof value === 'string' ? value : value === undefined || value === null ? '' : String(value);
}

// 숫자 또는 숫자 문자열. 없으면 undefined.
export function asInt(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === 'string' && /^\s*\d+\s*$/.test(value)) return Number(value);
  return undefined;
}
