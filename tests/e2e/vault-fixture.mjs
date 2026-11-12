// e2e 용 금고 만들기. src/core/crypto/vault.ts 의 encryptVault 와 같은 형식을 직접 만든다.
import { createHmac, randomBytes, webcrypto } from 'node:crypto';

const b64 = (bytes) => Buffer.from(bytes).toString('base64');
const hex = (bytes) => Buffer.from(bytes).toString('hex');

// 잠금 'none' 금고 파일. 계정의 secret 은 Uint8Array(또는 Buffer) 바이트.
export async function makeNoneVault(accounts) {
  const master = randomBytes(32);
  const stored = accounts.map((a) => ({ ...a, secret: b64(a.secret) }));
  const iv = randomBytes(12);
  const key = await webcrypto.subtle.importKey('raw', master, 'AES-GCM', false, ['encrypt']);
  const plain = new TextEncoder().encode(JSON.stringify(stored));
  // WebCrypto 출력은 인증 태그를 끝에 포함한다.
  const ciphertext = new Uint8Array(await webcrypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain));
  const digest = await webcrypto.subtle.digest('SHA-256', Buffer.concat([iv, ciphertext]));
  return {
    format: 'otpx-vault',
    version: 1,
    lock: 'none',
    wrappedKeys: [{ kind: 'none', iv: '', data: b64(master) }],
    iv: b64(iv),
    data: b64(ciphertext),
    count: accounts.length,
    checksum: hex(new Uint8Array(digest)),
    savedAt: Date.now(),
  };
}

// RFC 6238 TOTP(SHA-1). 비밀키는 바이트.
export function totp(secretBytes, nowMs, digits = 6, period = 30) {
  const counter = Math.floor(Math.floor(nowMs / 1000) / period);
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const mac = createHmac('sha1', Buffer.from(secretBytes)).update(message).digest();
  const offset = mac[mac.length - 1] & 0x0f;
  const value = mac.readUInt32BE(offset) & 0x7fffffff;
  return String(value % 10 ** digits).padStart(digits, '0');
}

// 자기 확인: 가짜 비밀키 JBSWY3DPEHPK3PXP, t=59초 → '996554'
const FAKE_BYTES = Buffer.from([0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x21, 0xde, 0xad, 0xbe, 0xef]);
if (totp(FAKE_BYTES, 59_000) !== '996554') {
  throw new Error('vault-fixture: totp self check failed');
}
