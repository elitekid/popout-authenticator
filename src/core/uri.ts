// otpauth:// 링크 해석·생성. 브라우저 API 를 쓰지 않는다.
import { algorithmFrom, makeDraft, type AccountDraft } from './account';
import { encodeBase32, parseSecret } from './base32';
import { decodeMigration } from './migration';
import { splitTypePrefix } from './otp';
import type { AccountType } from './types';

const OTPAUTH = 'otpauth://';
const MIGRATION = 'otpauth-migration://';
const ALGORITHM_NAME = { 'SHA-1': 'SHA1', 'SHA-256': 'SHA256', 'SHA-512': 'SHA512' } as const;

function intParam(params: URLSearchParams, name: string): number | undefined {
  const raw = params.get(name);
  if (raw === null || raw.trim() === '') return undefined;
  const text = raw.trim();
  if (!/^\d+$/.test(text)) throw new Error(`${name} must be an integer`);
  return Number(text);
}

export function parseOtpauth(uri: string): AccountDraft {
  const text = uri.trim();
  if (!text.toLowerCase().startsWith(OTPAUTH)) throw new Error('not an otpauth link');
  const hash = text.indexOf('#');
  const body = text.slice(OTPAUTH.length, hash >= 0 ? hash : undefined);
  const q = body.indexOf('?');
  const path = q >= 0 ? body.slice(0, q) : body;
  const params = new URLSearchParams(q >= 0 ? body.slice(q + 1) : '');

  const slash = path.indexOf('/');
  const typeText = (slash >= 0 ? path.slice(0, slash) : path).toLowerCase();
  if (typeText !== 'totp' && typeText !== 'hotp' && typeText !== 'steam') {
    throw new Error(`unsupported otpauth type: ${typeText}`);
  }
  // 퍼센트 디코딩 전에 첫 ':' 로 나눠야 이름 안의 %3A 가 구분자로 오해되지 않는다.
  const encodedLabel = slash >= 0 ? path.slice(slash + 1) : '';
  const colon = encodedLabel.indexOf(':');
  let issuer = '';
  let label: string;
  try {
    if (colon >= 0) {
      issuer = decodeURIComponent(encodedLabel.slice(0, colon)).trim();
      label = decodeURIComponent(encodedLabel.slice(colon + 1)).trim();
    } else {
      label = decodeURIComponent(encodedLabel).trim();
    }
  } catch {
    throw new Error('invalid label encoding');
  }
  const issuerParam = params.get('issuer');
  if (issuerParam !== null && issuerParam.trim() !== '') {
    issuer = issuerParam.trim();
    // 구분자까지 인코딩한 다른 앱의 링크("Issuer%3Aname")는 발급자 접두를 떼어 낸다.
    if (colon < 0 && label.startsWith(`${issuer}:`)) label = label.slice(issuer.length + 1).trim();
  } else if (colon < 0 && label.includes(':')) {
    // issuer 파라미터 없이 구분자까지 인코딩한 링크는 예전처럼 첫 ':' 로 나눈다.
    const at = label.indexOf(':');
    issuer = label.slice(0, at).trim();
    label = label.slice(at + 1).trim();
  }

  const secretParam = params.get('secret');
  if (secretParam === null) throw new Error('missing secret');
  const split = splitTypePrefix(secretParam.trim());
  const secret = parseSecret(split.rest);

  const algorithmParam = params.get('algorithm');
  const algorithm = algorithmParam === null ? 'SHA-1' : algorithmFrom(algorithmParam);
  const digits = intParam(params, 'digits');
  const period = intParam(params, 'period');
  const counter = intParam(params, 'counter');

  let type: AccountType = typeText;
  if (split.type) {
    type = split.type;
  } else if (
    type === 'totp' &&
    (params.get('encoder')?.toLowerCase() === 'steam' ||
      (issuer.toLowerCase() === 'steam' && digits === 5))
  ) {
    type = 'steam';
  }

  return makeDraft({
    type,
    issuer,
    label,
    secret,
    algorithm,
    ...(digits !== undefined ? { digits } : {}),
    ...(period !== undefined ? { period } : {}),
    ...(counter !== undefined ? { counter } : {}),
  });
}

export function buildOtpauth(account: AccountDraft): string | null {
  if (account.type !== 'totp' && account.type !== 'hotp') return null;
  const label = account.issuer
    ? `${encodeURIComponent(account.issuer)}:${encodeURIComponent(account.label)}`
    : encodeURIComponent(account.label);
  const query = [
    `secret=${encodeBase32(account.secret)}`,
    ...(account.issuer ? [`issuer=${encodeURIComponent(account.issuer)}`] : []),
    `algorithm=${ALGORITHM_NAME[account.algorithm]}`,
    `digits=${account.digits}`,
    account.type === 'hotp' ? `counter=${account.counter ?? 0}` : `period=${account.period}`,
  ];
  return `${OTPAUTH}${account.type}/${label}?${query.join('&')}`;
}

export function parseLinks(
  text: string,
  limit = 500,
): {
  drafts: AccountDraft[];
  failed: { source: string; reason: string }[];
  truncated: boolean;
} {
  const drafts: AccountDraft[] = [];
  const failed: { source: string; reason: string }[] = [];
  let truncated = false;

  for (const token of text.split(/\s+/)) {
    if (drafts.length > limit) break;
    const lower = token.toLowerCase();
    const isMigration = lower.startsWith(MIGRATION);
    if (!isMigration && !lower.startsWith(OTPAUTH)) continue;
    try {
      if (isMigration) {
        const result = decodeMigration(token);
        drafts.push(...result.drafts);
        failed.push(...result.failed);
      } else {
        drafts.push(parseOtpauth(token));
      }
    } catch (e) {
      failed.push({
        source: token.slice(0, 40),
        reason: e instanceof Error ? e.message : String(e),
      });
    }
  }

  if (drafts.length > limit) {
    drafts.length = limit;
    truncated = true;
  }
  return { drafts, failed, truncated };
}
