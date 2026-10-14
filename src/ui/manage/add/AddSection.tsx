import type { ComponentChildren } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { makeDraft, type AccountDraft } from '../../../core/account';
import { encodeBase32, parseSecret } from '../../../core/base32';
import { WrongSecretError } from '../../../core/crypto/errors';
import {
  ImportRejectedError,
  NeedsPasswordError,
  importText,
  type ImportFailure,
  type ImportMeta,
} from '../../../core/import';
import { generateCode, splitTypePrefix } from '../../../core/otp';
import type { Account, AccountType, Algorithm } from '../../../core/types';
import { parseLinks, parseOtpauth } from '../../../core/uri';
import { LockedError } from '../../../store/errors';
import { readPolicy, type Policy } from '../../../store/policy';
import {
  addDrafts,
  createVault,
  onVaultChanged,
  readVaultFile,
  updateAccounts,
} from '../../../store/vault';
import { UnlockForm } from '../../shared/UnlockForm';
import { useClockCorrection } from '../../shared/use-clock';
import { useT } from '../../shared/use-t';
import { openTaskWindow, useScreenContext } from '../../shared/screen-context';
import { formatCode } from '../../popup/logic';
import { QrPanel } from './QrPanel';

type T = ReturnType<typeof useT>;
type Tab = 'manual' | 'links' | 'file' | 'qr';
type Batch = { drafts: AccountDraft[]; meta: ImportMeta[]; failed: ImportFailure[] };
type Item = { name: string; text: string };
type Ask = { queue: Item[]; batch: Batch; wrong: boolean };
type Result = { added: number; duplicates: number; failed: ImportFailure[] };
type Form = {
  issuer: string;
  label: string;
  secret: string;
  type: AccountType;
  algorithm: Algorithm;
  digits: string;
  period: string;
  counter: string;
};
type TextKey = 'issuer' | 'label' | 'secret' | 'digits' | 'period' | 'counter';

const TABS: Tab[] = ['manual', 'links', 'file', 'qr'];
const TYPES: { id: AccountType; name: string }[] = [
  { id: 'totp', name: 'TOTP' },
  { id: 'hotp', name: 'HOTP' },
  { id: 'steam', name: 'Steam' },
  { id: 'battle', name: 'Battle.net' },
];
const ALGORITHMS: Algorithm[] = ['SHA-1', 'SHA-256', 'SHA-512'];
const GUESS_DIGITS = [6, 8];
const EMPTY_FORM: Form = {
  issuer: '',
  label: '',
  secret: '',
  type: 'totp',
  algorithm: 'SHA-1',
  digits: '6',
  period: '30',
  counter: '0',
};

// 실패 목록에 보이는 원문에서 비밀키·묶음 데이터를 가린다.
function maskSecret(source: string): string {
  return source.replace(/(secret|data)=[^&\s]*/gi, '$1=•••');
}

function formErrorKey(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  if (message.includes('digits')) return 'add.error.digits';
  if (message.includes('period')) return 'add.error.period';
  if (message.includes('counter')) return 'add.error.counter';
  return 'add.error.secret';
}

// 해석기의 내부 영문 오류는 UI에서 번역한다. QR 화면에서 이미 번역한 안내는 유지한다.
function importFailureMessage(reason: string, t: T, fallback = 'add.error.link'): string {
  for (const key of ['add.qr.notFound', 'add.qr.notOtp', 'add.qr.unreadable', 'add.links.truncated']) {
    if (reason === t(key)) return reason;
  }
  if (/secret|base32|hex/i.test(reason)) return t('add.error.secret');
  if (/digits/i.test(reason)) return t('add.error.digits');
  if (/period/i.test(reason)) return t('add.error.period');
  if (/counter/i.test(reason)) return t('add.error.counter');
  if (/otpauth|label encoding|invalid url/i.test(reason)) return t('add.error.link');
  return t(fallback);
}

const translateFailures = (failed: ImportFailure[], t: T, fallback?: string): ImportFailure[] =>
  failed.map((failure) => ({ ...failure, reason: importFailureMessage(failure.reason, t, fallback) }));

