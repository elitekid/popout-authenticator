// 팝업 아래 단추가 쓰는 창·탭 열기.
import { unlockWithPrf } from '../../store/lock';
import { readVaultFile } from '../../store/vault';
import { evaluatePrf, PasskeyCancelledError } from '../shared/passkey';

// 분리 창은 bg 가 하나만 열어 준다. 열린 창이 있으면 앞으로 가져온다.
export async function openDetachedWindow(openerUrl?: string): Promise<void> {
  try {
    const reply = (await chrome.runtime.sendMessage({ type: 'open-window', openerUrl })) as
      | { ok?: boolean }
      | undefined;
    // 창을 못 열었으면 팝업을 닫지 않는다.
    if (reply?.ok === true) window.close();
  } catch (error) {
    console.warn('open-window', error);
  }
}

// 현재 인증 도구 화면에서 곧바로 기기 인증을 요청한다.
export async function openPasskeyUnlock(options: { signal?: AbortSignal } = {}): Promise<void> {
  const file = await readVaultFile();
  const ids = (file?.wrappedKeys ?? [])
    .filter((key) => key.kind === 'prf' && key.credId !== undefined)
    .map((key) => key.credId as string);
  if (options.signal?.aborted) throw new PasskeyCancelledError();
  if (ids.length === 0) throw new Error('no passkey');
  const { credId, prfOutput } = await evaluatePrf(ids, options);
  try {
    if (options.signal?.aborted) throw new PasskeyCancelledError();
    await unlockWithPrf(credId, prfOutput, options);
  } finally {
    prfOutput.fill(0);
  }
}

export async function openManage(hash: string): Promise<void> {
  await chrome.tabs.create({ url: chrome.runtime.getURL(`manage.html#${hash}`) });
}
