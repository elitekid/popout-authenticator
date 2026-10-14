// `openssl enc -aes-256-cbc -md md5` 형식("Salted__" + 솔트 8바이트 + 암호문) 복호.
import { aesCbcDecrypt } from './aes';
import { concat, fromBase64, utf8Encode } from './bytes';
import { UnsupportedFormatError, WrongSecretError } from './errors';
import { md5 } from './md5';

const MAGIC = utf8Encode('Salted__');

// EVP_BytesToKey(MD5, 1회): D_i = MD5(D_{i-1} || pass || salt)
function bytesToKey(pass: Uint8Array, salt: Uint8Array): { key: Uint8Array; iv: Uint8Array } {
  let block: Uint8Array = new Uint8Array(0);
  let all: Uint8Array = new Uint8Array(0);
  while (all.length < 48) {
    block = md5(concat(block, pass, salt));
    all = concat(all, block);
  }
  return { key: all.slice(0, 32), iv: all.slice(32, 48) };
}

export async function decryptOpenSslSalted(base64Text: string, passphrase: string): Promise<Uint8Array> {
  let raw: Uint8Array;
  try {
    raw = fromBase64(base64Text);
  } catch {
    throw new UnsupportedFormatError('not base64');
  }
  if (raw.length < 16 || MAGIC.some((b, i) => raw[i] !== b)) {
    throw new UnsupportedFormatError('missing Salted__ header');
  }
  const ciphertext = raw.slice(16);
  if (ciphertext.length === 0 || ciphertext.length % 16 !== 0) {
    throw new UnsupportedFormatError('bad ciphertext length');
  }
  const { key, iv } = bytesToKey(utf8Encode(passphrase), raw.slice(8, 16));
  try {
    return await aesCbcDecrypt(key, iv, ciphertext);
  } catch {
    throw new WrongSecretError('wrong passphrase or corrupt data');
  }
}
