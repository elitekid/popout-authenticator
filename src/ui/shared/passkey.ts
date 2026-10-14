// 패스키(WebAuthn PRF) 도우미. 기준: authenticator-sh/2fa src/utils/passkey.ts (MIT).
import { fromBase64Url, randomBytes, toBase64Url, utf8Encode } from '../../core/crypto/bytes';
import { WrongSecretError } from '../../core/crypto/errors';
import { supportsPasskeys } from '../../core/browser';

// 고정 PRF 입력값. 비밀이 아니다(자격 증명마다 PRF 결과가 다르다).
const PRF_EVAL = utf8Encode('popout-authenticator unlock v1');
const RP_NAME = 'Popout Authenticator';

export class PasskeyCancelledError extends Error {
  constructor() {
    super('passkey cancelled');
  }
}

export class PasskeyUnsupportedError extends Error {
  constructor() {
    super('passkey unsupported');
  }
}

export class PasskeyNoPrfError extends Error {
  constructor() {
    super('passkey has no prf');
  }
}

type PrfResult = { credId: string; prfOutput: Uint8Array };
type PrfExtension = { prf?: { enabled?: boolean; results?: { first?: ArrayBuffer } } };

export function passkeyErrorKey(error: unknown): string {
  if (error instanceof PasskeyCancelledError) return 'lock.passkey.error.cancelled';
  if (error instanceof PasskeyUnsupportedError) return supportsPasskeys()
    ? 'lock.passkey.error.unsupported' : 'lock.passkey.browserUnsupported';
  if (error instanceof PasskeyNoPrfError) return 'lock.passkey.error.noprf';
  if (error instanceof WrongSecretError) return 'lock.passkey.error.wrong';
  return 'lock.passkey.error.failed';
}

export async function passkeyAvailable(): Promise<boolean> {
  if (!supportsPasskeys()) return false;
  try {
    if (typeof PublicKeyCredential === 'undefined') return false;
    const pkc = PublicKeyCredential as unknown as {
      getClientCapabilities?: () => Promise<Record<string, boolean>>;
    };
    if (typeof pkc.getClientCapabilities === 'function') {
      return (await pkc.getClientCapabilities())['extension:prf'] === true;
    }
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

function mapError(error: unknown): Error {
  const name = error instanceof DOMException ? error.name : '';
  if (name === 'NotAllowedError' || name === 'AbortError') return new PasskeyCancelledError();
  if (name === 'NotSupportedError') return new PasskeyUnsupportedError();
  return error instanceof Error ? error : new Error('passkey failed');
}

function prfFrom(credential: PublicKeyCredential): { enabled?: boolean; first?: Uint8Array } {
  const prf = (credential.getClientExtensionResults() as PrfExtension).prf;
  const first = prf?.results?.first;
  return { enabled: prf?.enabled, first: first ? new Uint8Array(first) : undefined };
}

export async function registerPasskey(options: { signal?: AbortSignal } = {}): Promise<PrfResult> {
  if (!supportsPasskeys()) throw new PasskeyUnsupportedError();
  let credential: PublicKeyCredential | null;
  try {
    credential = (await navigator.credentials.create({
      signal: options.signal,
      publicKey: {
        challenge: randomBytes(32) as BufferSource,
        rp: { name: RP_NAME },
        user: { id: randomBytes(16) as BufferSource, name: RP_NAME, displayName: RP_NAME },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -257 },
        ],
        authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
        extensions: { prf: { eval: { first: PRF_EVAL } } } as AuthenticationExtensionsClientInputs,
        timeout: 120000,
      },
    })) as PublicKeyCredential | null;
  } catch (error) {
    throw mapError(error);
  }
  if (!credential) throw new PasskeyCancelledError();
  const credId = toBase64Url(new Uint8Array(credential.rawId));
  const prf = prfFrom(credential);
  if (options.signal?.aborted) {
    prf.first?.fill(0);
    throw new PasskeyCancelledError();
  }
  if (prf.first) return { credId, prfOutput: prf.first };
  if (prf.enabled === false) throw new PasskeyNoPrfError();
  // 만들 때 결과를 주지 않는 인증기는 한 번 더 받는다.
  return evaluatePrf([credId], options);
}

export async function evaluatePrf(
  credIds: string[],
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<PrfResult> {
  if (!supportsPasskeys()) throw new PasskeyUnsupportedError();
  let credential: PublicKeyCredential | null;
  try {
    credential = (await navigator.credentials.get({
      signal: options.signal,
      publicKey: {
        challenge: randomBytes(32) as BufferSource,
        allowCredentials: credIds.map((id) => ({
          type: 'public-key' as const,
          id: fromBase64Url(id) as BufferSource,
        })),
        userVerification: 'required',
        extensions: { prf: { eval: { first: PRF_EVAL } } } as AuthenticationExtensionsClientInputs,
        timeout: Math.max(1, Math.min(120000, options.timeoutMs ?? 120000)),
      },
    })) as PublicKeyCredential | null;
  } catch (error) {
    throw mapError(error);
  }
  if (!credential) throw new PasskeyCancelledError();
  const prf = prfFrom(credential);
  if (options.signal?.aborted) {
    prf.first?.fill(0);
    throw new PasskeyCancelledError();
  }
  if (!prf.first) throw new PasskeyNoPrfError();
  return { credId: toBase64Url(new Uint8Array(credential.rawId)), prfOutput: prf.first };
}
