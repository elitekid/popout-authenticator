import { useEffect, useState } from 'preact/hooks';
import { supportsBrowserSync } from '../../../core/browser';
import { LockedError } from '../../../store/errors';
import { onPolicyChanged, readPolicy } from '../../../store/policy';
import { loadSettings, onSettingsChanged } from '../../../store/settings';
import { isSyncActive } from '../../../store/sync';
import { loadAccounts, onVaultChanged, readVaultFile } from '../../../store/vault';
import { backupSignature, type BackupInfo } from '../../popup/logic';
import type { PanelProps } from './panel-props';

type Level = 'danger' | 'warning' | 'info';
type Item = { id: string; level: Level; link?: string; messageKey?: string };

type View = { items: Item[]; hasIgnored: boolean };

function asBackupInfo(raw: unknown): BackupInfo | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { at, sig } = raw as { at?: unknown; sig?: unknown };
  return typeof at === 'number' && typeof sig === 'string' ? { at, sig } : null;
}

function asIgnored(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((v): v is string => typeof v === 'string') : [];
}

// 마지막으로 복호화한 금고의 계정 수·백업 서명(암호문 글로 같은지 본다).
let summary: { data: string; count: number; sig: string } | null = null;

// 금고·설정·저장 값에서 지금 권할 항목을 계산한다.
async function compute(): Promise<View> {
  const [file, settings, local] = await Promise.all([
    readVaultFile(),
    loadSettings(),
    chrome.storage.local.get(['backupInfo', 'advisorIgnore']),
  ]);
  const ignored = asIgnored(local.advisorIgnore);
  const found: Item[] = [];

  if (file && file.lock === 'none') found.push({ id: 'password', level: 'danger', link: '#lock' });

  // 관리자가 백업을 껐으면 백업 권고를 내지 않는다.
  if (file && !(await readPolicy()).disableBackup) {
    const backupInfo = asBackupInfo(local.backupInfo);
    let needed = false;
    try {
      // 금고 암호문이 그대로면 앞서 구한 서명을 다시 쓴다(설정·숨기기 변화마다 복호화하지 않게).
      if (summary?.data !== file.data) {
        const active = (await loadAccounts()).filter((a) => a.deletedAt === undefined);
        summary = { data: file.data, count: active.length, sig: backupSignature(active) };
      }
      needed = summary.count > 0 && (!backupInfo || backupInfo.sig !== summary.sig);
    } catch (error) {
      // 잠겨서 계정을 못 읽으면 백업이 한 번도 없을 때만 권한다.
      if (!(error instanceof LockedError)) throw error;
      needed = file.count > 0 && !backupInfo;
    }
    if (needed) found.push({ id: 'backup', level: 'warning', link: '#backup' });
  }

  if (supportsBrowserSync() && file && !isSyncActive(settings, file)) found.push({
    id: 'sync', level: 'info',
    ...(settings.syncEnabled ? { messageKey: 'settings.sync.status.needs-lock', link: '#lock' } : {}),
  });
  if (!settings.suggestionsEnabled) found.push({ id: 'suggestions', level: 'info' });

  return { items: found.filter((item) => !ignored.includes(item.id)), hasIgnored: ignored.length > 0 };
}

// 링크는 같은 페이지 목차 단추를 눌러 영역을 바꾼다. 못 찾으면 주소만 바뀐다.
function openSection(event: MouseEvent, link: string) {
  const nav = document.querySelector<HTMLAnchorElement>(`.manage-nav a[href="${link}"]`);
  if (!nav) return;
  event.preventDefault();
  nav.click();
}

export function AdvisorPanel({ t, onReady }: Pick<PanelProps, 't'> & { onReady: () => void }) {
  const [view, setView] = useState<View | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    let seq = 0;
    const refresh = () => {
      const mine = ++seq;
      void compute().then(
        (next) => alive && mine === seq && setView(next),
        () => alive && mine === seq && setFailed(true),
      ).finally(() => { if (alive && mine === seq) onReady(); });
    };
    const onLocal = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && ('backupInfo' in changes || 'advisorIgnore' in changes)) refresh();
    };
    refresh();
    const offVault = onVaultChanged(refresh);
    const offPolicy = onPolicyChanged(refresh);
    const offSettings = onSettingsChanged(refresh);
    chrome.storage.onChanged.addListener(onLocal);
    return () => {
      alive = false;
      offVault();
      offPolicy();
      offSettings();
      chrome.storage.onChanged.removeListener(onLocal);
    };
  }, []);

  const ignore = async (id: string) => {
    setFailed(false);
    try {
      const got = await chrome.storage.local.get('advisorIgnore');
      const list = asIgnored(got.advisorIgnore);
      if (!list.includes(id)) await chrome.storage.local.set({ advisorIgnore: [...list, id] });
    } catch { setFailed(true); }
  };

  const showAgain = () => { setFailed(false); void chrome.storage.local.set({ advisorIgnore: [] }).catch(() => setFailed(true)); };

  if (view === null) return <section class="advisor" data-role="advisor">
    <h2>{t('advisor.title')}</h2>
    <p class={failed ? 'error' : 'muted'} role={failed ? 'alert' : 'status'}>{t(failed ? 'common.loadError' : 'popup.loading')}</p>
  </section>;

  return (
    <section class="advisor" data-role="advisor">
      <h2>{t('advisor.title')}</h2>
      {failed && <p class="error" role="alert">{t('common.actionError')}</p>}
      {view.items.length === 0 && (
        <p class="muted" data-role="advisor-none">
          {t('advisor.none')}
        </p>
      )}
      {view.items.length > 0 && (
        <ul class="advisor-list">
          {view.items.map((item) => (
            <li key={item.id} class={`advisor-${item.level}`} data-role="advisor-item" data-id={item.id} data-level={item.level}>
              <span>{t(item.messageKey ?? `advisor.${item.id}`)}</span>
              {item.link && (
                <a href={item.link} data-role="advisor-link" onClick={(e) => openSection(e, item.link as string)}>
                  {t('advisor.go')}
                </a>
              )}
              <button type="button" data-role="advisor-ignore" data-id={item.id} onClick={() => void ignore(item.id)}>
                {t('advisor.ignore')}
              </button>
            </li>
          ))}
        </ul>
      )}
      {view.hasIgnored && (
        <button type="button" class="link" data-role="advisor-reset" onClick={showAgain}>
          {t('advisor.reset')}
        </button>
      )}
    </section>
  );
}
