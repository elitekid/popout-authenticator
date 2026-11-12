// 그림·영상 프레임을 QR 해석용 RGBA 로 바꾼다(canvas 를 쓰니 화면 문서에서만).
import type { Rgba } from '../../core/qr';

// 해석할 그림의 긴 변 상한(px)
export const MAX_SIDE = 2000;

export type Crop = { x: number; y: number; w: number; h: number };

// 매 프레임 새로 만들지 않게 캔버스 하나를 재사용한다.
let shared: HTMLCanvasElement | null = null;

// crop 이 없으면 통째로. scale 만큼 키우되 긴 변이 MAX_SIDE 를 넘지 않게 줄인다.
export function sourceToRgba(
  source: CanvasImageSource,
  width: number,
  height: number,
  opts: { crop?: Crop; scale?: number; maxSide?: number } = {},
): Rgba {
  const crop = opts.crop ?? { x: 0, y: 0, w: width, h: height };
  const want = opts.scale ?? 1;
  const fit = Math.min(1, (opts.maxSide ?? MAX_SIDE) / Math.max(crop.w * want, crop.h * want));
  const w = Math.max(1, Math.round(crop.w * want * fit));
  const h = Math.max(1, Math.round(crop.h * want * fit));
  const canvas = (shared ??= document.createElement('canvas'));
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('canvas unavailable');
  // 투명한 곳은 흰 바탕으로 읽는다.
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(source, crop.x, crop.y, crop.w, crop.h, 0, 0, w, h);
  return { data: ctx.getImageData(0, 0, w, h).data, width: w, height: h };
}

export async function fileToRgba(file: Blob): Promise<Rgba> {
  const bitmap = await createImageBitmap(file);
  try {
    return sourceToRgba(bitmap, bitmap.width, bitmap.height);
  } finally {
    bitmap.close();
  }
}
