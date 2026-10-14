import { argon2id } from 'hash-wasm';
import { utf8Encode } from './bytes';

export type Argon2Params = {
  iterations: number;
  memoryKiB: number;
  parallelism: number;
};

export const DEFAULT_ARGON2: Argon2Params = { iterations: 3, memoryKiB: 65536, parallelism: 1 };

const subtle = () => globalThis.crypto.subtle;

export async function argon2idKey(
  password: string,
  salt: Uint8Array,
  params: Argon2Params = DEFAULT_ARGON2,
): Promise<Uint8Array> {
  return argon2id({
    password,
    salt,
    iterations: params.iterations,
    memorySize: params.memoryKiB,
    parallelism: params.parallelism,
    hashLength: 32,
    outputType: 'binary',
  });
}

export async function pbkdf2Key(
  password: string,
  salt: Uint8Array,
  iterations: number,
  hash: 'SHA-256' = 'SHA-256',
): Promise<Uint8Array> {
  const base = await subtle().importKey('raw', utf8Encode(password) as BufferSource, 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await subtle().deriveBits(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash },
    base,
    256,
  );
  return new Uint8Array(bits);
}

export async function hkdfKey(ikm: Uint8Array, salt: Uint8Array, info: string): Promise<Uint8Array> {
  const base = await subtle().importKey('raw', ikm as BufferSource, 'HKDF', false, ['deriveBits']);
  const bits = await subtle().deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: salt as BufferSource, info: utf8Encode(info) as BufferSource },
    base,
    256,
  );
  return new Uint8Array(bits);
}
