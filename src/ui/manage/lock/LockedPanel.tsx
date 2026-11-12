import { useCallback, useEffect, useState } from 'preact/hooks';
import { WrongSecretError } from '../../../core/crypto/errors';
import { supportsPasskeys } from '../../../core/browser';
import { changePassword, disableLock, isLocked, lockNow, replaceRecoveryCode } from '../../../store/lock';
import { NO_POLICY, onPolicyChanged, passwordMeetsPolicy, readPolicy, type Policy } from '../../../store/policy';
import { newRecoveryCode } from '../../../core/crypto/recovery';
import { reauthenticate } from '../../shared/reauth';
import type { useT } from '../../shared/use-t';
import { CodeAccessPanel } from './CodeAccessPanel';
import { PasskeyPanel } from './PasskeyPanel';
import { PasswordFields } from './PasswordFields';
import { TimingPanel } from './TimingPanel';

type T = ReturnType<typeof useT>;
type RecoveryHandler = (code: string, commit: () => Promise<void>) => void;

const MIN_PASSWORD = 8;

function ChangeForm({ t }: { t: T }) {
  const [current, setCurrent] = useState('');
  const [pw1, setPw1] = useState('');
  const [pw2, setPw2] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  // 관리자 정책: 첫 그리기는 정책 없음으로 두고 읽으면 바꾼다.
  const [policy, setPolicy] = useState<Policy>(NO_POLICY);

  useEffect(() => {
    void readPolicy().then(setPolicy);
  }, []);

  const submit = async (e: Event) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setDone(false);
    if (pw1.length < MIN_PASSWORD) return setError('lock.error.short');
    if (pw1 !== pw2) return setError('lock.error.mismatch');
    const latest = await readPolicy();
    setPolicy(latest);
    if (!passwordMeetsPolicy(latest, pw1)) return setError('lock.error.policy');
    const [cur, next] = [current, pw1];
    setBusy(true);
    try {
      await reauthenticate(cur);
      await changePassword(next);
      setDone(true);
    } catch (err) {
      setError(err instanceof WrongSecretError ? 'lock.error.wrong' : 'lock.error.failed');
    } finally {
      setCurrent('');
      setPw1('');
      setPw2('');
      setBusy(false);
    }
  };

  return (
    <form class="lock-form" data-role="lock-change-form" onSubmit={(e) => void submit(e)}>
      <h2>{t('lock.change.title')}</h2>
      <label>
        <span>{t('lock.reauth')}</span>
        <input
          type="password"
          class="field"
          data-role="lock-change-current"
          autocomplete="current-password"
          disabled={busy}
          value={current}
          onInput={(e) => setCurrent(e.currentTarget.value)}
        />
      </label>
      <PasswordFields
        t={t}
        roles={{ first: 'lock-change-password', second: 'lock-change-password2' }}
        pw1={pw1}
        pw2={pw2}
        onPw1={setPw1}
        onPw2={setPw2}
        disabled={busy}
      />
      {error && (
        <p class="error" role="alert" data-role="lock-change-error">
          {error === 'lock.error.policy' && policy.passwordPolicyHint
            ? policy.passwordPolicyHint
            : t(error)}
        </p>
      )}
      {done && <p data-role="lock-change-done">{t('lock.change.done')}</p>}
      <button type="submit" data-role="lock-change" disabled={busy}>
        {t('lock.change')}
      </button>
    </form>
  );
}

function DisableForm({ t, codeProtection }: { t: T; codeProtection: boolean }) {
  const [current, setCurrent] = useState('');
  const [ack, setAck] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: Event) => {
    e.preventDefault();
    if (busy || !ack || codeProtection) return;
    const value = current;
    setError(null);
    setBusy(true);
    try {
      // 끄기 직전에 정책을 다시 읽는다(화면이 열린 사이 바뀌었을 수 있다).
      if ((await readPolicy()).enforcePassword) {
        setError('lock.policy.keepEnabled');
        return;
      }
      await reauthenticate(value);
      // 재확인하는 사이 정책이 켜졌을 수 있다.
      if ((await readPolicy()).enforcePassword) {
        setError('lock.policy.keepEnabled');
        return;
      }
      await disableLock();
    } catch (err) {
      setError(err instanceof WrongSecretError ? 'lock.error.wrong' : 'lock.error.failed');
    } finally {
      setCurrent('');
      setBusy(false);
    }
  };

  return (
    <form class="lock-form" data-role="lock-disable-form" onSubmit={(e) => void submit(e)}>
      <h2>{t('lock.disable.title')}</h2>
      {codeProtection && <p class="muted" data-role="lock-disable-protected">{t('lock.codeAccess.disableFirst')}</p>}
      <p class="error">{t('lock.disable.warn')}</p>
      <label class="check">
        <input
          type="checkbox"
          data-role="lock-disable-ack"
          checked={ack}
          disabled={busy || codeProtection}
          onChange={(e) => setAck(e.currentTarget.checked)}
        />
        {t('lock.disable.ack')}
      </label>
      <label>
        <span>{t('lock.reauth')}</span>
        <input
          type="password"
          class="field"
          data-role="lock-disable-current"
          autocomplete="current-password"
          disabled={busy || codeProtection}
          value={current}
          onInput={(e) => setCurrent(e.currentTarget.value)}
        />
      </label>
      {error && (
        <p class="error" role="alert" data-role="lock-disable-error">
          {t(error)}
        </p>
      )}
      <button type="submit" class="danger" data-role="lock-disable" disabled={busy || !ack || codeProtection}>
        {t('lock.disable')}
      </button>
    </form>
  );
}

