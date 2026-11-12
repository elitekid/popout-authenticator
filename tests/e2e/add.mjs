import { focusPage, uploadFixture } from './browser.mjs';
// 추가 화면 시나리오: 암호화 백업 → 완료 안내 → 필요한 경우에만 코드 확인 펼치기.
import { fileURLToPath } from 'node:url';
import { totp } from './vault-fixture.mjs';

const FIXTURE = fileURLToPath(new URL('../fixtures/orig-enc-backup.json', import.meta.url));
const PASSWORD = 'test-pass-1234';
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Bytes(text) {
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of text) {
    value = (value << 5) | ALPHABET.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((value >> bits) & 0xff);
      value &= (1 << bits) - 1;
    }
  }
  return Buffer.from(out);
}

export async function runAddScenario(session) {
  const { browser, extensionId } = session;
  const origin = session.baseUrl ?? `chrome-extension://${extensionId}`;
  const problems = [];
  const pages = [];

  try {
    // 빈 금고에서 시작
    const seed = await browser.newPage();
    pages.push(seed);
    await seed.goto(`${origin}/manage.html`, { waitUntil: session.navigationWait ?? 'load' });
    await seed.evaluate(() => chrome.storage.local.remove('vault'));
    await seed.close();
    pages.pop();

    const page = await browser.newPage();
    pages.push(page);
    page.on('pageerror', (err) => problems.push(`add pageerror: ${err.message}`));
    await page.goto(`${origin}/manage.html#add`, { waitUntil: session.navigationWait ?? 'load' });
    await focusPage(page);
    await page.waitForSelector('[data-section="add"] .add-tabs', { timeout: 10000 });

    const startedAt = Date.now();
    await page.click('[data-role="tab-file"]');
    const input = await page.waitForSelector('[data-role="file-input"]', { timeout: 5000 });
    await uploadFixture(input, FIXTURE, session);

    await page.waitForSelector('[data-role="password"]', { timeout: 10000 });
    await page.type('[data-role="password"]', PASSWORD);
    await page.click('[data-role="submit-password"]');

    await page.waitForSelector('[data-role="result"]', { timeout: 15000 });
    const added = await page.$eval('[data-role="result"]', (el) => el.getAttribute('data-added'));
    if (added !== '1') problems.push(`추가가 1개여야 하는데 data-added=${added}`);
    if (await page.$('[data-role="verify-row"]')) problems.push('선택하지 않은 코드 확인 목록이 기본 표시됨');
    await page.click('[data-role="verify-toggle"]');
    await page.waitForSelector('[data-role="verify-row"] [data-code]', { timeout: 10000 });
    const code = await page.$eval('[data-role="verify-row"] [data-code]', (el) =>
      el.getAttribute('data-code'),
    );
    const endedAt = Date.now();
    const secret = base32Bytes('JBSWY3DPEHPK3PXP');
    const expected = [totp(secret, startedAt), totp(secret, endedAt)];
    if (!expected.includes(code)) {
      problems.push(`확인 줄 코드가 다름: got ${JSON.stringify(code)}, want one of ${expected.join('/')}`);
    }
  } catch (error) {
    problems.push(`시나리오 오류: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    for (const page of pages) {
      try {
        await page.close();
      } catch {
        // 이미 닫힘
      }
    }
  }
  return problems;
}
