// 코드 사용 때 기기 인증. 풀린 금고 상태와 별개이며 기본은 꺼짐.
import { decryptVault } from '../core/crypto/vault';
import { supportsPasskeys } from '../core/browser';
import { unwrapWithPassword } from '../core/crypto/keys';
import { getSessionKey } from './session';
import { readVaultFile, withVaultWriteLock } from './vault';

export type CodeAction = 'disable';

// 오류는 호출자가 표시한다. 읽기 실패를 꺼짐으로 바꿔 코드 사용을 허용하지 않는다.
export async function readCodeProtection(): Promise<boolean> {
  return (await chrome.storage.local.get('codeProtection')).codeProtection === true;
}

export function onCodeProtectionChanged(listener: (enabled: boolean) => void): () => void {
  const changed = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === 'local' && 'codeProtection' in changes) listener(changes.codeProtection.newValue === true);
  };
  chrome.storage.onChanged.addListener(changed);
  return () => chrome.storage.onChanged.removeListener(changed);
}

export async function requestCodeAccess(action: CodeAction, accountId?: string, step = 0): Promise<void> {
  const result = await chrome.runtime.sendMessage({ type: 'code-access-request', action, accountId, step });
  if (!result?.ok) throw new Error(result?.error ?? 'codeProtection.failed');
}

export async function enableCodeProtection(): Promise<void> {
  // 가져온 금고에 다른 브라우저의 PRF 키가 있어도 쓸 수 없는 보호를 켜지 않는다.
  if (!supportsPasskeys()) throw new Error('codeProtection.unsupported');
  await withVaultWriteLock(async () => {
    const file = await readVaultFile();
    const key = await getSessionKey();
    if (!file || file.lock === 'none' || !key || !file.wrappedKeys.some((k) => k.kind === 'prf' && k.credId)) {
      throw new Error('codeProtection.setupFirst');
    }
    await decryptVault(file, key);
    await chrome.storage.local.set({ codeProtection: true });
  });
}

// 기기 인증 수단을 잃었을 때만 사용자가 명시적으로 선택하는 비밀번호 복구.
// 이미 풀린 세션 키를 사용하지 않고 비밀번호로 실제 금고를 확인한다.
export async function disableCodeProtectionWithPassword(password: string): Promise<void> {
  await withVaultWriteLock(async () => {
    const file = await readVaultFile();
    const wrapped = file?.wrappedKeys.find((k) => k.kind === 'password');
    if (!file || file.lock === 'none' || !wrapped) throw new Error('codeProtection.setupFirst');
    const key = await unwrapWithPassword(wrapped, password);
    try {
      await decryptVault(file, key);
      await chrome.storage.local.set({ codeProtection: false });
      await chrome.storage.session.remove('codeAccessRequests');
    } finally {
      key.fill(0);
    }
  });
}
