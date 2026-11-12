// 다른 인증 앱의 평문 백업(Aegis·2FAS·Bitwarden·FreeOTP+·andOTP·Raivo·Authy 덤프) 해석.
// 암호화된 파일은 풀지 않고 ImportRejectedError('encrypted') 로 거절한다.
import { algorithmFrom, makeDraft } from '../account';
import { decodeBase32, parseSecret } from '../base32';
import { parseOtpauth } from '../uri';
import {
  asInt,
  asString,
  Collector,
  ImportRejectedError,
  isObject,
  type ImportOutcome,
  type Json,
} from './types';

export type AppName = 'aegis' | '2fas' | 'bitwarden' | 'freeotp+' | 'andotp' | 'raivo' | 'authy';

const DISPLAY: Record<AppName, string> = {
  aegis: 'Aegis',
  '2fas': '2FAS',
  bitwarden: 'Bitwarden',
  'freeotp+': 'FreeOTP+',
  andotp: 'andOTP',
  raivo: 'Raivo',
  authy: 'Authy',
};

export function detectApp(value: unknown): AppName | null {
  if (Array.isArray(value)) {
    const items = value.filter(isObject);
    if (items.length === 0 || items.length !== value.length) return null;
    if (items.every((i) => typeof i.uri === 'string' && i.uri.toLowerCase().startsWith('otpauth'))) return 'authy';
    if (items.every((i) => 'kind' in i && 'secret' in i)) return 'raivo';
    if (items.every((i) => 'secret' in i && 'type' in i && ('label' in i || 'issuer' in i))) return 'andotp';
    return null;
  }
  if (!isObject(value)) return null;
  if (isObject(value.header) && 'db' in value && typeof value.version === 'number') return 'aegis';
  if (Array.isArray(value.services) || typeof value.servicesEncrypted === 'string') return '2fas';
  if (Array.isArray(value.tokens) && value.tokens.every((t) => isObject(t) && Array.isArray(t.secret))) {
    return 'freeotp+';
  }
  if (
    typeof value.encrypted === 'boolean' &&
    (Array.isArray(value.items) || (value.encrypted === true && typeof value.data === 'string'))
  ) {
    return 'bitwarden';
  }
  return null;
}

function name(issuer: string, label: string): string {
  return issuer && label ? `${issuer}:${label}` : issuer || label || 'entry';
}

function algorithmOf(value: unknown) {
  return value === undefined || value === null || value === '' ? 'SHA-1' : algorithmFrom(asString(value));
}

// ---- Aegis ----
function parseAegis(file: Json): ImportOutcome {
  if (typeof file.db === 'string' || !isObject(file.db)) throw new ImportRejectedError('encrypted', DISPLAY.aegis);
  const db = file.db;
  const groups = new Map<string, string>();
  if (Array.isArray(db.groups)) {
    for (const g of db.groups) {
      if (isObject(g) && typeof g.uuid === 'string' && typeof g.name === 'string') groups.set(g.uuid, g.name);
    }
  }
  const out = new Collector();
  const entries = Array.isArray(db.entries) ? db.entries : [];
  for (const raw of entries) {
    if (!isObject(raw)) continue;
    const issuer = asString(raw.issuer);
    const label = asString(raw.name);
    try {
      const type = asString(raw.type).toLowerCase();
      if (type !== 'totp' && type !== 'hotp' && type !== 'steam') throw new Error(`unsupported type: ${type}`);
      const info = isObject(raw.info) ? raw.info : {};
      const digits = asInt(info.digits);
      const period = asInt(info.period);
      const counter = asInt(info.counter);
      const ids = Array.isArray(raw.groups) ? raw.groups : [];
      const group = ids.map((id) => groups.get(asString(id))).find((g) => g !== undefined) ?? '';
      out.add(
        makeDraft({
          type,
          issuer,
          label,
          secret: parseSecret(asString(info.secret)),
          algorithm: algorithmOf(info.algo),
          ...(digits !== undefined ? { digits } : {}),
          ...(period !== undefined ? { period } : {}),
          ...(counter !== undefined ? { counter } : {}),
        }),
        group ? { group } : {},
      );
    } catch (e) {
      out.fail(name(issuer, label), e);
    }
  }
  return out.outcome('aegis');
}

