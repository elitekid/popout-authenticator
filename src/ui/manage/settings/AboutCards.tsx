import { useState } from 'preact/hooks';
import { useT } from '../../shared/use-t';
import { GITHUB_URL, STORE_KIND, STORE_PAGE_URL, STORE_REVIEW_URL, WHATS_NEW } from '../../popup/logic';

type T = ReturnType<typeof useT>;

const STAR_PATH = 'm12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9Z';
const GITHUB_PATH = 'M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z';

const compareVersions = (a: string, b: string): number => {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
};

const openTab = (url: string) => {
  try {
    void chrome.tabs.create({ url }).catch(() => undefined);
  } catch { /* 열기 실패는 무시 */ }
};

const RATE_KEYS = {
  chrome: 'settings.rate.chrome',
  edge: 'settings.rate.edge',
  firefox: 'settings.rate.firefox',
  whale: 'settings.rate.whale',
  safari: 'settings.rate.safari',
} as const;

// 스토어 평가 카드. 스토어 단추를 누르면 평가한 것으로 기록한다.
export function RateCard({ t }: { t: T }) {
  const rate = () => {
    void chrome.storage.local.set({ reviewDismissed: true }).catch(() => undefined);
    openTab(STORE_REVIEW_URL);
  };
  return (
    <section class="settings-rate" data-role="settings-rate">
      <h2>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d={STAR_PATH} /></svg>
        {t('settings.rate.title')}
      </h2>
      <p class="muted">{t('settings.rate.text')}</p>
      <div class="settings-rate-actions">
        {STORE_REVIEW_URL && (
          <button type="button" class="gold" data-role="settings-rate-store" onClick={rate}>
            ★ {t(RATE_KEYS[STORE_KIND])}
          </button>
        )}
        <button type="button" data-role="settings-rate-star" onClick={() => openTab(GITHUB_URL)}>
          <svg class="gh" viewBox="0 0 16 16" aria-hidden="true"><path d={GITHUB_PATH} /></svg>
          {t('settings.rate.star')}
        </button>
      </div>
    </section>
  );
}

type UpdateState = 'idle' | 'checking' | 'latest' | 'available' | 'throttled' | 'failed';

type UpdateResult = { status: string; version?: string };

// 크롬 MV3 는 Promise, 콜백형만 되는 브라우저는 콜백으로 감싼다.
const requestUpdate = (): Promise<UpdateResult> => new Promise((resolve, reject) => {
  const done = (status: unknown, details?: unknown) => {
    if (typeof status === 'object' && status !== null) resolve(status as UpdateResult);
    else resolve({ status: String(status), version: (details as { version?: string } | undefined)?.version });
  };
  try {
    const ret: unknown = (chrome.runtime.requestUpdateCheck as (cb?: (...a: unknown[]) => void) => unknown)(
      (status, details) => done(status, details),
    );
    if (ret && typeof (ret as Promise<unknown>).then === 'function') {
      (ret as Promise<unknown>).then(done, reject);
    }
  } catch (e) {
    reject(e);
  }
});

const CAN_CHECK = STORE_KIND === 'chrome' || STORE_KIND === 'edge' || STORE_KIND === 'whale';

// 정보 카드: 버전, 업데이트 확인, 업데이트 내역, 링크.
export function InfoCard({ t, helpUrl, siteHref, feedbackUrl }: {
  t: T;
  helpUrl: string;
  siteHref: string;
  feedbackUrl: string;
}) {
  const [changesOpen, setChangesOpen] = useState(false);
  const [update, setUpdate] = useState<UpdateState>('idle');
  const [newVersion, setNewVersion] = useState('');
  const [applying, setApplying] = useState(false);

  // reload 는 storage.session 을 비우므로 백그라운드가 클립보드 지우기를 마친 뒤 reload 한다.
  const applyUpdate = () => {
    setApplying(true);
    try {
      // 백그라운드는 응답 없이 reload 하므로 '응답 없음' 거절은 무시한다(여기서 reload 하면 지우기 전에 다시 불러온다).
      void Promise.resolve(chrome.runtime.sendMessage({ type: 'apply-update' })).catch(() => undefined);
    } catch {
      chrome.runtime.reload();
    }
  };

  const check = async () => {
    if (!CAN_CHECK || typeof chrome.runtime.requestUpdateCheck !== 'function') {
      openTab(STORE_PAGE_URL);
      return;
    }
    setUpdate('checking');
    try {
      const r = await requestUpdate();
      if (r.status === 'update_available') {
        setNewVersion(r.version ?? '');
        setUpdate('available');
      } else if (r.status === 'no_update') setUpdate('latest');
      else if (r.status === 'throttled') setUpdate('throttled');
      else throw new Error(r.status);
    } catch {
      setUpdate('failed');
      openTab(STORE_PAGE_URL);
    }
  };

  const statusKey = {
    latest: 'settings.info.latest',
    available: 'settings.info.available',
    throttled: 'settings.info.throttled',
    failed: 'settings.info.failed',
  } as const;

  return (
    <section class="settings-info" data-role="settings-info">
      <h2>{t('settings.info.title')}</h2>
      <div class="settings-info-row">
        <span data-role="settings-version">{t('settings.about.version', { version: chrome.runtime.getManifest().version })}</span>
        <button type="button" data-role="settings-update-check" disabled={update === 'checking'} onClick={() => void check()}>
          {t(update === 'checking' ? 'settings.info.checking' : 'settings.info.check')}
        </button>
        <span class="muted" role="status" data-role="settings-update-status">
          {update !== 'idle' && update !== 'checking' && t(statusKey[update], { version: newVersion })}
        </span>
        {update === 'available' && (
          <button type="button" class="primary" data-role="settings-update-now" disabled={applying} onClick={applyUpdate}>
            {t('settings.info.updateNow')}
          </button>
        )}
      </div>
      <div class="settings-info-row">
        <button type="button" class="link" data-role="settings-changes" aria-expanded={changesOpen}
          onClick={() => setChangesOpen((open) => !open)}>
          {t('settings.about.changes')} {changesOpen ? '▾' : '▸'}
        </button>
      </div>
      {changesOpen && (
        <div class="settings-history" data-role="settings-changes-list">
          {Object.keys(WHATS_NEW)
            .sort(compareVersions)
            .reverse()
            .map((version) => (
              <div key={version}>
                <h3>{version}</h3>
                <ul>
                  {WHATS_NEW[version]!.map((key) => <li key={key}>{t(key)}</li>)}
                </ul>
              </div>
            ))}
        </div>
      )}
      <p class="settings-info-links muted">
        <a href={helpUrl} target="_blank" rel="noopener" data-role="settings-help">{t('settings.about.help')}</a>
        <span class="sep" aria-hidden="true">·</span>
        <a href={siteHref} target="_blank" rel="noopener" data-role="settings-site">{t('settings.about.site')}</a>
        <span class="sep" aria-hidden="true">·</span>
        <a href={feedbackUrl} target="_blank" rel="noopener" data-role="settings-feedback">{t('settings.about.feedback')}</a>
      </p>
    </section>
  );
}
