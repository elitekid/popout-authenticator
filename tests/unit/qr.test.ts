import qrcode from 'qrcode-generator';
import { describe, expect, it } from 'vitest';
import { boxDownscale, decodeQrAll, type Rgba } from '../../src/core/qr';

const LINK_A = 'otpauth://totp/Example:alice?secret=JBSWY3DPEHPK3PXP&issuer=Example';
const LINK_B = 'otpauth://totp/Corp:ops?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=Corp';

function solid(width: number, height: number, value: number): Rgba {
  const data = new Uint8ClampedArray(width * height * 4).fill(value);
  if (value !== 255) for (let i = 3; i < data.length; i += 4) data[i] = 255;
  return { data, width, height };
}

// 모듈을 scale px 로 그리고 사방에 margin 모듈의 여백을 둔다.
function render(text: string, scale = 4, margin = 4, invert = false): Rgba {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const count = qr.getModuleCount();
  const size = (count + margin * 2) * scale;
  const img = solid(size, size, invert ? 0 : 255);
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (!qr.isDark(r, c)) continue;
      const v = invert ? 255 : 0;
      for (let y = 0; y < scale; y++) {
        for (let x = 0; x < scale; x++) {
          const o = (((r + margin) * scale + y) * size + (c + margin) * scale + x) * 4;
          img.data[o] = img.data[o + 1] = img.data[o + 2] = v;
          img.data[o + 3] = 255;
        }
      }
    }
  }
  return img;
}

function paste(canvas: Rgba, img: Rgba, left: number, top: number): void {
  for (let y = 0; y < img.height; y++) {
    const from = y * img.width * 4;
    canvas.data.set(img.data.subarray(from, from + img.width * 4), ((top + y) * canvas.width + left) * 4);
  }
}

function sideBySide(a: Rgba, b: Rgba, bg = 255): Rgba {
  const canvas = solid(a.width + b.width, Math.max(a.height, b.height), bg);
  paste(canvas, a, 0, 0);
  paste(canvas, b, a.width, 0);
  return canvas;
}

describe('decodeQrAll', () => {
  it('reads one code', () => {
    expect(decodeQrAll(render(LINK_A))).toEqual([LINK_A]);
  });

  it('reads two codes side by side', () => {
    const found = decodeQrAll(sideBySide(render(LINK_A), render(LINK_B)));
    expect(found).toHaveLength(2);
    expect(new Set(found)).toEqual(new Set([LINK_A, LINK_B]));
  });

  it('reads inverted colours', () => {
    expect(decodeQrAll(render(LINK_A, 4, 4, true))).toEqual([LINK_A]);
    const both = sideBySide(render(LINK_A, 4, 4, true), render(LINK_B, 4, 4, true), 0);
    expect(new Set(decodeQrAll(both))).toEqual(new Set([LINK_A, LINK_B]));
  });

  it('reads a small code inside a 2400px wide picture', () => {
    const canvas = solid(2400, 900, 255);
    paste(canvas, render(LINK_A, 3), 1500, 300);
    expect(decodeQrAll(canvas)).toEqual([LINK_A]);
  });

  it('reads a large code in a very large picture', () => {
    const canvas = solid(2600, 2600, 255);
    paste(canvas, render(LINK_B, 24), 300, 200);
    expect(decodeQrAll(canvas)).toEqual([LINK_B]);
  });

  it('returns nothing for a blank picture', () => {
    expect(decodeQrAll(solid(300, 300, 255))).toEqual([]);
  });

  it('stops at maxCodes', () => {
    const found = decodeQrAll(sideBySide(render(LINK_A), render(LINK_B)), 1);
    expect(found).toHaveLength(1);
  });
});

describe('boxDownscale', () => {
  it('averages 2x2 blocks', () => {
    const src: Rgba = { data: new Uint8ClampedArray(4 * 4 * 4), width: 4, height: 4 };
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        const o = (y * 4 + x) * 4;
        const v = x < 2 ? 0 : 200; // 왼쪽 검정, 오른쪽 200
        src.data[o] = src.data[o + 1] = src.data[o + 2] = v;
        src.data[o + 3] = 255;
      }
    }
    const small = boxDownscale(src, 2, 2);
    expect(small.width).toBe(2);
    expect(small.height).toBe(2);
    expect(Array.from(small.data.slice(0, 4))).toEqual([0, 0, 0, 255]);
    expect(Array.from(small.data.slice(4, 8))).toEqual([200, 200, 200, 255]);
  });
});
