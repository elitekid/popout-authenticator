import { useEffect, useRef, useState } from 'preact/hooks';
import type { AccountDraft } from '../../core/account';
import { decodeMigration } from '../../core/migration';
import { decodeQrAll } from '../../core/qr';
import { parseLinks } from '../../core/uri';
import { sourceToRgba } from './qr-image';
import { useT } from './use-t';

type Failure = { source: string; reason: string };
type Problem = 'denied' | 'none' | 'error';
type Batch = { size: number; seen: Set<number> };

const INTERVAL_MS = 200;
const MAX_CODES = 4;
// 카메라 프레임은 이 크기로 줄여 해석한다(200ms 마다 도는 경로).
const CAMERA_SIDE = 960;

// 카메라를 계속 스캔한다. 알아낸 계정은 그때그때 onFound 로 넘기고, 같은 QR 은 한 번만 처리한다.
export function CameraScanner(props: {
  // false 를 돌려주면(저장 실패) 같은 QR 을 다시 비춰 재시도할 수 있게 잊는다.
  onFound: (drafts: AccountDraft[], failed: Failure[]) => void | Promise<boolean>;
  onClose: () => void;
}) {
  const t = useT();
  const videoRef = useRef<HTMLVideoElement>(null);
  const foundRef = useRef(props.onFound);
  foundRef.current = props.onFound;
  const closeRef = useRef(props.onClose);
  closeRef.current = props.onClose;
  const handled = useRef(new Set<string>());
  const batches = useRef(new Map<number, Batch>());
  const [deviceId, setDeviceId] = useState('');
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ seen: number; total: number } | null>(null);

  const handle = (text: string) => {
    if (handled.current.has(text)) return;
    handled.current.add(text);
    const { drafts, failed } = parseLinks(text);
    if (drafts.length === 0 && failed.length === 0) return;
    if (/^\s*otpauth-migration:\/\//i.test(text)) {
      try {
        const { batch } = decodeMigration(text);
        const known = batches.current.get(batch.id) ?? { size: batch.size, seen: new Set<number>() };
        known.seen.add(batch.index);
        batches.current.set(batch.id, known);
        setProgress({ seen: known.seen.size, total: known.size });
      } catch {
        // 해석 실패는 parseLinks 의 failed 로 이미 알린다.
      }
    }
    void Promise.resolve(foundRef.current(drafts, failed)).then((ok) => {
      if (ok === false) handled.current.delete(text);
    });
  };

  useEffect(() => {
    let alive = true;
    let stream: MediaStream | undefined;
    let timer: ReturnType<typeof setInterval> | undefined;
    const stop = () => {
      clearInterval(timer);
      const mine = stream;
      mine?.getTracks().forEach((track) => track.stop());
      stream = undefined;
      // 카메라를 바꾸는 중 늦게 끝난 앞 요청이 새 스트림을 떼지 않게, 자기 것일 때만 비운다.
      if (mine && videoRef.current && videoRef.current.srcObject === mine) videoRef.current.srcObject = null;
    };

    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { ...(deviceId ? { deviceId } : {}), width: { ideal: 1280 }, height: { ideal: 720 } },
        });
      } catch (error) {
        if (!alive) return;
        const name = error instanceof DOMException ? error.name : '';
        if (name === 'NotAllowedError' || name === 'SecurityError') setProblem('denied');
        else if (name === 'NotFoundError' || name === 'OverconstrainedError') setProblem('none');
        else setProblem('error');
        return;
      }
      if (!alive) {
        stop();
        return;
      }
      const video = videoRef.current;
      if (!video) {
        stop();
        return;
      }
      video.srcObject = stream;
      await video.play().catch(() => undefined);
      if (!alive) return;
      setProblem(null);
      setRunning(true);
      // 권한을 받은 뒤라야 카메라 이름이 보인다.
      void navigator.mediaDevices.enumerateDevices().then(
        (all) => alive && setDevices(all.filter((d) => d.kind === 'videoinput')),
        () => undefined,
      );

      let busy = false;
      timer = setInterval(() => {
        if (busy || video.readyState < 2 || video.videoWidth === 0) return;
        busy = true;
        try {
          const frame = sourceToRgba(video, video.videoWidth, video.videoHeight, { maxSide: CAMERA_SIDE });
          for (const text of decodeQrAll(frame, MAX_CODES)) handle(text);
        } catch {
          // 한 프레임을 못 읽어도 다음 프레임에서 다시 본다.
        } finally {
          busy = false;
        }
      }, INTERVAL_MS);
    })();

    // 다른 탭으로 가면 카메라를 끈다.
    const onHidden = () => {
      if (document.hidden) closeRef.current();
    };
    document.addEventListener('visibilitychange', onHidden);

    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onHidden);
      stop();
      setRunning(false);
    };
  }, [deviceId]);

  return (
    <div class="camera" data-role="camera">
      {problem === null && !running && <p class="muted">{t('qr.camera.starting')}</p>}
      {problem !== null && (
        <p class="error" role="alert" data-role="camera-error">
          {t(`qr.camera.${problem}`)}
        </p>
      )}
      <video ref={videoRef} class="camera-video" muted playsInline hidden={!running} />
      {running && <p class="muted">{t('qr.camera.hint')}</p>}
      {devices.length > 1 && (
        <select
          class="field"
          data-role="camera-select"
          aria-label={t('qr.camera.select')}
          value={deviceId}
          onChange={(e) => setDeviceId(e.currentTarget.value)}
        >
          {devices.map((d, i) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || `${t('qr.camera.select')} ${i + 1}`}
            </option>
          ))}
        </select>
      )}
      {progress && (
        <p
          class="muted"
          data-role="qr-progress"
          data-seen={progress.seen}
          data-total={progress.total}
        >
          {t('qr.progress', { seen: progress.seen, total: progress.total })}
        </p>
      )}
      <button type="button" data-role="camera-stop" onClick={props.onClose}>
        {t('qr.camera.stop')}
      </button>
    </div>
  );
}
