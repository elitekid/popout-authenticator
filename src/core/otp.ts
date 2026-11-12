// OTP 계산(HOTP/TOTP/Steam/Battle.net). 브라우저 확장 API 를 쓰지 않는다.
import type { Account, Algorithm } from './types';

const STEAM_ALPHABET = '23456789BCDFGHJKMNPQRTVWXY';
const STEAM_LENGTH = 5;

export function splitTypePrefix(secret: string): { type?: 'battle' | 'steam'; rest: string } {
  const lower = secret.toLowerCase();
  if (lower.startsWith('bliz-')) return { type: 'battle', rest: secret.slice(5) };
  if (lower.startsWith('blz-')) return { type: 'battle', rest: secret.slice(4) };
  if (lower.startsWith('stm-')) return { type: 'steam', rest: secret.slice(4) };
  return { rest: secret };
}

// HMAC + RFC 4226 동적 절단. 31비트 값을 돌려준다(자릿수·글자 변환은 호출자).
async function truncatedValue(
  secret: Uint8Array,
  counter: number,
  algorithm: Algorithm,
): Promise<number> {
  if (!Number.isSafeInteger(counter) || counter < 0) {
    throw new RangeError('counter must be a non-negative safe integer');
  }
  const message = new Uint8Array(8);
  const view = new DataView(message.buffer);
  view.setUint32(0, Math.floor(counter / 2 ** 32));
  view.setUint32(4, counter % 2 ** 32);

  const key = await globalThis.crypto.subtle.importKey(
    'raw',
    secret.slice(),
    { name: 'HMAC', hash: algorithm },
    false,
    ['sign'],
  );
  const mac = new Uint8Array(await globalThis.crypto.subtle.sign('HMAC', key, message));
  const offset = mac[mac.length - 1]! & 0x0f;
  return (
    (mac[offset]! & 0x7f) * 2 ** 24 +
    mac[offset + 1]! * 2 ** 16 +
    mac[offset + 2]! * 2 ** 8 +
    mac[offset + 3]!
  );
}

export async function hotp(
  secret: Uint8Array,
  counter: number,
  algorithm: Algorithm,
  digits: number,
): Promise<string> {
  if (!Number.isInteger(digits) || digits < 6 || digits > 10) {
    throw new RangeError('digits must be an integer from 6 to 10');
  }
  const value = await truncatedValue(secret, counter, algorithm);
  return String(value % 10 ** digits).padStart(digits, '0');
}

function checkPeriod(period: number): void {
  if (!Number.isInteger(period) || period < 1 || period > 3600) {
    throw new RangeError('period must be an integer from 1 to 3600');
  }
}

export function totpCounter(nowMs: number, period: number): number {
  checkPeriod(period);
  return Math.floor(Math.floor(nowMs / 1000) / period);
}

export function secondsRemaining(nowMs: number, period: number): number {
  checkPeriod(period);
  return period - (Math.floor(nowMs / 1000) % period);
}

export function steamCode(value31: number): string {
  let value = value31;
  let out = '';
  for (let i = 0; i < STEAM_LENGTH; i++) {
    out += STEAM_ALPHABET[value % STEAM_ALPHABET.length];
    value = Math.floor(value / STEAM_ALPHABET.length);
  }
  return out;
}

export async function generateCode(
  account: Pick<Account, 'type' | 'secret' | 'algorithm' | 'digits' | 'period' | 'counter'>,
  nowMs: number,
  offsetMs = 0,
  step = 0,
): Promise<string> {
  const { type, secret } = account;
  if (type === 'hotp') {
    return hotp(secret, (account.counter ?? 0) + step, account.algorithm, account.digits);
  }
  // steam·battle 은 30초·SHA-1 고정, 계정의 알고리즘·자릿수·주기를 쓰지 않는다.
  const period = type === 'totp' ? account.period : 30;
  const counter = totpCounter(nowMs + offsetMs, period) + step;
  if (type === 'totp') return hotp(secret, counter, account.algorithm, account.digits);
  if (type === 'battle') return hotp(secret, counter, 'SHA-1', 8);
  return steamCode(await truncatedValue(secret, counter, 'SHA-1'));
}
