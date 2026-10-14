import { randomBytes } from './bytes';

const subtle = () => globalThis.crypto.subtle;

async function importAes(key: Uint8Array, name: 'AES-GCM' | 'AES-CBC', usage: KeyUsage) {
  return subtle().importKey('raw', key as BufferSource, name, false, [usage]);
}

// ciphertext 는 인증 태그(16바이트)를 끝에 포함한다.
export async function aesGcmEncrypt(
  key: Uint8Array,
  plaintext: Uint8Array,
): Promise<{ iv: Uint8Array; ciphertext: Uint8Array }> {
  const iv = randomBytes(12);
  const k = await importAes(key, 'AES-GCM', 'encrypt');
  const out = await subtle().encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, k, plaintext as BufferSource);
  return { iv, ciphertext: new Uint8Array(out) };
}

// 인증 실패 등은 예외(OperationError)로 나온다.
export async function aesGcmDecrypt(
  key: Uint8Array,
  iv: Uint8Array,
  ciphertext: Uint8Array,
): Promise<Uint8Array> {
  const k = await importAes(key, 'AES-GCM', 'decrypt');
  const out = await subtle().decrypt({ name: 'AES-GCM', iv: iv as BufferSource }, k, ciphertext as BufferSource);
  return new Uint8Array(out);
}

// PKCS7 패딩 제거까지 WebCrypto 가 한다. 실패는 예외.
export async function aesCbcDecrypt(
  key: Uint8Array,
  iv: Uint8Array,
  ciphertext: Uint8Array,
): Promise<Uint8Array> {
  const k = await importAes(key, 'AES-CBC', 'decrypt');
  const out = await subtle().decrypt({ name: 'AES-CBC', iv: iv as BufferSource }, k, ciphertext as BufferSource);
  return new Uint8Array(out);
}
