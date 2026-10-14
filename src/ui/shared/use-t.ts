import { useEffect, useMemo, useState } from 'preact/hooks';
import { currentLang, isLoaded, loadLang, makeT, type Lang } from '../../i18n';
import { loadSettings, onSettingsChanged } from '../../store/settings';

// 인자 없는 훅이 같이 쓰는 언어 값. 저장소 구독은 페이지당 하나만 두고, 마지막 구독자가 빠지면 푼다.
let language = 'auto';
let loaded = false;
let generation = 0;
let stopWatching: (() => void) | null = null;
const subscribers = new Set<(value: string) => void>();

function publish(value: string) {
  language = value;
  loaded = true;
  for (const cb of subscribers) cb(value);
}

function startWatching() {
  const mine = ++generation;
  const off = onSettingsChanged((s) => publish(s.language));
  stopWatching = () => {
    generation++;
    off();
  };
  void loadSettings()
    .then((s) => {
      if (mine === generation) publish(s.language);
    })
    .catch(() => {
      // 읽지 못하면 'auto' 를 그대로 쓴다.
    });
}

function subscribe(cb: (value: string) => void): () => void {
  subscribers.add(cb);
  if (stopWatching === null) startWatching();
  if (loaded) cb(language);
  return () => {
    subscribers.delete(cb);
    if (subscribers.size === 0 && stopWatching !== null) {
      stopWatching();
      stopWatching = null;
    }
  };
}

// 인자를 주면 그 언어 설정을 쓰고, 없으면 저장된 settings.language 를 따른다.
export function useT(languageSetting?: string) {
  // 같은 페이지의 하위 화면은 이미 읽은 언어로 시작한다.
  const [stored, setStored] = useState(language);
  useEffect(() => {
    if (languageSetting !== undefined) {
      publish(languageSetting);
      return;
    }
    return subscribe(setStored);
  }, [languageSetting]);
  const lang = currentLang(languageSetting ?? stored);
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }, [lang]);
  // en·ko 밖의 언어는 처음 쓸 때 불러오고, 다 불러오면 다시 그린다.
  // 다른 훅이 렌더와 effect 사이에 사전을 읽어도 해당 언어로 한 번 다시 그린다.
  // boolean이면 이전 언어의 true가 유지되어 부모 화면만 영어로 남을 수 있다.
  const [loadedLang, setLoadedLang] = useState<Lang | null>(() => isLoaded(lang) ? lang : null);
  useEffect(() => {
    if (isLoaded(lang)) return setLoadedLang(lang);
    let alive = true;
    void loadLang(lang).then(
      () => alive && setLoadedLang(lang),
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, [lang]);
  return useMemo(() => makeT(lang), [lang, loadedLang]);
}
