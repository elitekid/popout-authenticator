import { useEffect, useRef, useState } from 'preact/hooks';
import type { AccountDraft } from '../../../core/account';
import type { ImportFailure, ImportMeta } from '../../../core/import';
import { decodeQrAll } from '../../../core/qr';
import { parseLinks } from '../../../core/uri';
import { CameraScanner } from '../../shared/CameraScanner';
import { fileToRgba } from '../../shared/qr-image';
import type { useT } from '../../shared/use-t';
import { openTaskWindow, useScreenContext } from '../../shared/screen-context';

type Props = {
  t: ReturnType<typeof useT>;
  busy: boolean;
  onBatch: (batch: { drafts: AccountDraft[]; meta: ImportMeta[]; failed: ImportFailure[] }) => void;
  onScanned: (drafts: AccountDraft[], failed: ImportFailure[]) => void | Promise<boolean>;
  onCameraStart: () => void;
  onCameraStop: () => void;
};

const isOtpLink = (text: string) => /^\s*otpauth(-migration)?:\/\//i.test(text);

// QR 칸: 그림 붙여넣기·끌어 놓기·파일 고르기, 그리고 카메라.
export function QrPanel({ t, busy, onBatch, onScanned, onCameraStart, onCameraStop }: Props) {
  const { toolbarPopup } = useScreenContext();
  const [windowFailed, setWindowFailed] = useState(false);
  const continueInWindow = () => void openTaskWindow('add', { tab: 'qr' }).catch(() => setWindowFailed(true));
  const [camera, setCamera] = useState(false);
  const [over, setOver] = useState(false);
  const [reading, setReading] = useState(false);
  useEffect(() => () => onCameraStop(), []);

  const readImages = async (files: File[]): Promise<void> => {
    const images = files.filter((f) => f.type.startsWith('image/'));
    if (images.length === 0 || busy || reading) return;
    setReading(true);
    try {
      const failed: ImportFailure[] = [];
      const texts: string[] = [];
      for (const file of images) {
        try {
          const found = decodeQrAll(await fileToRgba(file));
          if (found.some(isOtpLink)) texts.push(...found);
          else {
            failed.push({
              source: file.name,
              reason: t(found.length === 0 ? 'add.qr.notFound' : 'add.qr.notOtp'),
            });
          }
        } catch {
          failed.push({ source: file.name, reason: t('add.qr.unreadable') });
        }
      }
      const parsed = parseLinks(texts.join('\n'));
      failed.push(...parsed.failed);
      if (parsed.truncated) failed.push({ source: '', reason: t('add.links.truncated') });
      onBatch({ drafts: parsed.drafts, meta: parsed.drafts.map(() => ({})), failed });
    } finally {
      setReading(false);
    }
  };

  // 붙여넣기 리스너는 한 번만 달고 항상 최신 처리 함수를 부른다.
  const latest = useRef(readImages);
  latest.current = readImages;
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []).filter((f) =>
        f.type.startsWith('image/'),
      );
      if (files.length === 0) return;
      e.preventDefault();
      void latest.current(files);
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, []);

  return (
    <div class="add-panel plain">
      <div
        class={`qr-drop${over ? ' over' : ''}`}
        data-role="qr-drop"
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void readImages(Array.from(e.dataTransfer?.files ?? []));
        }}
      >
        <p>{t('add.qr.hint')}</p>
        <label>
          {!toolbarPopup && <span>{t('add.qr.file')}</span>}
          {toolbarPopup ? <button type="button" data-role="qr-file-window" onClick={continueInWindow}>{t('add.qr.file')}</button> : <input
            type="file"
            multiple
            accept="image/*"
            data-role="qr-file-input"
            disabled={busy || reading}
            onChange={(e) => {
              const input = e.currentTarget;
              const files = Array.from(input.files ?? []);
              input.value = '';
              void readImages(files);
            }}
          />}
        </label>
      </div>
      <button
        type="button"
        data-role="camera-start"
        disabled={camera}
        onClick={() => {
          if (toolbarPopup) { continueInWindow(); return; }
          onCameraStart();
          setCamera(true);
        }}
      >
        {t('add.qr.camera')}
      </button>
      <button
        type="button"
        data-role="qr-display"
        disabled={busy}
        onClick={() => {
          setWindowFailed(false);
          void chrome.runtime.sendMessage({ type: 'capture-display' }).then(
            (reply: { ok?: boolean } | undefined) => {
              if (reply?.ok !== true) { setWindowFailed(true); return; }
              // 파이어폭스는 탭이 열려도 툴바 팝업이 안 닫혀 직접 닫는다
              if (toolbarPopup) window.close();
            },
            () => setWindowFailed(true),
          );
        }}
      >
        {t('add.qr.display')}
      </button>
      {windowFailed && <p class="error" role="alert">{t('add.error.save')}</p>}
      {camera && <CameraScanner onFound={onScanned} onClose={() => { setCamera(false); onCameraStop(); }} />}
    </div>
  );
}
