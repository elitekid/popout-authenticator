import { useState } from 'preact/hooks';
import { loadSettings } from '../../../store/settings';
import { useScreenContext } from '../../shared/screen-context';
import type { useT } from '../../shared/use-t';
import { downloadText, today } from '../backup/download';

type T = ReturnType<typeof useT>;

// 공백·하이픈·대소문자를 무시하고 비교한다.
const squash = (text: string) => text.replace(/[\s-]+/g, '').toUpperCase();

// 보이기용: 4글자마다 띄운다.
const spaced = (code: string) => squash(code).replace(/(.{4})(?=.)/g, '$1 ');

// 복구 코드를 한 번 보여 주고, 다시 입력해 맞으면 onDone 으로 부모가 코드를 메모리에서 지운다.
export function RecoveryStep({ t, code, onDone, savedConfirmation = false }: {
  t: T;
  code: string;
  onDone: () => Promise<void>;
  savedConfirmation?: boolean;
}) {
  const [typed, setTyped] = useState('');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<'mismatch' | 'failed' | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const { toolbarPopup } = useScreenContext();

  const copy = () => {
    void navigator.clipboard
      .writeText(code)
      .then(async () => {
        setCopied(true);
        // 팝업의 OTP 복사와 같이, 설정이 켜져 있으면 일정 시간 뒤 클립보드를 비운다.
        if ((await loadSettings().catch(() => null))?.clipboardClearAfterCopy) {
          await chrome.runtime.sendMessage({ type: 'clipboard-copied', code }).catch(() => undefined);
        }
      })
      .catch(() => setCopied(false));
  };

  const save = () => {
    downloadText(`popout-authenticator-recovery-${today()}.txt`, `${code}\n`, 'text/plain');
  };

  const confirm = async (e: Event) => {
    e.preventDefault();
    if (busy) return;
    const same = savedConfirmation ? saved : squash(typed) === squash(code);
    setTyped('');
    if (!same) return setError('mismatch');
    setBusy(true);
    try {
      await onDone();
    } catch {
      setError('failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form class="lock-form" data-role="recovery-step" onSubmit={(e) => void confirm(e)}>
      <h2>{t('lock.recovery.title')}</h2>
      <p>{t('lock.recovery.desc')}</p>
      <p class="lock-code" data-role="recovery-code" data-code={code}>
        {spaced(code)}
      </p>
      <div class="lock-actions">
        <button type="button" data-role="recovery-copy" onClick={copy}>
          {t(copied ? 'lock.recovery.copied' : 'lock.recovery.copy')}
        </button>
        {/* 툴바 팝업은 저장 창이 뜨면 닫혀 새 코드를 잃을 수 있어, 화면의 코드를 복사해 두게 한다. */}
        {!toolbarPopup && (
          <button type="button" data-role="recovery-save" onClick={save}>
            {t('lock.recovery.save')}
          </button>
        )}
      </div>
      {savedConfirmation ? (
        <label class="check">
          <input
            type="checkbox"
            data-role="recovery-saved"
            checked={saved}
            disabled={busy}
            onChange={(event) => { setSaved(event.currentTarget.checked); setError(null); }}
          />
          <span>{t('lock.codeAccess.recoverySaved')}</span>
        </label>
      ) : <label>
        <span>{t('lock.recovery.confirm')}</span>
        <input
          type="text"
          class="field"
          data-role="recovery-confirm"
          autocomplete="off"
          spellcheck={false}
          value={typed}
          onInput={(e) => {
            setTyped(e.currentTarget.value);
            setError(null);
          }}
        />
      </label>}
      {error && (
        <p class="error" role="alert" data-role="recovery-error">
          {t(error === 'mismatch' ? 'lock.recovery.mismatch' : 'lock.error.failed')}
        </p>
      )}
      <button type="submit" class="primary" data-role="recovery-confirm-submit" disabled={busy || (savedConfirmation && !saved)}>
        {t(savedConfirmation ? 'lock.codeAccess.setupContinue' : 'lock.recovery.submit')}
      </button>
    </form>
  );
}
