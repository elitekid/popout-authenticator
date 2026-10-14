// QR 이미지(RGBA 픽셀) 해석. DOM 을 쓰지 않는다.
import jsQR from 'jsqr';

export type Rgba = { data: Uint8ClampedArray; width: number; height: number };

// 큰 그림에서 못 읽을 때 줄여 보는 긴 변 크기(내림차순).
const TARGET_SIZES = [2000, 1600, 1024, 640];

// 상자 평균 축소. 새 픽셀마다 원본의 대응 사각형 평균(RGBA 각각).
export function boxDownscale(image: Rgba, width: number, height: number): Rgba {
  const out = new Uint8ClampedArray(width * height * 4);
  const sx = image.width / width;
  const sy = image.height / height;
  for (let y = 0; y < height; y++) {
    const y0 = Math.min(image.height - 1, Math.floor(y * sy));
    const y1 = Math.min(image.height, Math.max(y0 + 1, Math.ceil((y + 1) * sy)));
    for (let x = 0; x < width; x++) {
      const x0 = Math.min(image.width - 1, Math.floor(x * sx));
      const x1 = Math.min(image.width, Math.max(x0 + 1, Math.ceil((x + 1) * sx)));
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let yy = y0; yy < y1; yy++) {
        let i = (yy * image.width + x0) * 4;
        for (let xx = x0; xx < x1; xx++, i += 4) {
          r += image.data[i]!;
          g += image.data[i + 1]!;
          b += image.data[i + 2]!;
          a += image.data[i + 3]!;
        }
      }
      const n = (y1 - y0) * (x1 - x0);
      const o = (y * width + x) * 4;
      out[o] = Math.round(r / n);
      out[o + 1] = Math.round(g / n);
      out[o + 2] = Math.round(b / n);
      out[o + 3] = Math.round(a / n);
    }
  }
  return { data: out, width, height };
}

// 찾은 QR 의 네 모서리를 감싼 사각형(여유 포함)을 흰색으로 덮는다.
function whiteOut(image: Rgba, corners: { x: number; y: number }[]): void {
  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  const margin = Math.max(4, Math.round(Math.max(Math.max(...xs) - Math.min(...xs), 0) * 0.03));
  const x0 = Math.max(0, Math.floor(Math.min(...xs)) - margin);
  const x1 = Math.min(image.width - 1, Math.ceil(Math.max(...xs)) + margin);
  const y0 = Math.max(0, Math.floor(Math.min(...ys)) - margin);
  const y1 = Math.min(image.height - 1, Math.ceil(Math.max(...ys)) + margin);
  for (let y = y0; y <= y1; y++) {
    image.data.fill(255, (y * image.width + x0) * 4, (y * image.width + x1 + 1) * 4);
  }
}

function scan(image: Rgba, maxCodes: number): string[] {
  const work: Rgba = { data: image.data.slice(), width: image.width, height: image.height };
  const found: string[] = [];
  for (let attempt = 0; attempt < maxCodes; attempt++) {
    const hit = jsQR(work.data, work.width, work.height, { inversionAttempts: 'attemptBoth' });
    if (!hit) break;
    if (hit.data !== '') {
      if (found.includes(hit.data)) break;
      found.push(hit.data);
    }
    const l = hit.location;
    whiteOut(work, [l.topLeftCorner, l.topRightCorner, l.bottomRightCorner, l.bottomLeftCorner]);
  }
  return found;
}

function crop(image: Rgba, left: number, top: number, width: number, height: number): Rgba {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const from = ((top + y) * image.width + left) * 4;
    data.set(image.data.subarray(from, from + width * 4), y * width * 4);
  }
  return { data, width, height };
}

// jsQR 은 그림 안에 QR 이 여럿이면 찾기 무늬가 섞여 하나도 못 읽는다.
// 그래서 통째로 한 번 본 뒤, 가로·세로로 나눈 칸을 반 칸씩 겹쳐 옮기며 잘라 본다.
const GRIDS: [number, number][] = [[2, 1], [1, 2], [2, 2], [3, 1], [1, 3], [3, 3]];

function scanTiles(image: Rgba, maxCodes: number): string[] {
  const found = scan(image, maxCodes);
  // 통째로 하나라도 읽혔으면 나머지는 덮어 가며 찾았으니 자르지 않는다(흔한 한 장짜리를 빠르게).
  if (found.length > 0) return found;
  for (const [cols, rows] of GRIDS) {
    const w = Math.floor(image.width / cols);
    const h = Math.floor(image.height / rows);
    if (w < 64 || h < 64) continue;
    for (let ty = 0; ty <= 2 * (rows - 1); ty++) {
      for (let tx = 0; tx <= 2 * (cols - 1); tx++) {
        const left = Math.min(image.width - w, Math.round((tx * w) / 2));
        const top = Math.min(image.height - h, Math.round((ty * h) / 2));
        for (const text of scan(crop(image, left, top, w, h), maxCodes)) {
          if (!found.includes(text)) found.push(text);
          if (found.length >= maxCodes) return found;
        }
      }
    }
  }
  return found;
}

export function decodeQrAll(image: Rgba, maxCodes = 10): string[] {
  const direct = scanTiles(image, maxCodes);
  if (direct.length > 0) return direct;

  const longSide = Math.max(image.width, image.height);
  for (const target of TARGET_SIZES) {
    if (longSide <= target) continue;
    const ratio = target / longSide;
    const small = boxDownscale(
      image,
      Math.max(1, Math.round(image.width * ratio)),
      Math.max(1, Math.round(image.height * ratio)),
    );
    const found = scanTiles(small, maxCodes);
    if (found.length > 0) return found;
  }
  return [];
}