// 새 복구 코드 만들기: 현재 비밀번호를 다시 확인한 뒤 새 코드로 복구 코드 단계를 연다.
// 금고의 코드는 그 단계에서 다시 입력해 맞춘 뒤에야 바꾼다(commit).
function NewRecovery({ t, onCode }: { t: T; onCode: RecoveryHandler }) {
  const [current, setCurrent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: Event) => {
    e.preventDefault();
    if (busy) return;
    const value = current;
    setError(null);
    setBusy(true);
    try {
      await reauthenticate(value);
      // 재확인하는 사이 다른 창에서 잠갔으면 새 코드를 열지 않는다(이후 잠기면 LockSection 이 걷는다).
      if (await isLocked()) return;
      const code = newRecoveryCode();
      onCode(code, () => replaceRecoveryCode(code));
    } catch (err) {
      setError(err instanceof WrongSecretError ? 'lock.error.wrong' : 'lock.error.failed');
    } finally {
      setCurrent('');
      setBusy(false);
    }
  };

  return (
    <form class="lock-form" data-role="recovery-new-form" onSubmit={(e) => void submit(e)}>
      <h2>{t('lock.recovery.new.title')}</h2>
      <p class="muted">{t('lock.recovery.new.desc')}</p>
      <label>
        <span>{t('lock.reauth')}</span>
        <input
          type="password"
          class="field"
          data-role="recovery-new-current"
          autocomplete="current-password"
          disabled={busy}
          value={current}
          onInput={(e) => setCurrent(e.currentTarget.value)}
        />
      </label>
      {error && (
        <p class="error" role="alert" data-role="recovery-new-error">
          {t(error)}
        </p>
      )}
      <button type="submit" data-role="recovery-new" disabled={busy}>
        {t('lock.recovery.new')}
      </button>
    </form>
  );
}

export function LockedPanel({
  t,
  credIds,
  onRecoveryCode,
  onSetup,
}: {
  t: T;
  credIds: string[];
  onRecoveryCode: RecoveryHandler;
  onSetup: () => void;
}) {
  // 정책을 읽기 전(null)에는 잠금 끄기를 그리지 않는다(비밀번호 강제 정책을 건너뛰지 않게).
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [readyPanels, setReadyPanels] = useState(0);
  const [codeProtection, setCodeProtection] = useState<boolean | null>(null);
  const timingReady = useCallback(() => setReadyPanels((value) => value | 1), []);
  const passkeyReady = useCallback(() => setReadyPanels((value) => value | 2), []);
  const codeAccessReady = useCallback(() => setReadyPanels((value) => value | 4), []);
  const protectionChanged = useCallback((value: boolean) => setCodeProtection(value), []);
  const ready = policy !== null && readyPanels === 7;

  useEffect(() => {
    let alive = true;
    const refresh = () => void readPolicy().then((next) => alive && setPolicy(next));
    refresh();
    // 열려 있는 동안 enforcePassword 가 바뀌면 잠금 끄기 칸을 바로 맞춘다.
    const off = onPolicyChanged(refresh);
    return () => { alive = false; off(); };
  }, []);

  return (
    <>
      {!ready && <div class="screen-loading" role="status">{t('popup.loading')}</div>}
      <div class="lock-panels" hidden={!ready}>
        <section class="lock-state-box">
          <p data-role="lock-state" data-passkeys={credIds.length}>
            {credIds.length === 0 || !supportsPasskeys()
              ? t('lock.state.password')
              : t('lock.state.passkey', { count: credIds.length })}
          </p>
          <button type="button" data-role="lock-now" onClick={() => void lockNow()}>
            {t('lock.now')}
          </button>
        </section>
        <TimingPanel t={t} onReady={timingReady} />
        <PasskeyPanel t={t} credIds={credIds} onReady={passkeyReady} codeProtection={codeProtection !== false} />
        <CodeAccessPanel t={t} credIds={credIds} onReady={codeAccessReady} onProtectionChanged={protectionChanged} onSetup={onSetup} />
        <ChangeForm t={t} />
        <NewRecovery t={t} onCode={onRecoveryCode} />
        {policy !== null && !policy.enforcePassword && <DisableForm t={t} codeProtection={codeProtection !== false} />}
      </div>
    </>
  );
}