// ---- 2FAS ----
function parse2fas(file: Json): ImportOutcome {
  if (typeof file.servicesEncrypted === 'string') throw new ImportRejectedError('encrypted', DISPLAY['2fas']);
  const groups = new Map<string, string>();
  if (Array.isArray(file.groups)) {
    for (const g of file.groups) {
      if (isObject(g) && typeof g.id === 'string' && typeof g.name === 'string') groups.set(g.id, g.name);
    }
  }
  const services = (Array.isArray(file.services) ? file.services : []).filter(isObject);
  const out = new Collector();
  const ordered = services
    .map((s, i) => ({ s, i, pos: isObject(s.order) ? (asInt(s.order.position) ?? i) : i }))
    .sort((a, b) => a.pos - b.pos || a.i - b.i);
  for (const { s } of ordered) {
    const otp = isObject(s.otp) ? s.otp : {};
    const issuer = asString(otp.issuer) || asString(s.name);
    const label = asString(otp.account) || asString(otp.label);
    try {
      const tokenType = asString(otp.tokenType || 'TOTP').toUpperCase();
      if (tokenType !== 'TOTP' && tokenType !== 'HOTP' && tokenType !== 'STEAM') {
        throw new Error(`unsupported type: ${tokenType}`);
      }
      const digits = asInt(otp.digits);
      const period = asInt(otp.period);
      const counter = asInt(otp.counter);
      const group = groups.get(asString(s.groupId)) ?? '';
      out.add(
        makeDraft({
          type: tokenType.toLowerCase() as 'totp' | 'hotp' | 'steam',
          issuer,
          label,
          secret: parseSecret(asString(s.secret)),
          algorithm: algorithmOf(otp.algorithm),
          ...(digits !== undefined ? { digits } : {}),
          ...(period !== undefined ? { period } : {}),
          ...(counter !== undefined ? { counter } : {}),
        }),
        group ? { group } : {},
      );
    } catch (e) {
      out.fail(name(issuer, label), e);
    }
  }
  return out.outcome('2fas');
}

// ---- Bitwarden ----
function parseBitwarden(file: Json): ImportOutcome {
  if (file.encrypted === true || !Array.isArray(file.items)) {
    throw new ImportRejectedError('encrypted', DISPLAY.bitwarden);
  }
  const out = new Collector();
  for (const item of file.items) {
    if (!isObject(item) || !isObject(item.login)) continue;
    const totp = typeof item.login.totp === 'string' ? item.login.totp.trim() : '';
    if (!totp) continue;
    const itemName = asString(item.name);
    const username = asString(item.login.username);
    try {
      if (totp.toLowerCase().startsWith('otpauth://')) {
        const draft = parseOtpauth(totp);
        out.add({ ...draft, issuer: draft.issuer || itemName, label: draft.label || username });
      } else if (totp.toLowerCase().startsWith('steam://')) {
        out.add(
          makeDraft({
            type: 'steam',
            issuer: itemName,
            label: username,
            secret: decodeBase32(totp.slice('steam://'.length)),
            algorithm: 'SHA-1',
          }),
        );
      } else {
        out.add(
          makeDraft({
            type: 'totp',
            issuer: itemName,
            label: username,
            secret: parseSecret(totp),
            algorithm: 'SHA-1',
          }),
        );
      }
    } catch (e) {
      out.fail(name(itemName, username), e);
    }
  }
  return out.outcome('bitwarden');
}

