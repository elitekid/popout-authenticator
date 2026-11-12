import { decryptVault } from '../../core/crypto/vault';
import { NoVaultError } from '../../store/errors';
import { keyFromFile, readVaultFile } from '../../store/vault';

// 잠금이 켜져 있을 때 비밀키를 꺼내기 전에 비밀번호를 다시 확인한다. 틀리면 WrongSecretError.
export async function reauthenticate(password: string): Promise<void> {
  const file = await readVaultFile();
  if (!file) throw new NoVaultError();
  await decryptVault(file, await keyFromFile(file, { password }));
}
