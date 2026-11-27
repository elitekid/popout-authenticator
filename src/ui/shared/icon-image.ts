// 사용자가 고른 그림 파일을 계정 아이콘용 작은 정사각 래스터로 다시 그린다.
// 다시 그리므로 원본의 위치 정보(EXIF)·스크립트(svg)는 남지 않는다. 바깥 주소는 쓰지 않는다.
import { ICON_IMAGE_SIZE, isIconImage } from '../../core/types';

export const ICON_IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif';
const MAX_FILE_BYTES = 20 * 1024 * 1024;

export class IconImageError extends Error {}

export async function fileToIconImage(file: Blob): Promise<string> {
  if (file.size === 0 || file.size > MAX_FILE_BYTES) throw new IconImageError('size');
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    try {
      await img.decode();
    } catch {
      throw new IconImageError('decode');
    }
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (w === 0 || h === 0) throw new IconImageError('decode');
    const canvas = document.createElement('canvas');
    canvas.width = ICON_IMAGE_SIZE;
    canvas.height = ICON_IMAGE_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new IconImageError('canvas');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    // 가운데를 정사각으로 잘라 채운다.
    const side = Math.min(w, h);
    ctx.drawImage(img, (w - side) / 2, (h - side) / 2, side, side, 0, 0, ICON_IMAGE_SIZE, ICON_IMAGE_SIZE);
    // webp 를 못 만드는 브라우저는 png 를 돌려준다. 투명 배경을 지키려고 jpeg 는 마지막에만 쓴다.
    const tries: [string, number?][] = [['image/webp', 0.9], ['image/png'], ['image/jpeg', 0.85], ['image/jpeg', 0.6]];
    for (const [type, quality] of tries) {
      const data = canvas.toDataURL(type, quality);
      if (isIconImage(data)) return data;
    }
    throw new IconImageError('size');
  } finally {
    URL.revokeObjectURL(url);
  }
}
