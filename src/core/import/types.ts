// 가져오기 해석 결과·오류. 브라우저 API 를 쓰지 않는다.
import type { AccountDraft } from '../account';

export type ImportFailure = { source: string; reason: string };

export type ImportMeta = { pinned?: boolean; group?: string; note?: string; matchHosts?: string[]; iconId?: string; iconImage?: string };

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

// 'encrypted': 남의 앱이 우리가 못 여는 방식으로 암호화한 파일. 그 앱에서 평문으로 내보내야 한다.
// 'damaged': 그 앱의 암호 백업 모양인데 손상됐거나 우리가 받지 않는 값(지나친 KDF 비용 등)이다. 비밀번호 탓이 아니다.
// 'steamManifest': SDA 의 manifest.json(비밀키 없음). 같은 폴더의 .maFile 을 골라야 한다.
export type ImportRejectReason = 'encrypted' | 'unknown' | 'damaged' | 'steamManifest';

export class ImportRejectedError extends Error {
  readonly reason: ImportRejectReason;
  readonly app?: string;

  constructor(reason: ImportRejectReason, app?: string, detail?: string) {
    super(
      reason === 'encrypted'
        ? `encrypted ${app ?? ''} backup`.replace('  ', ' ')
        : reason === 'damaged'
          ? `damaged ${app ?? ''} backup${detail ? `: ${detail}` : ''}`.replace('  ', ' ')
          : reason === 'steamManifest'
            ? 'steam desktop authenticator manifest'
            : 'unknown import format',
    );
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

// 다른 앱 백업의 사이트 목록을 우리 matchHosts 모양(소문자 호스트, 끝 점·www. 없음)으로 바꾼다.
// 호스트로 읽히지 않는 값은 버리고, 같은 값은 한 번만, 최대 20개.
export function importHosts(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const raw of value) {
    if (typeof raw !== 'string') continue;
    const s = raw.trim();
    if (s === '' || s.length > 253) continue;
    let host: string;
    try {
      host = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`).hostname;
    } catch {
      continue;
    }
    host = host.toLowerCase().replace(/\.+$/, '');
    if (host.startsWith('www.') && host.length > 4) host = host.slice(4);
    if (host === '' || out.includes(host)) continue;
    out.push(host);
    if (out.length >= 20) break;
  }
  return out;
}
