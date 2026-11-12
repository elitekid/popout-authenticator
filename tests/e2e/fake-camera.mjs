// e2e 용 가짜 카메라 영상(Y4M). 문자열마다 QR 을 흰 바탕 가운데에 그려 차례로 보여 준다.
import fs from 'node:fs/promises';
import qrcode from 'qrcode-generator';

const WIDTH = 640;
const HEIGHT = 480;
const FRAMES_PER_TEXT = 20;
const QUIET = 4;
const DARK = 16;
const LIGHT = 235;

function frameFor(text) {
  const qr = qrcode(0, 'L');
  qr.addData(text);
  qr.make();
  const count = qr.getModuleCount();
  const scale = Math.max(1, Math.floor(Math.min(WIDTH, HEIGHT) / (count + QUIET * 2)));
  const size = (count + QUIET * 2) * scale;
  const left = Math.floor((WIDTH - size) / 2) + QUIET * scale;
  const top = Math.floor((HEIGHT - size) / 2) + QUIET * scale;

  const header = Buffer.from('FRAME\n');
  const luma = Buffer.alloc(WIDTH * HEIGHT, LIGHT);
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (!qr.isDark(r, c)) continue;
      for (let y = 0; y < scale; y++) {
        const row = (top + r * scale + y) * WIDTH + left + c * scale;
        luma.fill(DARK, row, row + scale);
      }
    }
  }
  const chroma = Buffer.alloc((WIDTH / 2) * (HEIGHT / 2) * 2, 128);
  return Buffer.concat([header, luma, chroma]);
}

export async function writeFakeCamera(filePath, texts) {
  const parts = [Buffer.from(`YUV4MPEG2 W${WIDTH} H${HEIGHT} F10:1 Ip A1:1 C420jpeg\n`)];
  for (const text of texts) {
    const frame = frameFor(text);
    for (let i = 0; i < FRAMES_PER_TEXT; i++) parts.push(frame);
  }
  await fs.writeFile(filePath, Buffer.concat(parts));
}
