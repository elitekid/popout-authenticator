import type { ComponentChildren } from 'preact';
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { duplicateKey } from '../../../core/account';
import { encodeBase32, parseSecret } from '../../../core/base32';
import { generateCode } from '../../../core/otp';
import { knownSiteHosts } from '../../../core/known-sites';
import type { Account, Algorithm } from '../../../core/types';
import { LockedError } from '../../../store/errors';
import {
  fieldPatterns,
  readFieldButtons,
  readAutoFieldButtons,
  releaseUnusedOrigins,
  removeFieldButton,
  setFieldButton,
  syncFieldScripts,
} from '../../../store/field-buttons';
import { moveToTrash } from '../../../store/trash';
import { loadAccounts, onVaultChanged, updateAccounts } from '../../../store/vault';
import { UnlockForm } from '../../shared/UnlockForm';
import { useT } from '../../shared/use-t';
import { useScreenContext } from '../../shared/screen-context';

import { HistoryPanel } from './HistoryPanel';

type T = ReturnType<typeof useT>;

const ALGORITHMS: Algorithm[] = ['SHA-1', 'SHA-256', 'SHA-512'];
const GROUP_MAX = 64;

// 저장 시점에 비밀키가 이미 바뀌었거나 다른 계정과 겹치면 저장을 멈춘다.
class SecretConflict extends Error {
  constructor(readonly key: string) {
    super(key);
  }
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

// 호스트만 남긴다. 주소로 읽히지 않으면 입력 그대로 소문자.
function parseHosts(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(/[,\n]+/)) {
    const s = raw.trim();
    if (s === '') continue;
    let host: string;
    try {
      host = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`).hostname;
    } catch {
      host = s.toLowerCase();
    }
    if (host !== '' && !out.includes(host)) out.push(host);
  }
  return out;
}

// 칸 옆 단추에 쓸 수 있는 호스트(패턴이 만들어지는 것)와 그 패턴들.
function fieldTargets(hostList: string[]): { hosts: string[]; patterns: string[] } {
  const usable = hostList.filter((h) => fieldPatterns(h) !== null);
  const patterns = [...new Set(usable.flatMap((h) => fieldPatterns(h) ?? []))];
  return { hosts: usable, patterns };
}

export function AccountsSection({ initialEditId, onDone, onEdit, onHistory }: { initialEditId?: string; onDone?: () => void; onEdit?: (id: string) => void; onHistory?: (id: string) => void; children?: ComponentChildren } = {}) {
  const t = useT();
  const [list, setList] = useState<Account[] | null>(null);
  const [locked, setLocked] = useState(false);
  const [failed, setFailed] = useState(false);
  const sequence = useRef(0);
  const [editId, setEditId] = useState<string | null>(
    () => initialEditId ?? new URLSearchParams(location.search).get('edit'),
  );

  const [historyId, setHistoryId] = useState<string | null>(() => new URLSearchParams(location.search).get('history'));

  const load = useCallback(async () => {
    const mine = ++sequence.current;
    try {
      const all = await loadAccounts();
      if (mine !== sequence.current) return;
      setList(all.filter((a) => a.deletedAt === undefined));
      setLocked(false);
      setFailed(false);
    } catch (error) {
      if (mine !== sequence.current) return;
      if (error instanceof LockedError) { setList(null); setLocked(true); }
      else setFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
    const offVault = onVaultChanged(() => void load());
    // 다른 창·자동 잠금으로 잠기면 편집 화면(비밀키 표시 포함)을 바로 걷는다.
    const onSession = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== 'session' || !('vaultKey' in changes)) return;
      if (changes.vaultKey.newValue === undefined) {
        sequence.current++;
        setList(null);
        setLocked(true);
      } else void load();
    };
    chrome.storage.onChanged.addListener(onSession);
    return () => { sequence.current++; offVault(); chrome.storage.onChanged.removeListener(onSession); };
  }, [load]);

  const editing = list?.find((a) => a.id === editId) ?? null;

  if (historyId) return <div class="accounts" data-section="accounts">
    <button type="button" data-role="history-back" onClick={() => { setHistoryId(null); void load(); }}>{t('popup.back')}</button>
    <HistoryPanel accountId={historyId} />
  </div>;

  return (
    <div class="accounts" data-section="accounts">
      {!locked && !failed && list === null && <div class="screen-loading" role="status">{t('popup.loading')}</div>}
      {locked && <UnlockForm onUnlocked={() => void load()} />}
      {!locked && failed && (
        <p class="error" role="alert">
          {t('accounts.loadFailed')}
        </p>
      )}
      {!locked && list && editing && (
        <AccountEditor
          key={editing.id}
          t={t}
          account={editing}
          all={list}
          onHistory={() => onHistory ? onHistory(editing.id) : setHistoryId(editing.id)}
          hideBack={initialEditId !== undefined && onDone !== undefined}
          onLocked={() => setLocked(true)}
          onSaved={() => void load()}
          onDone={() => {
            if (onDone) onDone();
            else { setEditId(null); void load(); }
          }}
        />
      )}
      {!locked && list && !editing && list.length === 0 && (
        <p class="empty" data-role="accounts-empty">
          {t('accounts.empty')}
        </p>
      )}
      {!locked && list && !editing && list.length > 0 && (
        <ul class="accounts-list">
          {list.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                data-role="account-row"
                data-account-id={a.id}
                onClick={() => onEdit ? onEdit(a.id) : setEditId(a.id)}
              >
                {a.pinned && <span class="pin">★</span>}
                <span class="account-names">
                  <span class="issuer">{a.issuer}</span>
                  <span class="label">{a.label}</span>
                </span>
                {a.group && <span class="chip">{a.group}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type EditorProps = {
  t: T;
  account: Account;
  all: Account[];
  hideBack: boolean;
  onHistory: () => void;
  onLocked: () => void;
  onDone: () => void;
  // 저장은 했지만 편집 화면을 유지할 때 최신 계정을 다시 받는다.
  onSaved: () => void;
};

type Errors = Partial<Record<'group' | 'digits' | 'period' | 'counter' | 'secret' | 'save', string>>;

function AccountEditor({ t, account, all, hideBack, onHistory, onLocked, onDone, onSaved }: EditorProps) {
  const { toolbarPopup, navigate } = useScreenContext();
  const fixed = account.type === 'steam' || account.type === 'battle';
  const [issuer, setIssuer] = useState(account.issuer);
  const [label, setLabel] = useState(account.label);
  const [group, setGroup] = useState(account.group ?? '');
  const [note, setNote] = useState(account.note);
  const [hosts, setHosts] = useState(account.matchHosts.join('\n'));
  const [algorithm, setAlgorithm] = useState<Algorithm>(account.algorithm);
  const [digits, setDigits] = useState(String(account.digits));
  const [period, setPeriod] = useState(String(account.period));
  const [counter, setCounter] = useState(String(account.counter ?? 0));
  const [pinned, setPinned] = useState(account.pinned);
  const [shown, setShown] = useState(false);
  const [broken, setBroken] = useState(account.secret.length === 0);
  const [newSecret, setNewSecret] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fieldOn, setFieldOn] = useState(() => {
    // 팝업에서 저장한 켜기 의도를 권한 창의 초안으로 이어 간다.
    // 실제 등록·권한 요청은 이 창에서 저장을 눌렀을 때만 한다.
    const query = new URLSearchParams(location.search);
    return !toolbarPopup && query.get('field') === '1' && query.get('edit') === account.id &&
      fieldTargets(account.matchHosts).hosts.length > 0;
  });
  const [autoFieldOn, setAutoFieldOn] = useState(false);
  const autoHosts = autoFieldOn ? knownSiteHosts(account.issuer) : [];
  const [fieldHosts, setFieldHosts] = useState<string[]>([]);
  const [fieldMsg, setFieldMsg] = useState<string | null>(null);
  const [fieldBusy, setFieldBusy] = useState(true);
  const hostsEdited = useRef(false);
  const fieldPending = fieldOn !== (fieldHosts.length > 0);

  useEffect(() => {
    let alive = true;
    void readFieldButtons().then(
      (all) => {
        const mine = all[account.id];
        if (alive && mine) {
          setFieldOn(true);
          setFieldHosts(mine);
          // 옛 버전에서 단추만 저장된 주소는 편집 초안으로 복구한다. 저장 전 금고는 바꾸지 않는다.
          if (!hostsEdited.current && mine.some((host) => !account.matchHosts.includes(host))) {
            setHosts([...new Set([...account.matchHosts, ...mine])].join('\n'));
            setFieldMsg('accounts.fieldButton.restored');
          }
        }
      },
      () => alive && setFieldMsg('common.loadError'),
    ).finally(() => { if (alive) setFieldBusy(false); });
    return () => {
      alive = false;
    };
  }, [account.id]);

  useEffect(() => {
    let alive = true;
    let sequence = 0;
    const refresh = () => {
      const mine = ++sequence;
      void readAutoFieldButtons().then(
        (state) => { if (alive && mine === sequence) setAutoFieldOn(state.enabled); },
        () => { if (alive && mine === sequence) setFieldMsg('common.loadError'); },
      );
    };
    const onStorage = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && 'autoFieldButtons' in changes) refresh();
    };
    refresh();
    chrome.storage.onChanged.addListener(onStorage);
    return () => { alive = false; chrome.storage.onChanged.removeListener(onStorage); };
  }, []);

  const hasDraft = issuer !== account.issuer || label !== account.label || group !== (account.group ?? '')
    || note !== account.note || hosts !== account.matchHosts.join('\n') || pinned !== account.pinned
    || (!fixed && (algorithm !== account.algorithm || digits !== String(account.digits)
      || (account.type === 'totp' && period !== String(account.period))))
    || (account.type === 'hotp' && counter !== String(account.counter ?? 0))
    || newSecret !== '' || fieldPending;

  // 사이트 주소와 같은 편집 초안이다. 실제 권한 요청·등록은 저장 단추에서 함께 확정한다.
  const toggleField = (box: HTMLInputElement) => {
    setFieldMsg(null);
    if (!box.checked) {
      setFieldOn(false);
      return;
    }
    const target = fieldTargets(parseHosts(hosts));
    if (target.patterns.length === 0) {
      box.checked = false;
      setFieldMsg('accounts.fieldButton.noHosts');
      return;
    }
    setFieldOn(true);
  };

  useEffect(() => {
    if (fieldBusy || new URLSearchParams(location.search).get('field') !== '1') return;
    const field = document.querySelector<HTMLInputElement>('[data-role="field-button"]');
    field?.scrollIntoView({ block: 'center' });
    field?.focus();
  }, [fieldBusy]);

  // 코드를 만들 수 없을 때만 비밀키 입력 칸을 연다.
  useEffect(() => {
    if (account.secret.length === 0) return;
    let alive = true;
    void generateCode(account, Date.now()).then(
      () => undefined,
      () => alive && setBroken(true),
    );
    return () => {
      alive = false;
    };
  }, [account]);

  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    try {
      // 권한이 거절돼 단추를 끈 경우엔 안내 문구가 보이도록 편집 화면을 닫지 않는다.
      // 거절돼도 계정은 저장됐으니 비교 기준(account)을 새로 받는다.
      if ((await work()) !== 'denied') onDone();
      else onSaved();
    } catch (error) {
      if (error instanceof LockedError) onLocked();
      else if (error instanceof SecretConflict) setErrors({ secret: error.key });
      else setErrors({ save: 'add.error.save' });
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    const next: Errors = {};
    const groupText = group.trim();
    if ([...groupText].length > GROUP_MAX) next.group = 'accounts.error.group';
    if (!fixed) {
      const d = Number(digits);
      if (digits.trim() === '' || !Number.isInteger(d) || d < 6 || d > 10) next.digits = 'add.error.digits';
      if (account.type === 'totp') {
        const p = Number(period);
        if (period.trim() === '' || !Number.isInteger(p) || p < 1 || p > 3600) next.period = 'add.error.period';
      }
    }
    if (account.type === 'hotp') {
      const c = Number(counter);
      if (counter.trim() === '' || !Number.isSafeInteger(c) || c < 0) next.counter = 'add.error.counter';
    }
    let secret: Uint8Array | undefined;
    if (broken && newSecret.trim() !== '') {
      try {
        secret = parseSecret(newSecret);
      } catch {
        next.secret = 'add.error.secret';
      }
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    // 단추를 켠 채 사이트 주소가 바뀌었으면 새 주소의 권한을 먼저 요청한다(아직 await 전이라 사용자 동작이 살아 있다).
    // 거절되거나 실패하면 화면의 주소와 허용 범위가 어긋나지 않게 항목을 지우고 스위치를 끈다.
    // 쓸 수 있는 호스트가 하나도 없어도 항목을 지운다.
    const fieldNext = fieldTargets(parseHosts(hosts));
    const fieldClear = !fieldOn ? fieldHosts.length > 0 : fieldNext.hosts.length === 0;
    // 툴바 팝업에서도 저장을 누른 이 문서가 직접 요청한다.
    // 별도 편집 창으로 넘기면 저장·허용을 다시 눌러야 하고, 다른 모니터에 뜰 수 있다.
    let fieldRequest: Promise<boolean | 'error'> | null = null;
    if (fieldOn && fieldNext.hosts.length > 0 && fieldNext.hosts.join('\n') !== fieldHosts.join('\n')) {
      try {
        fieldRequest = chrome.permissions.request({ origins: fieldNext.patterns }).catch((error: unknown) => {
          console.warn('field permission request', error);
          return 'error' as const;
        });
      } catch (error) {
        console.warn('field permission request', error);
        fieldRequest = Promise.resolve('error');
      }
    }
    const clearField = async () => {
      await removeFieldButton(account.id);
      await syncFieldScripts();
      await releaseUnusedOrigins();
      setFieldOn(false);
      setFieldHosts([]);
    };
    let accountSaved = false;
    const applyField = async (): Promise<'denied' | undefined> => {
      try {
        if (fieldClear) {
          await clearField();
          return undefined;
        }
        if (!fieldRequest) return undefined;
        const permission = await fieldRequest;
        if (permission !== true) {
          await clearField();
          setFieldMsg(permission === 'error' ? 'accounts.fieldButton.requestError' : 'accounts.fieldButton.denied');
          return 'denied';
        }
        await setFieldButton(account.id, fieldNext.hosts);
        await syncFieldScripts();
        await releaseUnusedOrigins();
        setFieldHosts(fieldNext.hosts);
      } catch (error) {
        // 계정 저장 뒤의 단추 설정 실패도 편집 화면에 남겨 알린다.
        if (accountSaved) onSaved();
        if (fieldRequest) {
          await fieldRequest;
          await releaseUnusedOrigins().catch(() => undefined);
        }
        throw error;
      }
      return undefined;
    };

    // 다른 창의 변경(카운터·고정 등)을 덮지 않게 이 화면에서 바꾼 칸만 최신 계정에 적용한다.
    const patch: Partial<Account> = {};
    if (issuer.trim() !== account.issuer) patch.issuer = issuer.trim();
    if (label.trim() !== account.label) patch.label = label.trim();
    if (note !== account.note) patch.note = note;
    const nextHosts = parseHosts(hosts);
    if (nextHosts.join('\n') !== account.matchHosts.join('\n')) patch.matchHosts = nextHosts;
    if (pinned !== account.pinned) patch.pinned = pinned;
    const groupChanged = groupText !== (account.group ?? '');
    if (!fixed) {
      if (algorithm !== account.algorithm) patch.algorithm = algorithm;
      if (Number(digits) !== account.digits) patch.digits = Number(digits);
      if (account.type === 'totp' && Number(period) !== account.period) patch.period = Number(period);
    }
    if (account.type === 'hotp' && Number(counter) !== (account.counter ?? 0)) patch.counter = Number(counter);
    if (!groupChanged && Object.keys(patch).length === 0 && !secret) {
      void run(applyField);
      return;
    }

    const now = Date.now();
    void run(async () => {
      try {
        await updateAccounts((list) => {
          const latest = list.find((a) => a.id === account.id);
          if (secret && latest) {
            // 다른 창에서 이미 키를 고쳤으면 다시 바꾸지 않는다. 겹침은 최신 목록으로 본다.
            if (!sameBytes(latest.secret, account.secret)) throw new SecretConflict('accounts.error.changed');
            const key = duplicateKey({ type: latest.type, secret });
            if (list.some((a) => a.id !== account.id && a.deletedAt === undefined && duplicateKey(a) === key)) {
              throw new SecretConflict('accounts.error.duplicate');
            }
          }
          return list.map((a) => {
            if (a.id !== account.id) return a;
            const base: Account = { ...a, ...patch, ...(secret ? { secret } : {}), updatedAt: now };
            if (!groupChanged) return base;
            const { group: _group, ...rest } = base;
            return groupText !== '' ? { ...rest, group: groupText } : rest;
          });
        });
        accountSaved = true;
      } catch (error) {
        // 저장이 실패했으면 이번에 새로 받은 권한을 반납한다.
        if (fieldRequest) {
          await fieldRequest;
          await releaseUnusedOrigins().catch(() => undefined);
        }
        throw error;
      }
      return applyField();
    });
  };

  const text = (
    value: string,
    set: (v: string) => void,
    labelText: string,
    role: string,
    error?: string,
    inputType = 'text',
  ) => (
    <label>
      <span>{labelText}</span>
      <input
        type={inputType}
        class="field"
        data-role={role}
        autocomplete="off"
        value={value}
        onInput={(e) => set(e.currentTarget.value)}
      />
      {error && (
        <span class="error" role="alert" data-role={`${role}-error`}>
          {t(error)}
        </span>
      )}
    </label>
  );

  return (
    <form
      class="add-panel"
      data-role="account-editor"
      data-account-id={account.id}
      onSubmit={(e) => {
        e.preventDefault();
        if (!busy && !fieldBusy) save();
      }}
    >
      {!hideBack && <div>
        <button type="button" data-role="back" onClick={onDone}>
          {t('accounts.back')}
        </button>
      </div>}
      <div class="account-history-link">
        <button type="button" data-role="account-history" onClick={onHistory} disabled={busy || fieldBusy || hasDraft}>
          {t('history.title')}
        </button>
        {hasDraft && <p class="muted">{t('history.saveFirst')}</p>}
      </div>
      {text(issuer, setIssuer, t('add.issuer'), 'issuer')}
      {text(label, setLabel, t('add.label'), 'label')}
      {text(group, setGroup, t('accounts.group'), 'group', errors.group)}
      <label>
        <span>{t('accounts.note')}</span>
        <textarea
          class="field"
          rows={3}
          data-role="note"
          value={note}
          onInput={(e) => setNote(e.currentTarget.value)}
        />
      </label>
      {autoHosts.length > 0 && (
        <div class="muted" data-role="accounts-auto-field-hosts">
          <p>{t('accounts.fieldButton.autoHosts', { hosts: autoHosts.join(', ') })}</p>
          <a href="#settings" onClick={(event) => {
            if (navigate) { event.preventDefault(); navigate('settings'); }
          }}>{t('accounts.fieldButton.autoManage')}</a>
        </div>
      )}
      <label>
        <span>{t('accounts.hosts')}</span>
        <textarea
          class="field"
          rows={3}
          data-role="hosts"
          value={hosts}
          onInput={(e) => { hostsEdited.current = true; setHosts(e.currentTarget.value); }}
        />
      </label>
      <label class="check switch">
        <input
          type="checkbox"
          data-role="field-button"
          checked={fieldOn}
          disabled={busy || fieldBusy}
          onChange={(e) => toggleField(e.currentTarget)}
        />
        <span>{t('accounts.fieldButton')}</span>
      </label>
      <p class="muted">{t('accounts.fieldButton.hint')}</p>
      {fieldMsg && (
        <p class={fieldMsg === 'accounts.fieldButton.restored' ? 'muted' : 'error'} role={fieldMsg === 'accounts.fieldButton.restored' ? 'status' : 'alert'} data-role="field-button-error">
          {t(fieldMsg)}
        </p>
      )}
      {!fixed && (
        <>
          <label>
            <span>{t('add.algorithm')}</span>
            <select
              class="field"
              data-role="algorithm"
              value={algorithm}
              onChange={(e) => setAlgorithm(e.currentTarget.value as Algorithm)}
            >
              {ALGORITHMS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>
          <div class="form-row">
            {text(digits, setDigits, t('add.digits'), 'digits', errors.digits, 'number')}
            {account.type === 'totp' &&
              text(period, setPeriod, t('add.period'), 'period', errors.period, 'number')}
          </div>
        </>
      )}
      {account.type === 'hotp' &&
        text(counter, setCounter, t('add.counter'), 'counter', errors.counter, 'number')}
      <label class="check">
        <input
          type="checkbox"
          data-role="pinned"
          checked={pinned}
          onChange={(e) => setPinned(e.currentTarget.checked)}
        />
        {t('accounts.pinned')}
      </label>

      <div class="secret-box">
        <span>{t('accounts.secret')}</span>
        {shown && (
          <code data-role="secret-value">{encodeBase32(account.secret, { padding: false })}</code>
        )}
        <button type="button" data-role="secret-toggle" onClick={() => setShown((value) => !value)}>
          {t(shown ? 'accounts.secret.hide' : 'accounts.secret.show')}
        </button>
      </div>
      {broken && (
        <>
          <p class="error">{t('accounts.secret.broken')}</p>
          {text(newSecret, setNewSecret, t('accounts.secret.new'), 'secret-fix', errors.secret)}
        </>
      )}

      {errors.save && (
        <p class="error" role="alert" data-role="form-error">
          {t(errors.save)}
        </p>
      )}
      <div class="accounts-actions">
        <button type="submit" class="primary" data-role="save" disabled={busy || fieldBusy}>
          {t('add.save')}
        </button>
        {!confirming && (
          <button type="button" class="danger" data-role="delete" onClick={() => setConfirming(true)}>
            {t('accounts.delete')}
          </button>
        )}
      </div>
      {confirming && (
        <div class="accounts-confirm" data-role="delete-box">
          <p>{t('accounts.delete.confirm')}</p>
          <button
            type="button"
            class="danger"
            data-role="delete-confirm"
            disabled={busy}
            onClick={() => void run(() => moveToTrash([account.id]))}
          >
            {t('accounts.delete.yes')}
          </button>
          <button type="button" onClick={() => setConfirming(false)}>
            {t('accounts.cancel')}
          </button>
        </div>
      )}
    </form>
  );
}