export function AddSection({ initialTab, onDone }: { initialTab?: Tab; onDone?: () => void; children?: ComponentChildren } = {}) {
  const t = useT();
  const { toolbarPopup } = useScreenContext();
  // 팝업의 카메라 단추가 ?tab=qr 로 열면 QR 칸에서 시작한다.
  const [tab, setTab] = useState<Tab>(() =>
    initialTab ?? (new URLSearchParams(location.search).get('tab') === 'file' ? 'file' :
      new URLSearchParams(location.search).get('tab') === 'qr' ? 'qr' : 'manual'),
  );
  const [form, setForm] = useState<Form>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [linksText, setLinksText] = useState('');
  const [ask, setAsk] = useState<Ask | null>(null);
  const [password, setPassword] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [saveError, setSaveError] = useState(false);
  const [verify, setVerify] = useState<Account[]>([]);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);
  const cameraActive = useRef(false);
  const revealResult = useRef(false);
  const privacyEpoch = useRef(0);
  const [locked, setLocked] = useState<{ retry: () => void } | null>(null);
  const [busy, setBusy] = useState(false);
  const scanQueue = useRef<Promise<void>>(Promise.resolve());
  // 관리자 정책: 비밀번호를 강제하는데 잠금이 꺼져 있으면 추가 입력 대신 안내를 보인다.
  // 정책·금고를 읽기 전(null)에는 입력을 그리지 않는다(비밀번호 강제 정책을 건너뛰지 않게).
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [lockOff, setLockOff] = useState<boolean | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    void readPolicy().then((p) => alive && setPolicy(p));
    const check = () =>
      void readVaultFile().then(
        (file) => { if (alive) { setLockOff(file === null || file.lock === 'none'); setLoadFailed(false); } },
        () => alive && setLoadFailed(true),
      );
    check();
    const off = onVaultChanged(check);
    const onSession = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'session' && changes.vaultKey && !changes.vaultKey.newValue) {
        privacyEpoch.current++;
        setVerify([]);
        setVerifyOpen(false);
      }
    };
    chrome.storage.onChanged.addListener(onSession);
    return () => {
      alive = false;
      privacyEpoch.current++;
      off();
      chrome.storage.onChanged.removeListener(onSession);
    };
  }, []);

  // 완료 안내를 입력 폼 아래에 묻지 않는다. 연속 카메라 스캔은 초점과 화면을 유지한다.
  useLayoutEffect(() => {
    if (!result || !revealResult.current || cameraActive.current) return;
    revealResult.current = false;
    resultRef.current?.focus({ preventScroll: true });
    resultRef.current?.scrollIntoView({ block: 'start', behavior: 'auto' });
  }, [result]);

  const reset = () => {
    setResult(null);
    setSaveError(false);
    setVerify([]);
    setVerifyOpen(false);
    revealResult.current = false;
    setLocked(null);
  };

  // 금고에 넣고 결과를 보고한다. 잠겨 있으면 풀린 뒤 다시 한다.
  // accumulate: 카메라처럼 여러 번 나눠 들어올 때 결과·확인 줄을 이어 붙인다.
  // 저장했거나 잠금 해제 뒤로 미뤘으면 true, 저장 오류면 false.
  const commit = async (batch: Batch, after?: () => void, accumulate = false): Promise<boolean> => {
    const epoch = privacyEpoch.current;
    setBusy(true);
    try {
      let added: Account[] = [];
      let duplicates = 0;
      if (batch.drafts.length > 0) {
        if (!(await readVaultFile())) {
          try {
            await createVault();
          } catch {
            // 다른 창이 먼저 만들었을 수 있다.
          }
        }
        ({ added, duplicates } = await addDrafts(batch.drafts, batch.meta));
      }
      revealResult.current = !accumulate && !cameraActive.current;
      setResult((prev) => ({
        added: added.length + (accumulate && prev ? prev.added : 0),
        duplicates: duplicates + (accumulate && prev ? prev.duplicates : 0),
        failed: [...(accumulate && prev ? prev.failed : []), ...batch.failed],
      }));
      if (epoch === privacyEpoch.current) {
        setVerify((prev) => (accumulate ? [...prev, ...added] : added));
      }
      after?.();
      return true;
    } catch (error) {
      if (error instanceof LockedError) {
        setVerify([]);
        setVerifyOpen(false);
        // 풀리기 전에 다른 묶음이 또 와도 앞서 못 넣은 것을 잃지 않게 이어 붙인다.
        setLocked((prev) => ({
          retry: () => {
            prev?.retry();
            void commit(batch, after, accumulate);
          },
        }));
        return true;
      }
      setSaveError(true);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const setField = (key: TextKey, value: string) => {
    if (/^\s*otpauth:\/\//i.test(value)) {
      try {
        const d = parseOtpauth(value);
        setForm({
          issuer: d.issuer,
          label: d.label,
          secret: encodeBase32(d.secret),
          type: d.type,
          algorithm: d.algorithm,
          digits: String(d.digits),
          period: String(d.period),
          counter: String(d.counter ?? 0),
        });
        setFormError(null);
      } catch {
        // 앞서 채운 다른 계정이 그대로 저장되지 않게 비밀키를 비운다.
        setForm((f) => ({ ...f, secret: '' }));
        setFormError('add.error.link');
      }
      return;
    }
    setForm((f) => ({ ...f, [key]: value }));
  };

  const saveManual = () => {
    if (busy) return;
    let draft: AccountDraft;
    try {
      const split = splitTypePrefix(form.secret.trim());
      const type = split.type ?? form.type;
      draft = makeDraft({
        type,
        issuer: form.issuer.trim(),
        label: form.label.trim(),
        secret: parseSecret(split.rest),
        algorithm: form.algorithm,
        digits: Number(form.digits),
        ...(type === 'totp' ? { period: Number(form.period) } : {}),
        ...(type === 'hotp' ? { counter: Number(form.counter) } : {}),
      });
    } catch (error) {
      setFormError(formErrorKey(error));
      return;
    }
    setFormError(null);
    reset();
    void commit({ drafts: [draft], meta: [{}], failed: [] }, () =>
      setForm((f) => ({ ...f, secret: '' })),
    );
  };

  const importLinks = () => {
    if (busy) return;
    const { drafts, failed, truncated } = parseLinks(linksText);
    if (drafts.length === 0 && failed.length === 0) failed.push({ source: '', reason: 'invalid url' });
    if (truncated) failed.push({ source: '', reason: t('add.links.truncated') });
    reset();
    // 비밀키가 든 링크를 화면 상태에 남기지 않는다.
    void commit({ drafts, meta: drafts.map(() => ({})), failed: translateFailures(failed, t) }, () => setLinksText(''));
  };

  // 파일을 차례로 읽는다. 비밀번호가 필요하면 멈추고 묻는다.
  const processFiles = async (queue: Item[], batch: Batch, pw?: string): Promise<void> => {
    setBusy(true);
    try {
      setAsk(null);
      for (let i = 0; i < queue.length; i++) {
        const item = queue[i]!;
        try {
          const out = await importText(item.text, i === 0 ? pw : undefined);
          batch.drafts.push(...out.drafts);
          batch.meta.push(...out.drafts.map((_, n) => out.meta?.[n] ?? {}));
          batch.failed.push(...translateFailures(out.failed, t, 'add.file.unreadable'));
        } catch (error) {
          if (error instanceof NeedsPasswordError || error instanceof WrongSecretError) {
            setAsk({ queue: queue.slice(i), batch, wrong: error instanceof WrongSecretError });
            return;
          }
          const reason =
            error instanceof ImportRejectedError
              ? error.reason === 'encrypted'
                ? t('add.rejected.encrypted', { app: error.app ?? '' })
                : t('add.rejected.unknown')
              : importFailureMessage(error instanceof Error ? error.message : String(error), t, 'add.file.unreadable');
          batch.failed.push({ source: item.name, reason });
        }
      }
      await commit(batch);
    } finally { setBusy(false); }
  };

  const onFiles = async (input: HTMLInputElement) => {
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (files.length === 0 || busy) return;
    setBusy(true);
    reset();
    const batch: Batch = { drafts: [], meta: [], failed: [] };
    const queue: Item[] = [];
    for (const f of files) {
      try {
        queue.push({ name: f.name, text: await f.text() });
      } catch {
        batch.failed.push({ source: f.name, reason: t('add.file.unreadable') });
      }
    }
    await processFiles(queue, batch);
  };

  const importImages = (batch: Batch) => {
    if (busy) return;
    reset();
    void commit({ ...batch, failed: translateFailures(batch.failed, t, 'add.qr.notOtp') });
  };

  // 카메라가 찾은 계정은 줄을 세워 하나씩 넣는다.
  const addScanned = (drafts: AccountDraft[], failed: ImportFailure[]): Promise<boolean> => {
    const run = scanQueue.current.then(() =>
      commit({ drafts, meta: drafts.map(() => ({})), failed: translateFailures(failed, t) }, undefined, true),
    );
    scanQueue.current = run.then(() => undefined);
    return run;
  };

  const submitPassword = (e: Event) => {
    e.preventDefault();
    if (busy || !ask || password === '') return;
    const pw = password;
    setPassword('');
    void processFiles(ask.queue, ask.batch, pw);
  };

  if (loadFailed) return <p class="error" role="alert">{t('common.loadError')}</p>;
  if (policy === null || lockOff === null) {
    return <div class="screen-loading" role="status">{t('popup.loading')}</div>;
  }
  if (policy.enforcePassword && lockOff) {
    return (
      <div class="add" data-section="add">
        <div class="notice" data-role="policy-need-password">
          <p>{t('add.policy.needPassword')}</p>
          <a href="#lock">{t('add.policy.openLock')}</a>
        </div>
      </div>
    );
  }

  return (
    <div class="add" data-section="add">
      {result && (
        <div
          class={`add-result${result.added > 0 ? ' added' : ''}`}
          ref={resultRef}
          tabIndex={-1}
          data-role="result"
          data-added={result.added}
          data-duplicates={result.duplicates}
          data-failed={result.failed.length}
        >
          <p class="add-result-title" role="status" aria-live="polite">
            {result.added > 0 ? t('add.success', { added: result.added }) : t('add.noAdded')}
          </p>
          {result.duplicates > 0 && <p>{t('add.duplicates', { n: result.duplicates })}</p>}
          {result.failed.length > 0 && <p>{t('add.failures', { n: result.failed.length })}</p>}
          <button type="button" class="primary" data-role="add-done" disabled={busy}
            onClick={() => { if (onDone) onDone(); else location.hash = 'accounts'; }}>
            {t('add.done')}
          </button>
          {result.failed.length > 0 && (
            <div class="add-result-failures">
              <ul>
                {result.failed.map((f, i) => (
                  <li key={i}>{maskSecret(f.source)}{f.source ? ': ' : ''}{f.reason}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      {verify.length > 0 && (
        <div class="add-verify">
          <button type="button" class="add-verify-toggle" data-role="verify-toggle"
            aria-expanded={verifyOpen} onClick={() => setVerifyOpen((open) => !open)}>
            {t('add.verify.toggle')} <span aria-hidden="true">{verifyOpen ? '−' : '+'}</span>
          </button>
          {verifyOpen && <VerifyList t={t} accounts={verify}
            onFixed={(next) => setVerify((list) => list.map((a) => a.id === next.id ? next : a))} />}
        </div>
      )}
      <div class="add-tabs" role="tablist">
        {TABS.map((id) => (
          <button
            type="button"
            key={id}
            role="tab"
            data-role={`tab-${id}`}
            aria-selected={tab === id}
            disabled={busy}
            onClick={() => setTab(id)}
          >
            {t(`add.tab.${id}`)}
          </button>
        ))}
      </div>

      {tab === 'manual' && (
        <ManualForm
          t={t}
          form={form}
          error={formError}
          setField={setField}
          setForm={setForm}
          onSave={saveManual}
          busy={busy}
        />
      )}

      {tab === 'links' && (
        <div class="add-panel">
          <label>
            <span>{t('add.links.label')}</span>
            <textarea
              class="field"
              rows={6}
              data-role="links-text"
              value={linksText}
              onInput={(e) => setLinksText(e.currentTarget.value)}
            />
          </label>
          <button type="button" class="primary" data-role="submit-links" disabled={busy || linksText.trim() === ''} onClick={importLinks}>
            {t('add.links.import')}
          </button>
        </div>
      )}

      {tab === 'file' && (
        <div class="add-panel">
          <label>
            {!toolbarPopup && <span>{t('add.file.label')}</span>}
            {toolbarPopup ? <button type="button" data-role="file-window" onClick={() => {
              void openTaskWindow('add', { tab: 'file' }).catch(() => setSaveError(true));
            }}>{t('add.file.label')}</button> : <input
              type="file"
              multiple
              accept=".json,.txt,application/json,text/plain"
              data-role="file-input"
              disabled={ask !== null || busy}
              onChange={(e) => void onFiles(e.currentTarget)}
            />}
          </label>
          {ask && (
            <form class="add-password" onSubmit={submitPassword}>
              <p>{t('add.password.needed')}</p>
              <label>
                <span>{t('add.password')}</span>
                <input
                  type="password"
                  class="field"
                  data-role="password"
                  value={password}
                  onInput={(e) => setPassword(e.currentTarget.value)}
                />
              </label>
              {ask.wrong && (
                <p class="error" role="alert">
                  {t('add.password.wrong')}
                </p>
              )}
              <button type="submit" class="primary" data-role="submit-password" disabled={busy}>
                {t('add.password.submit')}
              </button>
              <button type="button" data-role="cancel-password" disabled={busy} onClick={() => { setAsk(null); setPassword(''); }}>
                {t('accounts.cancel')}
              </button>
            </form>
          )}
        </div>
      )}

      {tab === 'qr' && (
        <QrPanel
          t={t}
          busy={busy}
          onBatch={importImages}
          onScanned={addScanned}
          onCameraStart={() => { cameraActive.current = true; reset(); }}
          onCameraStop={() => { cameraActive.current = false; }}
        />
      )}

      {locked && <UnlockForm onUnlocked={() => { const l = locked; setLocked(null); l.retry(); }} />}
      {saveError && (
        <p class="error" role="alert">
          {t('add.error.save')}
        </p>
      )}
    </div>
  );
}

type ManualProps = {
  t: T;
  form: Form;
  error: string | null;
  setField: (key: TextKey, value: string) => void;
  setForm: (update: (f: Form) => Form) => void;
  onSave: () => void;
  busy: boolean;
};

function ManualForm({ t, form, error, setField, setForm, onSave, busy }: ManualProps) {
  const fixed = form.type === 'steam' || form.type === 'battle';
  const text = (key: TextKey, label: string, role: string, inputType = 'text') => (
    <label>
      <span>{label}</span>
      <input
        type={inputType}
        class="field"
        data-role={role}
        autocomplete="off"
        value={form[key]}
        onInput={(e) => setField(key, e.currentTarget.value)}
      />
    </label>
  );
  return (
    <form
      class="add-panel"
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
    >
      {text('issuer', t('add.issuer'), 'issuer')}
      {text('label', t('add.label'), 'label')}
      {text('secret', t('add.secret'), 'secret')}
      <div class="form-row">
        <label>
          <span>{t('add.type')}</span>
          <select
            class="field"
            data-role="type"
            value={form.type}
            onChange={(e) => {
              const type = e.currentTarget.value as AccountType;
              setForm((f) => ({ ...f, type }));
            }}
          >
            {TYPES.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
        {!fixed && (
          <label>
            <span>{t('add.algorithm')}</span>
            <select
              class="field"
              data-role="algorithm"
              value={form.algorithm}
              onChange={(e) => {
                const algorithm = e.currentTarget.value as Algorithm;
                setForm((f) => ({ ...f, algorithm }));
              }}
            >
              {ALGORITHMS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {!fixed && (
        <div class="form-row">
          {text('digits', t('add.digits'), 'digits', 'number')}
          {form.type === 'totp' && text('period', t('add.period'), 'period', 'number')}
        </div>
      )}
      {form.type === 'hotp' && text('counter', t('add.counter'), 'counter', 'number')}
      {error && (
        <p class="error" role="alert" data-role="form-error">
          {t(error)}
        </p>
      )}
      <button type="submit" class="primary" data-role="submit-manual" disabled={busy}>
        {t('add.save')}
      </button>
    </form>
  );
}

// 선택적 진단을 펼친 동안에만 시계와 OTP 계산을 구독한다.
function VerifyList({ t, accounts, onFixed }: {
  t: T; accounts: Account[]; onFixed: (next: Account) => void;
}) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const correction = useClockCorrection();
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return <>
    <p class="muted">{t('add.verify.optional')}</p>
    {accounts.map((account) => <VerifyRow key={account.id} t={t} account={account}
      nowMs={nowMs + correction} onFixed={onFixed} />)}
  </>;
}

type VerifyProps = { t: T; account: Account; nowMs: number; onFixed: (next: Account) => void };

// 폰 앱 코드와 맞춰 보는 줄. 저장하지 않는다(알고리즘·자릿수를 고칠 때만 금고에 쓴다).
function VerifyRow({ t, account, nowMs, onFixed }: VerifyProps) {
  const [code, setCode] = useState('');
  const step = account.type === 'hotp' ? 0 : Math.floor(nowMs / 1000 / (account.type === 'totp' ? account.period : 30));
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const [options, setOptions] = useState<{ algorithm: Algorithm; digits: number; code: string }[]>(
    [],
  );

  useEffect(() => {
    let alive = true;
    void generateCode(account, nowMs).then((c) => alive && setCode(c), () => undefined);
    return () => {
      alive = false;
    };
    // 주기가 바뀔 때만 다시 계산한다(HOTP 는 계정이 바뀔 때만).
  }, [account, step]);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    const combos = ALGORITHMS.flatMap((algorithm) =>
      GUESS_DIGITS.map((digits) => ({ algorithm, digits })),
    );
    void Promise.all(
      combos.map(async (c) => ({ ...c, code: await generateCode({ ...account, ...c }, nowMs) })),
    ).then((list) => alive && setOptions(list), () => undefined);
    return () => {
      alive = false;
    };
  }, [open, account, step]);

  const pick = async (algorithm: Algorithm, digits: number) => {
    try {
      const updatedAt = Date.now();
      await updateAccounts((list) =>
        list.map((a) => (a.id === account.id ? { ...a, algorithm, digits, updatedAt } : a)),
      );
      setFailed(false);
      setOpen(false);
      onFixed({ ...account, algorithm, digits, updatedAt });
    } catch {
      setFailed(true);
    }
  };

  const timed = account.type === 'totp';
  return (
    <div class="add-verify-row" data-role="verify-row">
      <div class="add-verify-name">
        {account.issuer && <span class="issuer">{account.issuer}</span>}
        <span class="label">{account.label}</span>
      </div>
      <div class="add-verify-code-row">
        <span class="code" data-role="verify-code" data-code={code || undefined}>
          {formatCode(code)}
        </span>
        {timed && <button type="button" data-role="verify-diff" aria-expanded={open}
          onClick={() => setOpen(!open)}>{t('add.verify.settings')}</button>}
      </div>
      {failed && (
        <p class="error" role="alert">
          {t('add.error.save')}
        </p>
      )}
      {open && (
        <div class="add-verify-options">
          <p>{t('add.verify.pick')}</p>
          {options.map((o) => (
            <button
              type="button"
              key={`${o.algorithm}-${o.digits}`}
              data-role="verify-option"
              onClick={() => void pick(o.algorithm, o.digits)}
            >
              {t('add.verify.option', { algorithm: o.algorithm, digits: o.digits })} ·{' '}
              {formatCode(o.code)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
