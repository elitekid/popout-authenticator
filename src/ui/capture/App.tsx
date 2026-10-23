import { useEffect, useRef, useState } from 'preact/hooks';
import type { AccountDraft } from '../../core/account';
import { decodeQrAll } from '../../core/qr';
import { parseLinks } from '../../core/uri';
import { LockedError } from '../../store/errors';
import { redeemOneTimeKey } from '../../store/lock';
import { addDrafts, createVault, readVaultFile } from '../../store/vault';
import { passwordRequired } from '../../bg/capture';
import { sourceToRgba } from '../shared/qr-image';
import { connectUiPort } from '../shared/ui-port';
import { UnlockForm } from '../shared/UnlockForm';
import { useT } from '../shared/use-t';

type Failure = { source: string; reason: string };
type Phase = 'loading' | 'empty' | 'pick' | 'done' | 'display' | 'blocked';
type Rect = { x0: number; y0: number; x1: number; y1: number };
type Result = { added: number; duplicates: number; failed: number };

const MIN_SIDE = 8;
const REGION_SCALE = 2;

// 캡처한 화면에서 QR 을 찾아 금고에 넣는다. 못 찾으면 사용자가 끌어서 영역을 고른다.
export function App() {
  const t = useT();
  const [phase, setPhase] = useState<Phase>('loading');
  const [src, setSrc] = useState('');
  const [sel, setSel] = useState<Rect | null>(null);
  const [missed, setMissed] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [saveError, setSaveError] = useState(false);
  const [locked, setLocked] = useState<{ retry: () => void } | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const otkRef = useRef<string | null>(null);
  const keyRef = useRef<Uint8Array | null>(null);
  const saving = useRef(false);
  const [picking, setPicking] = useState(false);
  const [displayError, setDisplayError] = useState<string | null>(null);
  const params = new URLSearchParams(location.search);
  const captureId = params.get('id') ?? '';
  const mode = params.get('mode');

  // 캡처를 시작한 탭을 다시 활성화하고 이 탭을 닫는다. 원래 탭이 없으면 이 탭만 닫는다.
  const finish = async (): Promise<void> => {
    const key = `captureOrigin:${captureId}`;
    try {
      const origin = (await chrome.storage.session.get(key))[key] as
        | { tabId?: number; windowId?: number }
        | undefined;
      await chrome.storage.session.remove(key);
      if (typeof origin?.tabId === 'number') {
        await chrome.tabs.update(origin.tabId, { active: true });
        if (typeof origin.windowId === 'number') {
          await chrome.windows.update(origin.windowId, { focused: true });
        }
      }
    } catch {
      // 원래 탭·창이 사라졌다.
    }
    try {
      const current = await chrome.tabs.getCurrent();
      if (current?.id === undefined) throw new Error('No current tab');
      await chrome.tabs.remove(current.id);
    } catch {
      window.close();
    }
  };

  const save = async (drafts: AccountDraft[], failed: Failure[]): Promise<void> => {
    if (saving.current) return;
    saving.current = true;
    try {
      let added = 0;
      let duplicates = 0;
      if (drafts.length > 0) {
        // 저장 직전에 최신 정책·잠금 상태를 다시 본다.
        if (await passwordRequired()) {
          setPhase('blocked');
          setSrc('');
          return;
        }
        if (!(await readVaultFile())) {
          try {
            await createVault();
          } catch {
            // 다른 창이 먼저 만들었을 수 있다.
          }
        }
        // 1회용 키는 한 번만 쓸 수 있으니 받은 키를 메모리에 두고 다시 시도에 쓴다.
        if (otkRef.current !== null) {
          const token = otkRef.current;
          otkRef.current = null;
          keyRef.current = await redeemOneTimeKey(token);
        }
        const out = await addDrafts(
          drafts,
          drafts.map(() => ({})),
          Date.now(),
          keyRef.current ? { key: keyRef.current } : {},
        );
        added = out.added.length;
        duplicates = out.duplicates;
      }
      keyRef.current = null;
      setLocked(null);
      setSaveError(false);
      setResult({ added, duplicates, failed: failed.length });
      setPhase('done');
      setSrc('');
    } catch (error) {
      if (error instanceof LockedError) setLocked({ retry: () => void save(drafts, failed) });
      else setSaveError(true);
    } finally {
      saving.current = false;
    }
  };

  // 읽은 글자에서 계정을 얻는다. 인증기 QR 이 아니면 null.
  const accountsFrom = (texts: string[]) => {
    const parsed = parseLinks(texts.join('\n'));
    if (parsed.drafts.length === 0 && parsed.failed.length === 0) return null;
    const failed = [...parsed.failed];
    if (parsed.truncated) failed.push({ source: '', reason: t('add.links.truncated') });
    return { drafts: parsed.drafts, failed };
  };

  // 페이지가 열려 있는 동안 포트를 유지한다('모든 화면을 닫으면 잠금'이 이 페이지도 센다).
  useEffect(() => {
    const port = connectUiPort();
    const activity = () => port.activity();
    document.addEventListener('keydown', activity);
    document.addEventListener('pointerdown', activity);
    return () => {
      document.removeEventListener('keydown', activity);
      document.removeEventListener('pointerdown', activity);
      port.close();
    };
  }, []);

  // 그림 하나를 보여 주고 전체에서 QR 을 찾는다(화면 캡처·화면 선택 모드 공통).
  const present = async (url: string): Promise<void> => {
    const img = new Image();
    img.src = url;
    try {
      await img.decode();
    } catch {
      setPhase('empty');
      return;
    }
    setSrc(url);
    setPhase('pick');
    // 먼저 그림 전체에서 찾는다.
    try {
      const found = accountsFrom(
        decodeQrAll(sourceToRgba(img, img.naturalWidth, img.naturalHeight)),
      );
      // 저장할 계정이 있을 때만 바로 저장한다. 실패 줄뿐이면 영역 선택을 남긴다.
      if (found && found.drafts.length > 0) await save(found.drafts, found.failed);
      else setMissed(true);
    } catch {
      setMissed(true);
    }
  };

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        if (await passwordRequired()) {
          if (alive) setPhase('blocked');
          return;
        }
      } catch {
        // 읽지 못해도 계정을 저장하기 직전에 다시 확인한다.
      }
      if (!alive) return;
      if (mode === 'display') {
        setPhase('display');
        return;
      }
      let got: Record<string, unknown>;
      try {
        const keys = [`captureImage:${captureId}`, `captureOtk:${captureId}`];
        got = await chrome.storage.session.get(keys);
        await chrome.storage.session.remove(keys);
        got = { captureImage: got[keys[0]], captureOtk: got[keys[1]] };
      } catch {
        if (alive) setPhase('empty');
        return;
      }
      if (!alive) return;
      const url = typeof got.captureImage === 'string' ? got.captureImage : '';
      if (typeof got.captureOtk === 'string') otkRef.current = got.captureOtk;
      if (url === '') {
        setPhase('empty');
        return;
      }
      await present(url);
    })();
    return () => {
      alive = false;
    };
  }, []);

  // 하나 이상 추가되고 실패가 없으면 스스로 닫는다. 중복만이거나 실패가 있으면 결과를 남겨 보여 준다.
  useEffect(() => {
    if (result && result.added > 0 && result.failed === 0) void finish();
  }, [result]);

  // 클릭 핸들러 안에서 바로 getDisplayMedia 를 불러 사용자 활성화를 쓴다.
  const chooseScreen = async (): Promise<void> => {
    if (picking) return;
    if (typeof navigator.mediaDevices?.getDisplayMedia !== 'function') {
      setDisplayError('capture.displayUnavailable');
      return;
    }
    setPicking(true);
    setDisplayError(null);
    let url = '';
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      const video = document.createElement('video');
      video.muted = true;
      video.srcObject = stream;
      await video.play();
      if (video.readyState < 2) {
        await new Promise((resolve) => video.addEventListener('loadeddata', resolve, { once: true }));
      }
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      if (canvas.width === 0 || canvas.height === 0) throw new Error('No video frame');
      canvas.getContext('2d')!.drawImage(video, 0, 0);
      url = canvas.toDataURL('image/png');
    } catch (error) {
      const name = error instanceof DOMException ? error.name : '';
      setDisplayError(
        name === 'NotAllowedError' || name === 'AbortError'
          ? 'capture.displayDenied'
          : 'capture.displayFailed',
      );
    } finally {
      stream?.getTracks().forEach((track) => track.stop());
      setPicking(false);
    }
    if (url !== '') await present(url);
  };

  // 화면 좌표(그림 안)를 원본 좌표로 바꿔 그 부분만 2배로 키워 해석한다.
  const scanRegion = async (rect: Rect): Promise<void> => {
    const img = imgRef.current;
    if (!img) return;
    const box = img.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return;
    const fx = img.naturalWidth / box.width;
    const fy = img.naturalHeight / box.height;
    const x = Math.max(0, Math.floor(Math.min(rect.x0, rect.x1) * fx));
    const y = Math.max(0, Math.floor(Math.min(rect.y0, rect.y1) * fy));
    const w = Math.min(img.naturalWidth - x, Math.ceil(Math.abs(rect.x1 - rect.x0) * fx));
    const h = Math.min(img.naturalHeight - y, Math.ceil(Math.abs(rect.y1 - rect.y0) * fy));
    if (w < MIN_SIDE || h < MIN_SIDE) return;
    try {
      const rgba = sourceToRgba(img, img.naturalWidth, img.naturalHeight, {
        crop: { x, y, w, h },
        scale: REGION_SCALE,
      });
      const found = accountsFrom(decodeQrAll(rgba));
      if (found) {
        setMissed(false);
        await save(found.drafts, found.failed);
        return;
      }
    } catch {
      // 아래에서 못 찾은 것으로 안내한다.
    }
    setMissed(true);
  };

  const local = (e: PointerEvent) => {
    const box = imgRef.current!.getBoundingClientRect();
    return {
      x: Math.min(box.width, Math.max(0, e.clientX - box.left)),
      y: Math.min(box.height, Math.max(0, e.clientY - box.top)),
    };
  };

  const onDown = (e: PointerEvent) => {
    if (!imgRef.current || locked || saving.current) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const p = local(e);
    setSel({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
  };

  const onMove = (e: PointerEvent) => {
    if (!sel || !imgRef.current) return;
    const p = local(e);
    setSel({ ...sel, x1: p.x, y1: p.y });
  };

  const onUp = () => {
    const rect = sel;
    setSel(null);
    if (rect) void scanRegion(rect);
  };

  return (
    <div data-app="capture" class="capture">
      {phase === 'loading' && <p class="empty">{t('popup.loading')}</p>}
      {phase === 'empty' && <p class="empty">{t('capture.empty')}</p>}
      {phase === 'blocked' && (
        <div class="notice" data-role="policy-need-password">
          <p>{t('add.policy.needPassword')}</p>
          <a href={chrome.runtime.getURL('manage.html#lock')}>{t('add.policy.openLock')}</a>
        </div>
      )}
      {phase === 'display' && (
        <>
          <p data-role="capture-hint">{t('capture.displayHint')}</p>
          <button
            type="button"
            data-role="capture-choose"
            disabled={picking}
            onClick={() => void chooseScreen()}
          >
            {t('capture.chooseScreen')}
          </button>
        </>
      )}
      {displayError && (
        <p class="error" role="alert" data-role="capture-display-error">
          {t(displayError as 'capture.displayFailed')}
        </p>
      )}
      {phase === 'pick' && src !== '' && (
        <>
          <p data-role="capture-hint">{missed ? t('capture.notFound') : t('capture.hint')}</p>
          <div
            class="capture-stage"
            data-role="capture-stage"
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
          >
            <img ref={imgRef} src={src} alt="" draggable={false} />
            {sel && (
              <div
                class="capture-sel"
                style={{
                  left: `${Math.min(sel.x0, sel.x1)}px`,
                  top: `${Math.min(sel.y0, sel.y1)}px`,
                  width: `${Math.abs(sel.x1 - sel.x0)}px`,
                  height: `${Math.abs(sel.y1 - sel.y0)}px`,
                }}
              />
            )}
          </div>
        </>
      )}
      {locked && (
        <UnlockForm
          onUnlocked={() => {
            const l = locked;
            setLocked(null);
            l.retry();
          }}
        />
      )}
      {saveError && (
        <p class="error" role="alert">
          {t('add.error.save')}
        </p>
      )}
      {result && (
        <div
          class="add-result"
          data-role="capture-result"
          data-added={result.added}
          data-duplicates={result.duplicates}
          data-failed={result.failed}
        >
          <p>{t('add.result', result)}</p>
        </div>
      )}
      {phase !== 'loading' && (
        <button type="button" data-role="capture-close" onClick={() => void finish()}>
          {t('popup.qr.close')}
        </button>
      )}
    </div>
  );
}
