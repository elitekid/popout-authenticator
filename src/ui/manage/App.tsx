import { useEffect, useState } from 'preact/hooks';
import { useT } from '../shared/use-t';
import { sections, type SectionId } from './sections';
import { PopupScreen, type PopupRoute } from '../popup/PopupScreen';
import { loadSettings, onSettingsChanged } from '../../store/settings';
import { onPolicyChanged, readPolicy } from '../../store/policy';

function sectionFromHash(): SectionId {
  const id = location.hash.replace('#', '');
  return sections.find((s) => s.id === id)?.id ?? sections[0].id;
}

function initialStack(): PopupRoute[] {
  const params = new URLSearchParams(location.search);
  const section = sectionFromHash();
  return [{ section: section === 'settings' && ['privacy', 'field-buttons'].includes(params.get('panel') ?? '') ? 'display' : section,
    editId: params.get('edit') ?? undefined,
    historyId: params.get('history') ?? undefined,
    tab: params.get('tab') === 'file' ? 'file' : params.get('tab') === 'qr' ? 'qr' : undefined }];
}

export function App() {
  const t = useT();
  const [current, setCurrent] = useState<SectionId>(sectionFromHash);
  const [zoom, setZoom] = useState(100);
  const [screenForward, setScreenForward] = useState(true);
  useEffect(() => {
    let alive = true;
    let changed = false;
    const apply = (settings: Awaited<ReturnType<typeof loadSettings>>) => {
      if (!alive) return;
      document.documentElement.dataset.theme = settings.theme;
      setZoom(settings.zoom);
    };
    const off = onSettingsChanged((settings) => { changed = true; apply(settings); });
    void loadSettings().then((settings) => { if (!changed) apply(settings); }, () => undefined);
    const onHash = () => {
      setCurrent(sectionFromHash());
      // 작업 창을 재사용해 해시만 바뀐 경우, compact 화면이 쓰는 stack 도 새 섹션 하나로 다시 세운다.
      if (new URLSearchParams(location.search).get('compact') === '1') setStack(initialStack());
    };
    window.addEventListener('hashchange', onHash);
    return () => { alive = false; off(); window.removeEventListener('hashchange', onHash); };
  }, []);
  // 관리자가 백업을 껐으면 목차에서 백업을 뺀다. 직접 주소(#backup)는 영역 쪽이 안내 문구로 막는다.
  const [noBackup, setNoBackup] = useState(false);
  useEffect(() => {
    let alive = true;
    const refresh = () => void readPolicy().then((p) => alive && setNoBackup(p.disableBackup));
    refresh();
    const off = onPolicyChanged(refresh);
    return () => { alive = false; off(); };
  }, []);
  const [stack, setStack] = useState<PopupRoute[]>(initialStack);
  if (new URLSearchParams(location.search).get('compact') === '1') {
    return <div class="popup" data-app="manage" data-open-name="window" style={{ zoom: zoom / 100 }}>
      {stack.map((route, index) => {
        const active = index === stack.length - 1;
        const keep = route.section === 'settings' || route.section === 'display'
          || (route.section === 'accounts' && !route.editId && !route.historyId);
        return active || keep ? <PopupScreen key={`${index}:${route.section}:${route.editId ?? ''}:${route.historyId ?? ''}:${route.tab ?? ''}`}
          route={route} active={active} animate={screenForward} toolbarPopup={false}
          onNavigate={(next) => {
            setScreenForward(true);
            setStack((s) => {
              const current = s[s.length - 1];
              return current?.section === next.section && current.editId === next.editId && current.historyId === next.historyId && current.tab === next.tab
                ? s : [...s, next];
            });
          }}
          onBack={() => {
            setScreenForward(false);
            if (stack.length > 1) setStack((s) => s.slice(0, -1));
            else window.close();
          }} /> : null;
      })}
    </div>;
  }
  const active = sections.find((s) => s.id === current) ?? sections[0];
  const Body = active.component;

  return (
    <div class="manage" data-app="manage" style={{ zoom: zoom / 100 }}>
      <nav class="manage-nav">
        <b class="manage-brand">Popout {t('manage.title')}</b>
        {sections.filter((s) => !(noBackup && s.id === 'backup')).map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            aria-current={s.id === current}
            onClick={() => setCurrent(s.id)}
          >
            {t(s.titleKey)}
          </a>
        ))}
      </nav>
      <main class="manage-main">
        <h1>{t(active.titleKey)}</h1>
        <Body />
      </main>
    </div>
  );
}
