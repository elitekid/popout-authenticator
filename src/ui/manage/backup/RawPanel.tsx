import { useState } from 'preact/hooks';
import type { AccountDraft } from '../../../core/account';
import { WrongSecretError } from '../../../core/crypto/errors';
import type { ImportMeta } from '../../../core/import/types';
import { LockedError } from '../../../store/errors';
import { buildRawCopy, isRawCopy, openRawCopy } from '../../../store/recover';
import { addDrafts, createVault, readVaultFile } from '../../../store/vault';
import type { useT } from '../../shared/use-t';
import { downloadText, today } from './download';

type T = ReturnType<typeof useT>;

export function RawSave({ t, big = false }: { t: T; big?: boolean }) {
  const [failed, setFailed] = useState(false);
  const save = async () => {
    try {
      downloadText(`popout-authenticator-raw-${today()}.json`, await buildRawCopy(), 'application/json');
      setFailed(false);
    } catch {
      setFailed(true);
    }
  };
  return (
    <>
      <button
        type="button"
        class={big ? 'primary backup-big' : undefined}
        data-role="raw-save"
        onClick={() => void save()}
      >
        {t('backup.raw.save')}
      </button>
      {failed && (
        <p class="error" role="alert">
          {t('add.error.save')}
        </p>
      )}
    </>
  );
}

type Result = { added: number; duplicates: number };

export function RawImport({ t, showSave }: { t: T; showSave: boolean }) {
  // 비밀번호를 물을 때 사본 글을 들고 있는다.
  const [pending, setPending] = useState<{ text: string; wrong: boolean } | null>(null);
  const [password, setPassword] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const open = async (text: string, pw?: string) => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      if (!isRawCopy(text)) {
        setPending(null);
        setError('backup.raw.notRaw');
        return;
      }
      const accounts = (await openRawCopy(text, pw === undefined ? undefined : { password: pw })).filter(
        (a) => a.deletedAt === undefined,
      );
      const drafts: AccountDraft[] = accounts.map((a) => ({
        type: a.type,
        issuer: a.issuer,
        label: a.label,
        secret: a.secret,
        algorithm: a.algorithm,
        digits: a.digits,
        period: a.period,
        ...(a.counter !== undefined ? { counter: a.counter } : {}),
      }));
      const meta: ImportMeta[] = accounts.map((a) => ({
        pinned: a.pinned,
        ...(a.group !== undefined ? { group: a.group } : {}),
        note: a.note,
        matchHosts: a.matchHosts,
      }));
      if (!(await readVaultFile())) {
        try {
          await createVault();
        } catch {
          // 다른 창이 먼저 만들었을 수 있다.
        }
      }
      const out = await addDrafts(drafts, meta);
      setPending(null);
      setResult({ added: out.added.length, duplicates: out.duplicates });
    } catch (e) {
      if (e instanceof LockedError || e instanceof WrongSecretError) {
        setPending({ text, wrong: e instanceof WrongSecretError });
      } else {
        setPending(null);
        setError('backup.raw.error');
      }
    } finally {
      setBusy(false);
    }
  };

  const onFile = async (input: HTMLInputElement) => {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    setPassword('');
    try {
      await open(await file.text());
    } catch {
      setError('backup.raw.error');
    }
  };

  const submit = (e: Event) => {
    e.preventDefault();
    if (busy || !pending || password === '') return;
    const pw = password;
    setPassword('');
    void open(pending.text, pw);
  };

  return (
    <section class="backup-raw" data-role="raw">
      <h2>{t('backup.raw.title')}</h2>
      {showSave && <RawSave t={t} />}
      <label>
        <span>{t('backup.raw.import')}</span>
        <input
          type="file"
          accept=".json,application/json"
          data-role="raw-file"
          disabled={busy}
          onChange={(e) => void onFile(e.currentTarget)}
        />
      </label>
      {pending && (
        <form class="backup-ask" data-role="raw-ask" onSubmit={submit}>
          <label>
            <span>{t('backup.raw.password')}</span>
            <input
              type="password"
              class="field"
              data-role="raw-password"
              value={password}
              onInput={(e) => setPassword(e.currentTarget.value)}
            />
          </label>
          {pending.wrong && (
            <p class="error" role="alert">
              {t('backup.wrong')}
            </p>
          )}
          <button type="submit" class="primary" data-role="raw-password-submit" disabled={busy}>
            {t('backup.submit')}
          </button>
        </form>
      )}
      {result && (
        <p class="ok" data-role="raw-result" data-added={result.added} data-duplicates={result.duplicates}>
          {t('backup.raw.result', result)}
        </p>
      )}
      {error && (
        <p class="error" role="alert">
          {t(error)}
        </p>
      )}
    </section>
  );
}
