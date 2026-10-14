import { useMemo } from 'preact/hooks';
import { qrMatrix } from '../../core/export';

const QUIET = 4;

// 흰 바탕 검은 모듈, 여백 4모듈. 글이 너무 길어 만들 수 없으면 아무것도 그리지 않는다.
export function QrSvg({ text, size = 240 }: { text: string; size?: number }) {
  const shape = useMemo(() => {
    try {
      const matrix = qrMatrix(text);
      let d = '';
      matrix.forEach((row, r) =>
        row.forEach((dark, c) => {
          if (dark) d += `M${c + QUIET} ${r + QUIET}h1v1h-1z`;
        }),
      );
      return { side: matrix.length + QUIET * 2, d };
    } catch {
      return null;
    }
  }, [text]);
  if (!shape) return null;
  return (
    <svg
      data-role="qr-svg"
      viewBox={`0 0 ${shape.side} ${shape.side}`}
      width={size}
      height={size}
      shape-rendering="crispEdges"
      role="img"
    >
      <rect width={shape.side} height={shape.side} fill="#fff" />
      <path d={shape.d} fill="#000" />
    </svg>
  );
}
