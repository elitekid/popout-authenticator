// 금고 키 감싸기: 무작위 마스터 키 하나를 비밀번호·복구 코드·PRF 가 각각 감싼다.
import type { WrappedKey } from '../types';
import { aesGcmDecrypt, aesGcmEncrypt } from './aes';
import { fromBase64, randomBytes, toBase64 } from './bytes';
import { WrongSecretError } from './errors';
import { argon2idKey, DEFAULT_ARGON2, hkdfKey, type Argon2Params } from './kdf';
import { normalizeRecoveryCode, recoveryCodeBytes } from './recovery';

const RECOVERY_INFO = 'popout-authenticator recovery v1';
const PRF_INFO = 'popout-authenticator prf v1';

export function newMasterKey(): Uint8Array {
  return randomBytes(32);
}

async function seal(kek: Uint8Array, master: Uint8Array): Promise<{ iv: string; data: string }> {
  const { iv, ciphertext } = await aesGcmEncrypt(kek, master);
  return { iv: toBase64(iv), data: toBase64(ciphertext) };
}

async function open(kek: Uint8Array, wk: WrappedKey): Promise<Uint8Array> {
  try {
    const master = await aesGcmDecrypt(kek, fromBase64(wk.iv), fromBase64(wk.data));
    if (master.length !== 32) throw new Error('bad master key length');
    return master;
  } catch {
    throw new WrongSecretError();
  }
}

export async function wrapWithPassword(
  master: Uint8Array,
  password: string,
  params: Argon2Params = DEFAULT_ARGON2,
): Promise<WrappedKey> {
  const salt = randomBytes(16);
  const kek = await argon2idKey(password, salt, params);
  return {
    kind: 'password',
    kdf: {
      name: 'argon2id',
      salt: toBase64(salt),
      iterations: params.iterations,
      memoryKiB: params.memoryKiB,
      parallelism: params.parallelism,
    },
    ...(await seal(kek, master)),
  };
}

export async function unwrapWithPassword(wk: WrappedKey, password: string): Promise<Uint8Array> {
  const kdf = wk.kdf;
  if (wk.kind !== 'password' || !kdf || kdf.name !== 'argon2id') {
    throw new Error('not a password-wrapped key');
  }
  const kek = await argon2idKey(password, fromBase64(kdf.salt), {
    iterations: kdf.iterations ?? DEFAULT_ARGON2.iterations,
    memoryKiB: kdf.memoryKiB ?? DEFAULT_ARGON2.memoryKiB,
    parallelism: kdf.parallelism ?? DEFAULT_ARGON2.parallelism,
  });
  return open(kek, wk);
}

export async function wrapWithRecoveryCode(master: Uint8Array, code: string): Promise<WrappedKey> {
  const salt = randomBytes(16);
  const kek = await hkdfKey(recoveryCodeBytes(code), salt, RECOVERY_INFO);
  return { kind: 'recovery', kdf: { name: 'hkdf', salt: toBase64(salt) }, ...(await seal(kek, master)) };
}

export async function unwrapWithRecoveryCode(wk: WrappedKey, code: string): Promise<Uint8Array> {
  if (wk.kind !== 'recovery' || !wk.kdf || wk.kdf.name !== 'hkdf') {
    throw new Error('not a recovery-wrapped key');
  }
  let bytes: Uint8Array;
  try {
    bytes = recoveryCodeBytes(normalizeRecoveryCode(code));
  } catch {
    throw new WrongSecretError('invalid recovery code');
  }
  const kek = await hkdfKey(bytes, fromBase64(wk.kdf.salt), RECOVERY_INFO);
  return open(kek, wk);
}

export async function wrapWithPrf(
  master: Uint8Array,
  prfOutput: Uint8Array,
  credId: string,
): Promise<WrappedKey> {
  const salt = randomBytes(16);
  const kek = await hkdfKey(prfOutput, salt, PRF_INFO);
  return { kind: 'prf', kdf: { name: 'hkdf', salt: toBase64(salt) }, credId, ...(await seal(kek, master)) };
}

export async function unwrapWithPrf(wk: WrappedKey, prfOutput: Uint8Array): Promise<Uint8Array> {
  if (wk.kind !== 'prf' || !wk.kdf || wk.kdf.name !== 'hkdf') throw new Error('not a prf-wrapped key');
  const kek = await hkdfKey(prfOutput, fromBase64(wk.kdf.salt), PRF_INFO);
  return open(kek, wk);
}
