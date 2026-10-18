import { useState } from 'preact/hooks';
import {
  buildCxf,
  buildEncryptedBackup,
  buildOtpauthText,
  buildPlainBackup,
  verifyExport,
  type ExportKind,
  type VerifyResult,
} from '../../../core/export';
import { encodeMigration } from '../../../core/migration';
import { buildOtpauth } from '../../../core/uri';
import { WrongSecretError } from '../../../core/crypto/errors';
import { loadAccounts } from '../../../store/vault';
import { backupSignature } from '../../popup/logic';
import { QrSvg } from '../../shared/QrSvg';
import { reauthenticate } from '../../shared/reauth';
import type { useT } from '../../shared/use-t';
import { downloadText, today } from './download';

type T = ReturnType<typeof useT>;
type Format = Extract<ExportKind, 'own-encrypted' | 'own-plain' | 'otpauth-text' | 'cxf'> | 'qr-each' | 'google-batch';
type QrItem = { text: string; name: string };
// 만든 결과: 파일(text 있음) 또는 QR 묶음(qr 있음)
type Built = {
  skipped: string[];
  sig: string;
  verify: VerifyResult;
  file?: { text: string; ext: 'json' | 'txt' };
  qr?: { kind: 'each' | 'batch'; items: QrItem[] };
};

const FORMATS: Format[] = ['own-encrypted', 'own-plain', 'otpauth-text', 'cxf', 'qr-each', 'google-batch'];
const MIN_PASSWORD = 8;

