import { useEffect, useState } from 'preact/hooks';
import { enableLock } from '../../../store/lock';
import { NO_POLICY, passwordMeetsPolicy, readPolicy, type Policy } from '../../../store/policy';
import { loadSettings } from '../../../store/settings';
import { supportsBrowserSync, syncConsentGranted } from '../../../core/browser';
import type { useT } from '../../shared/use-t';
import { PasswordFields } from './PasswordFields';

type T = ReturnType<typeof useT>;

const MIN_PASSWORD = 8;

export function EnableForm({ t, onEnabled }: { t: T; onEnabled: (recoveryCode: string) => void }) {
  const [pw1, setPw1] = useState('');
  const [pw2, setPw2] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // 관리자 정책: 첫 그리기는 정책 없음으로 두고 읽으면 바꾼다.
  const [policy, setPolicy] = useState<Policy>(NO_POLICY);
  // 잠금을 켜면 브라우저 동기화가 시작되므로 미리 알린다.
  const [syncOn, setSyncOn] = useState(false);

  useEffect(() => {
    void readPolicy().then(setPolicy);
    // 파이어폭스는 데이터 전송 허용 전까지 동기화하지 않으니 그때는 안내하지 않는다.
    if (supportsBrowserSync()) void loadSettings().then(async (s) => setSyncOn(s.syncEnabled && await syncConsentGranted()), () => undefined);
  }, []);

  const submit = async (e: Event) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    if (pw1.length < MIN_PASSWORD) return setError('lock.error.short');
    if (pw1 !== pw2) return setError('lock.error.mismatch');
    // 제출 때 정책을 다시 읽는다(화면이 정책을 읽기 전에 눌러도 규칙을 건너뛰지 않게).
    const latest = await readPolicy();
    setPolicy(latest);
    if (!passwordMeetsPolicy(latest, pw1)) return setError('lock.error.policy');
    const value = pw1;
    setBusy(true);
    try {
      const { recoveryCode } = await enableLock(value);
      setPw1('');
      setPw2('');
      onEnabled(recoveryCode);
    } catch {
      setPw1('');
      setPw2('');
      setError('lock.error.failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form class="lock-form" data-role="lock-enable-form" onSubmit={(e) => void submit(e)}>
      <h2>{t('lock.enable.title')}</h2>
      <p class="muted">{t('lock.enable.desc')}</p>
      {syncOn && <p class="muted" data-role="lock-sync-note">{t('lock.enable.syncNote')}</p>}
      <PasswordFields
        t={t}
        roles={{ first: 'lock-password', second: 'lock-password2' }}
        pw1={pw1}
        pw2={pw2}
        onPw1={setPw1}
        onPw2={setPw2}
        disabled={busy}
      />
      {error && (
        <p class="error" role="alert" data-role="lock-error">
          {error === 'lock.error.policy' && policy.passwordPolicyHint
            ? policy.passwordPolicyHint
            : t(error)}
        </p>
      )}
      <button type="submit" class="primary" data-role="lock-enable" disabled={busy}>
        {t('lock.enable')}
      </button>
    </form>
  );
}
