import { useState } from 'preact/hooks';
import { WrongSecretError } from '../../core/crypto/errors';
import { unlockWithPassword } from '../../store/lock';
import { useT } from './use-t';

// 관리 페이지가 잠겨 있을 때 쓰는 비밀번호 풀기 양식. 풀리면 onUnlocked 를 부른다.
export function UnlockForm({ onUnlocked }: { onUnlocked: () => void }) {
  const t = useT();
  const [password, setPassword] = useState('');
  const [wrong, setWrong] = useState<'none' | 'wrong' | 'failed'>('none');

  const submit = async (e: Event) => {
    e.preventDefault();
    if (password === '') return;
    const value = password;
    setPassword('');
    try {
      await unlockWithPassword(value);
      setWrong('none');
      onUnlocked();
    } catch (error) {
      setWrong(error instanceof WrongSecretError ? 'wrong' : 'failed');
    }
  };

  return (
    <form class="unlock-form" data-role="unlock-form" onSubmit={(e) => void submit(e)}>
      <div class="badge" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <rect x="5" y="11" width="14" height="9" rx="2.5" />
          <path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3" />
        </svg>
      </div>
      <p class="unlock-title">{t('popup.unlock.title')}</p>
      <p class="unlock-hint">{t('popup.unlock.hint')}</p>
      <input
        type="password"
        class="field"
        data-role="unlock-password"
        aria-label={t('popup.unlock.password')}
        placeholder={t('popup.unlock.password')}
        value={password}
        onInput={(e) => {
          setPassword(e.currentTarget.value);
          setWrong('none');
        }}
      />
      {wrong !== 'none' && (
        <p class="error" role="alert">
          {t(wrong === 'wrong' ? 'popup.unlock.wrong' : 'popup.unlock.failed')}
        </p>
      )}
      <button type="submit" class="primary" data-role="unlock-submit">
        {t('popup.unlock.submit')}
      </button>
    </form>
  );
}