export function ExportPanel({ t, lockOn }: { t: T; lockOn: boolean }) {
  const [format, setFormat] = useState<Format>('own-encrypted');
  const [pw1, setPw1] = useState('');
  const [pw2, setPw2] = useState('');
  const [ack, setAck] = useState(false);
  const [reauthPw, setReauthPw] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [built, setBuilt] = useState<Built | null>(null);
  const [index, setIndex] = useState(0);

  const encrypted = format === 'own-encrypted';
  const plain = !encrypted;

  const pick = (next: Format) => {
    setFormat(next);
    setPw1('');
    setPw2('');
    setAck(false);
    setError(null);
    setBuilt(null);
    setIndex(0);
  };

  const make = async () => {
    setError(null);
    setBuilt(null);
    setIndex(0);
    if (encrypted) {
      if (pw1.length < MIN_PASSWORD) return setError('backup.error.short');
      if (pw1 !== pw2) return setError('backup.error.mismatch');
    }
    setBusy(true);
    try {
      if (lockOn) await reauthenticate(reauthPw);
      const accounts = await loadAccounts();
      const live = accounts.filter((a) => a.deletedAt === undefined);
      const sig = backupSignature(live);
      const file = async (text: string, ext: 'json' | 'txt', kind: ExportKind, skipped: string[], pw?: string) => {
        const verify = await verifyExport(accounts, kind, text, pw);
        setBuilt({ skipped, sig, verify, file: { text, ext } });
      };
      if (format === 'own-encrypted') {
        await file(await buildEncryptedBackup(accounts, pw1), 'json', format, [], pw1);
      } else if (format === 'own-plain') {
        await file(buildPlainBackup(accounts), 'json', format, []);
      } else if (format === 'otpauth-text') {
        const out = buildOtpauthText(accounts);
        await file(out.text, 'txt', format, out.skipped);
      } else if (format === 'cxf') {
        const out = buildCxf(accounts);
        await file(out.text, 'json', format, out.skipped);
      } else if (format === 'qr-each') {
        const items: QrItem[] = [];
        const skipped: string[] = [];
        for (const a of live) {
          const text = buildOtpauth(a);
          if (text === null) skipped.push(a.label);
          else items.push({ text, name: a.issuer !== '' ? `${a.issuer} ${a.label}` : a.label });
        }
        // QR 도 담긴 링크를 다시 읽어 대조한다(계정별 QR 은 otpauth 줄 묶음과 같은 내용).
        const verify = await verifyExport(accounts, 'otpauth-text', items.map((i) => i.text).join('\n'));
        setBuilt({ skipped, sig, verify, qr: { kind: 'each', items } });
      } else {
        const batchId = crypto.getRandomValues(new Uint32Array(1))[0]! & 0x7fffffff;
        const out = encodeMigration(live, batchId);
        setBuilt({
          skipped: out.skipped.map((s) => s.label),
          sig,
          verify: await verifyExport(accounts, 'google-batch', out.uris),
          qr: { kind: 'batch', items: out.uris.map((text) => ({ text, name: '' })) },
        });
      }
      setPw1('');
      setPw2('');
      setReauthPw('');
    } catch (e) {
      setReauthPw('');
      setError(e instanceof WrongSecretError ? 'backup.wrong' : 'backup.error.make');
    } finally {
      setBusy(false);
    }
  };

  const download = () => {
    if (!built?.file) return;
    const file = built.file;
    downloadText(
      `popout-authenticator-${today()}.${file.ext}`,
      file.text,
      file.ext === 'json' ? 'application/json' : 'text/plain',
    );
    // 다시 읽어 전부 맞고 빠진 계정이 없을 때만 백업한 것으로 친다(팝업 알림 띠가 읽는다).
    // 저장 대화상자 취소는 알 수 없다(다운로드 권한이 없다).
    if (built.verify.found === built.verify.expected && built.skipped.length === 0) {
      void chrome.storage.local.set({ backupInfo: { at: Date.now(), sig: built.sig } });
    }
  };

  const qr = built?.qr;
  const current = qr?.items[index];
  const verify = built?.verify;

  return (
    <section class="backup-export" data-role="export">
      <h2>{t('backup.export.title')}</h2>
      <label>
        <span>{t('backup.format')}</span>
        <select
          class="field"
          data-role="export-format"
          disabled={busy}
          value={format}
          onChange={(e) => pick(e.currentTarget.value as Format)}
        >
          {FORMATS.map((f) => (
            <option key={f} value={f}>
              {t(`backup.format.${f}`)}
            </option>
          ))}
        </select>
      </label>

      {encrypted && (
        <>
          <label>
            <span>{t('backup.password')}</span>
            <input
              type="password"
              class="field"
              data-role="export-password"
              autocomplete="new-password"
              value={pw1}
              onInput={(e) => setPw1(e.currentTarget.value)}
            />
          </label>
          <label>
            <span>{t('backup.password2')}</span>
            <input
              type="password"
              class="field"
              data-role="export-password2"
              autocomplete="new-password"
              value={pw2}
              onInput={(e) => setPw2(e.currentTarget.value)}
            />
          </label>
        </>
      )}

      {plain && (
        <div class="backup-warn" data-role="plain-warning">
          <p>{t('backup.plain.warn')}</p>
          <label class="check">
            <input
              type="checkbox"
              data-role="plain-ack"
              checked={ack}
              onChange={(e) => setAck(e.currentTarget.checked)}
            />
            {t('backup.plain.ack')}
          </label>
        </div>
      )}

      {lockOn && (
        <label>
          <span>{t('backup.reauth')}</span>
          <input
            type="password"
            class="field"
            data-role="reauth-password"
            autocomplete="off"
            value={reauthPw}
            onInput={(e) => setReauthPw(e.currentTarget.value)}
          />
        </label>
      )}

      <button
        type="button"
        class="primary"
        data-role="make"
        disabled={busy || (plain && !ack)}
        onClick={() => void make()}
      >
        {t('backup.make')}
      </button>
      {error && (
        <p class="error" role="alert" data-role="export-error">
          {t(error)}
        </p>
      )}

      {verify && (
        <div
          data-role="verify-result"
          data-expected={verify.expected}
          data-found={verify.found}
          class={verify.found < verify.expected ? 'error' : 'ok'}
        >
          <p>{t('backup.verify', { expected: verify.expected, found: verify.found })}</p>
          {verify.found < verify.expected && (
            <p role="alert">{t('backup.verify.missing', { names: verify.missing.join(', ') })}</p>
          )}
        </div>
      )}
      {built?.file && (
        <button type="button" data-role="download" onClick={download}>
          {t('backup.download')}
        </button>
      )}

      {qr && (
        <div class="backup-qr" data-role="qr-view" data-index={index} data-total={qr.items.length}>
          {current ? (
            <>
              <QrSvg text={current.text} />
              <p data-role="qr-caption">
                {qr.kind === 'each'
                  ? t('backup.qr.each', { total: qr.items.length, index: index + 1, name: current.name })
                  : t('backup.qr.batch', { total: qr.items.length, index: index + 1 })}
              </p>
              <div class="backup-qr-nav">
                <button
                  type="button"
                  data-role="qr-prev"
                  disabled={index === 0}
                  onClick={() => setIndex(index - 1)}
                >
                  {t('backup.qr.prev')}
                </button>
                <button
                  type="button"
                  data-role="qr-next"
                  disabled={index >= qr.items.length - 1}
                  onClick={() => setIndex(index + 1)}
                >
                  {t('backup.qr.next')}
                </button>
                <button type="button" data-role="qr-close" onClick={() => setBuilt(null)}>
                  {t('backup.qr.close')}
                </button>
              </div>
            </>
          ) : (
            <p>{t('backup.qr.empty')}</p>
          )}
        </div>
      )}

      {built && built.skipped.length > 0 && (
        <div data-role="skipped">
          <p>{t('backup.skipped')}</p>
          <ul>
            {built.skipped.map((name, i) => (
              <li key={i}>{name}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
