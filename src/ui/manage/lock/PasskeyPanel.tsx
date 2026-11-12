import { useEffect, useRef, useState } from 'preact/hooks';
import { WrongSecretError } from '../../../core/crypto/errors';
import { supportsPasskeys } from '../../../core/browser';
import { addPrfKey, isLocked, removePrfKey } from '../../../store/lock';
import { passkeyAvailable, passkeyErrorKey, registerPasskey } from '../../shared/passkey';
import { reauthenticate } from '../../shared/reauth';
import type { useT } from '../../shared/use-t';

type T = ReturnType<typeof useT>;

// 지원되지 않는 기기에서는 숨기되, 다른 브라우저에서 가져온 키는 삭제할 수 있다.
export function PasskeyPanel({ t, credIds, onReady, codeProtection }: { t: T; credIds: string[]; onReady: () => void; codeProtection: boolean }) {
  const [available, setAvailable] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const alive = useRef(true);
  const pending = useRef(false);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    alive.current = true;
    void passkeyAvailable().then((ok) => { if (alive.current) { setAvailable(ok); onReady(); } });
    return () => {
      alive.current = false;
      controller.current?.abort();
    };
  }, []);

  // 쓸 수 없어도 이미 등록된 패스키는 보이고 지울 수 있다. 추가 단추만 숨긴다.
  if (!available && credIds.length === 0) return null;

  const remove = async (credId: string) => {
    if (pending.current || (codeProtection && credIds.length <= 1)) return;
    pending.current = true;
    const value = password;
    setError(null);
    setDone(false);
    setBusy(true);
    try {
      await reauthenticate(value);
      if (!alive.current) return;
      await removePrfKey(credId);
    } catch (e) {
      if (alive.current) setError(e instanceof WrongSecretError ? 'lock.error.wrong' : 'lock.error.failed');
    } finally {
      pending.current = false;
      if (alive.current) {
        setPassword('');
        setBusy(false);
      }
    }
  };

  const add = async () => {
    if (pending.current) return;
    pending.current = true;
    const request = new AbortController();
    controller.current = request;
    setBusy(true);
    setError(null);
    setDone(false);
    let output: Uint8Array | undefined;
    try {
      if (await isLocked()) throw new Error('locked');
      if (!alive.current) return;
      const result = await registerPasskey({ signal: request.signal });
      output = result.prfOutput;
      if (!alive.current || request.signal.aborted) return;
      await addPrfKey(output, result.credId);
      if (alive.current) setDone(true);
    } catch (error) {
      if (alive.current) setError(passkeyErrorKey(error));
    } finally {
      output?.fill(0);
      controller.current = null;
      pending.current = false;
      if (alive.current) setBusy(false);
    }
  };

  return (
    <section class="lock-passkeys" data-role="passkeys">
      <h2>{t('lock.passkey.section')}</h2>
      <p class="muted" data-role={!supportsPasskeys() ? 'passkey-unsupported' : undefined}>
        {t(supportsPasskeys() ? 'lock.passkey.hint' : 'lock.passkey.browserUnsupported')}
      </p>
      {codeProtection && credIds.length === 1 && <p class="muted" data-role="passkey-remove-protected">{t('lock.codeAccess.disableFirst')}</p>}
      {credIds.length > 0 && (
        <>
          <label>
            <span>{t('lock.reauth')}</span>
            <input
              type="password"
              class="field"
              data-role="passkey-reauth"
              autocomplete="off"
              value={password}
              onInput={(e) => setPassword(e.currentTarget.value)}
            />
          </label>
          <ul class="lock-list">
            {credIds.map((id) => (
              <li key={id} data-role="passkey-item">
                <span>{t('lock.passkey.item', { id: id.slice(0, 8) })}</span>
                <button
                  type="button"
                  class="danger"
                  data-role="passkey-remove"
                  disabled={busy || (codeProtection && credIds.length <= 1)}
                  onClick={() => void remove(id)}
                >
                  {t('lock.passkey.remove')}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {error && (
        <p class="error" role="alert" data-role="passkey-panel-error">
          {t(error)}
        </p>
      )}
      {done && <p role="status" data-role="passkey-panel-done">{t('lock.passkey.register.done')}</p>}
      {busy && <p role="status">{t('lock.passkey.busy')}</p>}
      {available && <button type="button" data-role="passkey-add" disabled={busy} onClick={() => void add()}>
        {t('lock.passkey.add')}
      </button>}
    </section>
  );
}
