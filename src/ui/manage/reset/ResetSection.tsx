import { useEffect, useRef, useState } from 'preact/hooks';
import type { VaultFile } from '../../../core/types';
import { clearFieldButtons } from '../../../store/field-buttons';
import { onPolicyChanged, readPolicy, type Policy } from '../../../store/policy';
import { openTaskWindow, useScreenContext } from '../../shared/screen-context';
import { buildRawCopy } from '../../../store/recover';
import { clearSnapshots } from '../../../store/snapshots';
import { onVaultChanged, readVaultFile, withVaultWriteLock } from '../../../store/vault';
import { useT } from '../../shared/use-t';
import { downloadText, today } from '../backup/download';

async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(hash, (b) => b.toString(16).padStart(2, '0')).join('');
}

// 금고가 바뀌었는지 가르는 표식: 암호문·iv 와 잠금 정보(비밀번호·복구 코드·패스키 변경은 lock·wrappedKeys 만 바뀐다).
function vaultMark(file: VaultFile | null): string {
  return file === null ? '' : `${file.iv}:${file.data}:${JSON.stringify(file.lock)}:${JSON.stringify(file.wrappedKeys)}`;
}

export function ResetSection() {
  const t = useT();
  const { toolbarPopup } = useScreenContext();
  const [policy, setPolicy] = useState<Policy | null>(null);
  useEffect(() => {
    let alive = true;
    const refresh = () => void readPolicy().then((next) => alive && setPolicy(next));
    refresh();
    const off = onPolicyChanged(refresh);
    return () => { alive = false; off(); };
  }, []);
  // saved: 저장한 파일의 SHA-256 이 방금 만든 백업과 같다고 확인된 상태.
  const [saved, setSaved] = useState(false);
  const [ack, setAck] = useState(false);
  const [withSync, setWithSync] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<'backup' | 'reset' | 'mismatch' | null>(null);
  // 다운로드를 시작한 뒤 확인을 기다리는 백업: 원문 대신 해시와 만든 때의 금고 표식만 남긴다.
  const [pending, setPending] = useState<{ digest: string; vault: string } | null>(null);
  const pendingRef = useRef<{ digest: string; vault: string } | null>(null);
  pendingRef.current = pending;
  const savedRef = useRef(false);
  const ackRef = useRef(false);
  savedRef.current = saved;
  ackRef.current = ack;

  // 확인을 기다리는 사이(또는 확인한 뒤) 금고가 바뀌면 그 백업은 더 이상 맞지 않는다.
  useEffect(() => onVaultChanged((file) => {
    const mark = pendingRef.current;
    if (mark === null || vaultMark(file) === mark.vault) return;
    pendingRef.current = null;
    setPending(null);
    setSaved(false);
    setAck(false);
  }), []);

  // 백업 내용은 받는 즉시 버린다. 상태에는 해시만 남긴다.
  const saveBackup = async () => {
    setError(null);
    setSaved(false);
    setPending(null);
    setBusy(true);
    try {
      const latest = await readPolicy();
      setPolicy(latest);
      if (latest.disableExport || latest.disableBackup) return;
      if (toolbarPopup) {
        await openTaskWindow('reset');
        return;
      }
      const text = await buildRawCopy();
      // 표식은 백업 원문 자체에서 얻는다(따로 읽으면 그 사이 저장된 새 내용의 표식이 붙는다).
      const mark = vaultMark((JSON.parse(text) as { local?: { vault?: VaultFile } }).local?.vault ?? null);
      const digest = await sha256Hex(new TextEncoder().encode(text));
      // 원문을 만드는 사이 정책이 켜졌으면 내려받지 않는다.
      const after = await readPolicy();
      if (after.disableExport || after.disableBackup) {
        setPolicy(after);
        return;
      }
      downloadText(`popout-authenticator-before-reset-${today()}.json`, text, 'application/json');
      // 저장 대화상자 취소는 알 수 없다(다운로드 권한이 없다). 저장한 파일을 골라 대조해야 다음 단계가 열린다.
      setPending({ digest, vault: mark });
    } catch {
      setError('backup');
    } finally {
      setBusy(false);
    }
  };

  const checkFile = async (input: HTMLInputElement) => {
    const file = input.files?.[0];
    input.value = '';
    const mark = pendingRef.current;
    if (!file || mark === null) return;
    setError(null);
    try {
      const digest = await sha256Hex(new Uint8Array(await file.arrayBuffer()));
      // 읽는 사이 금고가 바뀌어 확인이 무효가 됐으면 인정하지 않는다.
      if (pendingRef.current !== mark) return;
      if (digest === mark.digest) setSaved(true);
      else setError('mismatch');
    } catch {
      setError('mismatch');
    }
  };

  const run = async () => {
    if (!saved || !ack || busy) return;
    setBusy(true);
    setError(null);
    try {
      // 실행 직전에 정책을 다시 읽는다.
      const latest = await readPolicy();
      if (latest.disableBackup || latest.disableExport) {
        setPolicy(latest);
        return;
      }
      // 금고 쓰기 잠금 안에서 지운다. 다른 창의 저장·동기화가 지운 뒤 옛 금고를 다시 쓰지 못하게 줄을 세운다.
      // 쓰기 잠금을 기다리는 사이 금고가 바뀌었거나 확인이 풀렸으면 지우지 않는다.
      const expected = pendingRef.current?.vault;
      const proceed = await withVaultWriteLock(async () => {
        if (expected === undefined || pendingRef.current?.vault !== expected || !savedRef.current || !ackRef.current) return false;
        if (vaultMark(await readVaultFile()) !== expected) return false;
        if (withSync) await chrome.storage.sync.clear();
        await chrome.storage.local.clear();
        await chrome.storage.session.clear();
        await clearSnapshots();
        return true;
      });
      if (!proceed) {
        pendingRef.current = null;
        setPending(null);
        setSaved(false);
        setAck(false);
        setError('reset');
        return;
      }
      // 데이터를 지운 뒤 페이지 스크립트 등록과 사이트 권한도 거둔다(실패해도 초기화는 끝난 것이다).
      await clearFieldButtons().catch(() => undefined);
      setDone(true);
    } catch {
      setError('reset');
    } finally {
      setBusy(false);
    }
  };

  if (policy === null) return <div class="screen-loading" role="status">{t('popup.loading')}</div>;
  // 초기화는 사전 백업 없이는 진행하지 않으므로 백업을 끈 정책에서는 초기화도 막는다.
  if (policy.disableBackup) return <p class="muted" data-role="backup-blocked">{t('backup.policy.noBackup')}</p>;
  if (policy.disableExport) return <p class="muted" data-role="export-blocked">{t('backup.policy.noExport')}</p>;

  if (done) {
    return (
      <div class="reset" data-section="reset">
        <p class="ok" data-role="reset-done">
          {t('reset.done')}
        </p>
        <p class="muted">{t('reset.done.note')}</p>
      </div>
    );
  }

  return (
    <div class="reset" data-section="reset">
      <section data-role="reset-backup">
        <p class="muted">{t('reset.backup.desc')}</p>
        <button type="button" data-role="reset-backup-save" disabled={busy} onClick={() => void saveBackup()}>
          {t('reset.backup.save')}
        </button>
        {pending !== null && !saved && (
          <div data-role="reset-backup-verify">
            <p class="muted">{t('backup.savedFile.hint')}</p>
            <label>
              <span>{t('backup.savedFile.select')}</span>
              <input
                type="file"
                accept=".json,application/json"
                data-role="reset-backup-file"
                onChange={(e) => void checkFile(e.currentTarget)}
              />
            </label>
          </div>
        )}
        {error === 'mismatch' && (
          <p class="error" role="alert" data-role="reset-backup-mismatch">
            {t('backup.savedFile.mismatch')}
          </p>
        )}
        {saved && (
          <p class="ok" data-role="reset-backup-saved">
            {t('backup.savedFile.verified')}
          </p>
        )}
        {error === 'backup' && (
          <p class="error" role="alert" data-role="reset-backup-failed">
            {t('reset.backup.failed')}
          </p>
        )}
      </section>
      {saved && (
        <section data-role="reset-confirm">
          <p class="error">{t('reset.warn')}</p>
          <label class="check">
            <input
              type="checkbox"
              data-role="reset-sync"
              checked={withSync}
              onChange={(e) => setWithSync(e.currentTarget.checked)}
            />
            <span>{t('reset.sync')}</span>
          </label>
          <label class="check">
            <input
              type="checkbox"
              data-role="reset-ack"
              checked={ack}
              onChange={(e) => setAck(e.currentTarget.checked)}
            />
            <span>{t('reset.ack')}</span>
          </label>
          <button
            type="button"
            class="danger"
            data-role="reset-run"
            disabled={!saved || !ack || busy}
            onClick={() => void run()}
          >
            {t('reset.run')}
          </button>
          {error === 'reset' && (
            <p class="error" role="alert" data-role="reset-failed">
              {t('reset.failed')}
            </p>
          )}
        </section>
      )}
    </div>
  );
}
