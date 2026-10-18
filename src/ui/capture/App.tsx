import { useEffect, useRef, useState } from 'preact/hooks';
import type { AccountDraft } from '../../core/account';
import { decodeQrAll } from '../../core/qr';
import { parseLinks } from '../../core/uri';
import { LockedError } from '../../store/errors';
import { redeemOneTimeKey } from '../../store/lock';
import { addDrafts, createVault, readVaultFile } from '../../store/vault';
import { sourceToRgba } from '../shared/qr-image';
import { connectUiPort } from '../shared/ui-port';
import { UnlockForm } from '../shared/UnlockForm';
import { useT } from '../shared/use-t';

type Failure = { source: string; reason: string };
type Phase = 'loading' | 'empty' | 'pick' | 'done';
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

  const save = async (drafts: AccountDraft[], failed: Failure[]): Promise<void> => {
    if (saving.current) return;
    saving.current = true;
    try {
      let added = 0;
      let duplicates = 0;
      if (drafts.length > 0) {
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

  useEffect(() => {
    let alive = true;
    void (async () => {
      let got: Record<string, unknown>;
      try {
        const id = new URLSearchParams(location.search).get('id') ?? '';
        const keys = [`captureImage:${id}`, `captureOtk:${id}`];
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
      const img = new Image();
      img.src = url;
      try {
        await img.decode();
      } catch {
        if (alive) setPhase('empty');
        return;
      }
      if (!alive) return;
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
    })();
    return () => {
      alive = false;
    };
  }, []);

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
    </div>
  );
}
