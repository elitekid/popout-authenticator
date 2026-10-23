import { memo } from 'preact/compat';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { onPolicyChanged, readPolicy } from '../../store/policy';
import { sections, type SectionId } from '../manage/sections';
import { HistoryPanel } from '../manage/accounts/HistoryPanel';
import { AccountsSection } from '../manage/accounts/AccountsSection';
import { AddSection } from '../manage/add/AddSection';
import { SettingsSection } from '../manage/settings/SettingsSection';
import { ScreenContext } from '../shared/screen-context';
import { useT } from '../shared/use-t';

export type PopupRoute = { section: SectionId | 'display'; editId?: string; historyId?: string; tab?: 'manual' | 'links' | 'file' | 'qr' };

type Props = {
  route: PopupRoute;
  toolbarPopup: boolean;
  active?: boolean;
  animate?: boolean;
  onNavigate: (route: PopupRoute) => void;
  onBack: () => void;
};

function Screen({ route, toolbarPopup, active = true, animate = true, onNavigate, onBack }: Props) {
  const t = useT();
  const lastFocus = useRef<HTMLElement | null>(null);
  const wasActive = useRef(active);
  useLayoutEffect(() => {
    if (active && !wasActive.current && lastFocus.current?.isConnected) {
      lastFocus.current.focus({ preventScroll: true });
    }
    wasActive.current = active;
  }, [active]);
  // 관리자가 백업을 껐으면 설정 목록에서 백업 메뉴를 뺀다(직접 열어도 영역이 안내 문구로 막는다).
  const [noBackup, setNoBackup] = useState(false);
  useEffect(() => {
    let alive = true;
    const refresh = () => void readPolicy().then((p) => alive && setNoBackup(p.disableBackup));
    refresh();
    const off = onPolicyChanged(refresh);
    return () => { alive = false; off(); };
  }, []);
  const section = sections.find((s) => s.id === route.section);
  const Body = section?.component;
  const title = route.section === 'display' ? `${t('settings.display.title')} · ${t('settings.sync.title')}`
    : t(route.historyId ? 'history.title' : route.editId ? 'popup.edit.open' : section?.titleKey ?? 'section.settings');
  return (
    <ScreenContext.Provider value={{ toolbarPopup, navigate: (section) => onNavigate({ section }) }}>
      <div class="popup-screen" data-role="popup-screen" data-screen={route.section}
        hidden={!active} data-enter={active && animate ? 'true' : undefined}
        onFocusCapture={(event) => { lastFocus.current = event.target as HTMLElement; }}>
        <div class="screen-head">
          <button type="button" data-role="screen-back" onClick={onBack} aria-label={t('popup.back')}>‹ {t('popup.back')}</button>
          <h1>{title}</h1>
        </div>
        <div class="screen-body manage-main" onClick={(event) => {
          const anchor = (event.target as HTMLElement).closest<HTMLAnchorElement>('a[href^="#"]');
          const next = sections.find((s) => `#${s.id}` === anchor?.getAttribute('href'));
          if (next) { event.preventDefault(); onNavigate({ section: next.id }); }
        }}>
          {route.section === 'settings' ? (
            <div class="screen-links">
              <button type="button" data-role="screen-display" onClick={() => onNavigate({ section: 'display' })}>
                <span>{t('settings.display.title')} · {t('settings.sync.title')}</span>
              </button>
              {sections.filter((s) => s.id !== 'settings' && s.id !== 'add' && !(noBackup && s.id === 'backup')).map((s) => (
                <button type="button" key={s.id} data-role={`screen-${s.id}`} onClick={() => onNavigate({ section: s.id })}>
                  <span>{t(s.titleKey)}</span>
                </button>
              ))}
            </div>
          ) : route.section === 'display' ? <SettingsSection />
            : route.section === 'accounts' && route.historyId ? <HistoryPanel accountId={route.historyId} />
            : route.section === 'accounts' ? <AccountsSection initialEditId={route.editId} onDone={route.editId ? onBack : undefined} onEdit={(editId) => onNavigate({ section: 'accounts', editId })} onHistory={(historyId) => onNavigate({ section: 'accounts', historyId })} />
            : route.section === 'add' ? <AddSection initialTab={route.tab} onDone={() => {
              if (new URLSearchParams(location.search).get('compact') === '1') window.close();
              else onBack();
            }} />
            : Body ? <Body /> : null}
        </div>
      </div>
    </ScreenContext.Provider>
  );
}

export const PopupScreen = memo(Screen);
export default PopupScreen;