// ---- FreeOTP+ ----
function parseFreeOtpPlus(file: Json): ImportOutcome {
  const tokens = (Array.isArray(file.tokens) ? file.tokens : []).filter(isObject);
  const order = Array.isArray(file.tokenOrder) ? file.tokenOrder.map(asString) : [];
  const out = new Collector();
  const keyed = tokens.map((t, i) => {
    const issuer = asString(t.issuerExt) || asString(t.issuerInt);
    const label = asString(t.label);
    const at = order.indexOf(issuer ? `${issuer}:${label}` : label);
    return { t, i, issuer, label, pos: at >= 0 ? at : Number.MAX_SAFE_INTEGER };
  });
  keyed.sort((a, b) => a.pos - b.pos || a.i - b.i);
  for (const { t, issuer, label } of keyed) {
    try {
      const type = asString(t.type).toLowerCase();
      if (type !== 'totp' && type !== 'hotp') throw new Error(`unsupported type: ${type}`);
      const bytes = Uint8Array.from((t.secret as unknown[]).map((b) => Number(b) & 0xff));
      const digits = asInt(t.digits);
      const period = asInt(t.period);
      const counter = asInt(t.counter);
      out.add(
        makeDraft({
          type,
          issuer,
          label,
          secret: bytes,
          algorithm: algorithmOf(t.algo),
          ...(digits !== undefined ? { digits } : {}),
          ...(period !== undefined ? { period } : {}),
          ...(counter !== undefined ? { counter } : {}),
        }),
      );
    } catch (e) {
      out.fail(name(issuer, label), e);
    }
  }
  return out.outcome('freeotp+');
}

// ---- andOTP ----
function parseAndOtp(list: unknown[]): ImportOutcome {
  const out = new Collector();
  for (const raw of list) {
    if (!isObject(raw)) continue;
    const issuer = asString(raw.issuer);
    const label = asString(raw.label);
    try {
      const type = asString(raw.type).toLowerCase();
      if (type !== 'totp' && type !== 'hotp' && type !== 'steam') throw new Error(`unsupported type: ${type}`);
      const digits = asInt(raw.digits);
      const period = asInt(raw.period);
      const counter = asInt(raw.counter);
      const tag = Array.isArray(raw.tags) ? asString(raw.tags[0]).trim() : '';
      out.add(
        makeDraft({
          type,
          issuer,
          label,
          secret: parseSecret(asString(raw.secret)),
          algorithm: algorithmOf(raw.algorithm),
          ...(digits !== undefined ? { digits } : {}),
          ...(period !== undefined ? { period } : {}),
          ...(counter !== undefined ? { counter } : {}),
        }),
        tag ? { group: tag } : {},
      );
    } catch (e) {
      out.fail(name(issuer, label), e);
    }
  }
  return out.outcome('andotp');
}

// ---- Raivo ----
function parseRaivo(list: unknown[]): ImportOutcome {
  const out = new Collector();
  for (const raw of list) {
    if (!isObject(raw)) continue;
    const issuer = asString(raw.issuer);
    const label = asString(raw.account);
    try {
      const kind = asString(raw.kind).toLowerCase();
      if (kind !== 'totp' && kind !== 'hotp') throw new Error(`unsupported type: ${kind}`);
      const digits = asInt(raw.digits);
      const period = asInt(raw.timer);
      const counter = asInt(raw.counter);
      out.add(
        makeDraft({
          type: kind,
          issuer,
          label,
          secret: parseSecret(asString(raw.secret)),
          algorithm: algorithmOf(raw.algorithm),
          ...(digits !== undefined ? { digits } : {}),
          ...(period !== undefined ? { period } : {}),
          ...(counter !== undefined ? { counter } : {}),
        }),
        asString(raw.pinned).toLowerCase() === 'true' || raw.pinned === true ? { pinned: true } : {},
      );
    } catch (e) {
      out.fail(name(issuer, label), e);
    }
  }
  return out.outcome('raivo');
}

// ---- Authy 덤프(otpauth 링크 목록) ----
function parseAuthy(list: unknown[]): ImportOutcome {
  const out = new Collector();
  for (const raw of list) {
    if (!isObject(raw)) continue;
    const title = asString(raw.name);
    try {
      const draft = parseOtpauth(asString(raw.uri));
      out.add({ ...draft, issuer: draft.issuer || title });
    } catch (e) {
      out.fail(title || 'entry', e);
    }
  }
  return out.outcome('authy');
}

export function parseApp(app: AppName, value: unknown): ImportOutcome {
  switch (app) {
    case 'aegis':
      return parseAegis(value as Json);
    case '2fas':
      return parse2fas(value as Json);
    case 'bitwarden':
      return parseBitwarden(value as Json);
    case 'freeotp+':
      return parseFreeOtpPlus(value as Json);
    case 'andotp':
      return parseAndOtp(value as unknown[]);
    case 'raivo':
      return parseRaivo(value as unknown[]);
    case 'authy':
      return parseAuthy(value as unknown[]);
  }
}
