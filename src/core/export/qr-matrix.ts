// 글자 → QR 모듈 행렬(true = 어두운 칸). 그리기는 화면 단위 몫.
import qrcode from 'qrcode-generator';

export function qrMatrix(text: string): boolean[][] {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const size = qr.getModuleCount();
  const rows: boolean[][] = [];
  for (let r = 0; r < size; r++) {
    const row: boolean[] = [];
    for (let c = 0; c < size; c++) row.push(qr.isDark(r, c));
    rows.push(row);
  }
  return rows;
}
