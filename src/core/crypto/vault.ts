// 계정 목록 ↔ 금고 파일. 마스터 키는 인자로만 받는다.
import type { Account, VaultFile, WrappedKey } from '../types';
import { aesGcmDecrypt, aesGcmEncrypt } from './aes';
import { concat, fromBase64, toBase64, toHex, utf8Decode, utf8Encode } from './bytes';
import { CorruptVaultError } from './errors';

type StoredAccount = Omit<Account, 'secret'> & { secret: string };

async function checksumOf(iv: Uint8Array, ciphertext: Uint8Array): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', concat(iv, ciphertext) as BufferSource);
  return toHex(new Uint8Array(digest));
}

function decodeBase64(text: unknown, what: string): Uint8Array {
  if (typeof text !== 'string') throw new CorruptVaultError(`${what} is not a string`);
  try {
    return fromBase64(text);
  } catch {
    throw new CorruptVaultError(`${what} is not base64`);
  }
}

export async function encryptVault(
  accounts: Account[],
  master: Uint8Array,
  lock: VaultFile['lock'],
  wrappedKeys: WrappedKey[],
): Promise<VaultFile> {
  const stored: StoredAccount[] = accounts.map((a) => ({ ...a, secret: toBase64(a.secret) }));
  const { iv, ciphertext } = await aesGcmEncrypt(master, utf8Encode(JSON.stringify(stored)));
  return {
    format: 'otpx-vault',
    version: 1,
    lock,
    wrappedKeys,
    iv: toBase64(iv),
    data: toBase64(ciphertext),
    count: accounts.length,
    checksum: await checksumOf(iv, ciphertext),
    savedAt: Date.now(),
  };
}

// 키 없이 형식·version·checksum 만 본다.
export async function verifyVaultFile(file: VaultFile): Promise<void> {
  const f = file as Partial<VaultFile> | null;
  if (!f || typeof f !== 'object' || f.format !== 'otpx-vault') {
    throw new CorruptVaultError('not a vault file');
  }
  if (f.version !== 1) throw new CorruptVaultError('unsupported vault version');
  if (typeof f.count !== 'number' || !Number.isInteger(f.count) || f.count < 0) {
    throw new CorruptVaultError('bad count');
  }
  if (!Array.isArray(f.wrappedKeys)) throw new CorruptVaultError('bad wrappedKeys');
  const iv = decodeBase64(f.iv, 'iv');
  const data = decodeBase64(f.data, 'data');
  if ((await checksumOf(iv, data)) !== f.checksum) throw new CorruptVaultError('checksum mismatch');
}

export async function decryptVault(file: VaultFile, master: Uint8Array): Promise<Account[]> {
  await verifyVaultFile(file);
  let parsed: unknown;
  try {
    const plain = await aesGcmDecrypt(master, fromBase64(file.iv), fromBase64(file.data));
    parsed = JSON.parse(utf8Decode(plain));
  } catch {
    throw new CorruptVaultError('cannot decrypt vault');
  }
  if (!Array.isArray(parsed)) throw new CorruptVaultError('vault body is not a list');
  if (parsed.length !== file.count) throw new CorruptVaultError('count mismatch');
  return parsed.map((raw: StoredAccount) => {
    if (!raw || typeof raw !== 'object') throw new CorruptVaultError('bad account');
    return { ...raw, secret: decodeBase64(raw.secret, 'secret') } as Account;
  });
}
