// 기준 확장(2FA Authenticator) 백업: 평문과 비밀번호 암호화본.
import { algorithmFrom, makeDraft } from '../account';
import { parseSecret } from '../base32';
import {
  aesGcmDecrypt,
  fromBase64,
  pbkdf2Key,
  UnsupportedFormatError,
  utf8Decode,
  WrongSecretError,
} from '../crypto';
import {
  asInt,
  asString,
  Collector,
  isObject,
  NeedsPasswordError,
  type ImportOutcome,
  type Json,
} from './types';

const ENCRYPTED_FORMAT = 'authenticator-encrypted-backup';
const MAX_ITERATIONS = 10_000_000;

export function isTwoFaEncrypted(value: unknown): value is Json {
  return isObject(value) && value.format === ENCRYPTED_FORMAT;
}

export function isTwoFaPlain(value: unknown): value is Json {
  return (
    isObject(value) &&
    value.version !== undefined &&
    Array.isArray(value.accounts) &&
    value.accounts.every((a) => isObject(a) && 'secret' in a)
  );
}

export function parseTwoFaPlain(file: Json): ImportOutcome {
  const out = new Collector();
  const accounts = Array.isArray(file.accounts) ? file.accounts : [];
  for (const raw of accounts) {
    if (!isObject(raw)) {
      out.fail('entry', new Error('not an object'));
      continue;
    }
    const issuer = asString(raw.issuer);
    const label = asString(raw.name);
    try {
      const algorithm = raw.algorithm === undefined ? 'SHA-1' : algorithmFrom(asString(raw.algorithm));
      const digits = asInt(raw.digits);
      const period = asInt(raw.period);
      const group = asString(raw.group).trim();
      out.add(
        makeDraft({
          type: 'totp',
          issuer,
          label,
          secret: parseSecret(asString(raw.secret)),
          algorithm,
          ...(digits !== undefined ? { digits } : {}),
          ...(period !== undefined ? { period } : {}),
        }),
        group ? { group } : {},
      );
    } catch (e) {
      out.fail(issuer && label ? `${issuer}:${label}` : issuer || label || 'entry', e);
    }
  }
  return out.outcome('2fa');
}

export async function parseTwoFaEncrypted(file: Json, password?: string): Promise<ImportOutcome> {
  if (!password) throw new NeedsPasswordError();
  const iterations = asInt(file.iterations);
  const data = asString(file.data);
  const parts = data.split('.');
  if (
    file.kdf !== 'PBKDF2-SHA256' ||
    iterations === undefined ||
    iterations < 1 ||
    iterations > MAX_ITERATIONS ||
    parts.length !== 3 ||
    parts[0] !== 'v1'
  ) {
    throw new UnsupportedFormatError('unsupported encrypted backup parameters');
  }
  let salt: Uint8Array;
  let iv: Uint8Array;
  let ciphertext: Uint8Array;
  try {
    salt = fromBase64(asString(file.salt));
    iv = fromBase64(parts[1]!);
    ciphertext = fromBase64(parts[2]!);
  } catch {
    throw new UnsupportedFormatError('not base64');
  }
  const key = await pbkdf2Key(password.normalize('NFKC'), salt, iterations);
  let plain: Uint8Array;
  try {
    plain = await aesGcmDecrypt(key, iv, ciphertext);
  } catch {
    throw new WrongSecretError();
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(utf8Decode(plain));
  } catch {
    throw new UnsupportedFormatError('decrypted data is not JSON');
  }
  const accounts = Array.isArray(parsed) ? parsed : isObject(parsed) ? parsed.accounts : undefined;
  if (!Array.isArray(accounts)) throw new UnsupportedFormatError('decrypted data has no accounts');
  const outcome = parseTwoFaPlain({ accounts });
  return { ...outcome, format: '2fa-encrypted' };
}
