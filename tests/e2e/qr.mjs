// QR 시나리오: 그림 붙여넣기(Google 내보내기 QR 2개 계정), 카메라(가짜 영상, 묶음 2장 12개 계정).
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const FIXTURE = fileURLToPath(new URL('../fixtures/migration-qr.png', import.meta.url));

// 가짜 카메라가 차례로 보여 줄 Google 내보내기 링크(가짜 계정 12개, 2장).
export const CAMERA_LINKS = [
  'otpauth-migration://offline?data=Ci8KCkhlbGxvId6tvhASFEZha2UxOnFyQGV4YW1wbGUuY29tGgVGYWtlMSABKAEwAgovCgpIZWxsbyHerb4REhRGYWtlMjpxckBleGFtcGxlLmNvbRoFRmFrZTIgASgBMAIKLwoKSGVsbG8h3q2%2BEhIURmFrZTM6cXJAZXhhbXBsZS5jb20aBUZha2UzIAEoATACCi8KCkhlbGxvId6tvhMSFEZha2U0OnFyQGV4YW1wbGUuY29tGgVGYWtlNCABKAEwAgovCgpIZWxsbyHerb4UEhRGYWtlNTpxckBleGFtcGxlLmNvbRoFRmFrZTUgASgBMAIKLwoKSGVsbG8h3q2%2BFRIURmFrZTY6cXJAZXhhbXBsZS5jb20aBUZha2U2IAEoATACCi8KCkhlbGxvId6tvhYSFEZha2U3OnFyQGV4YW1wbGUuY29tGgVGYWtlNyABKAEwAgovCgpIZWxsbyHerb4XEhRGYWtlODpxckBleGFtcGxlLmNvbRoFRmFrZTggASgBMAIKLwoKSGVsbG8h3q2%2BGBIURmFrZTk6cXJAZXhhbXBsZS5jb20aBUZha2U5IAEoATACCjEKCkhlbGxvId6tvhkSFUZha2UxMDpxckBleGFtcGxlLmNvbRoGRmFrZTEwIAEoATACEAEYAiAAKJIh',
  'otpauth-migration://offline?data=CjEKCkhlbGxvId6tvhoSFUZha2UxMTpxckBleGFtcGxlLmNvbRoGRmFrZTExIAEoATACCjEKCkhlbGxvId6tvhsSFUZha2UxMjpxckBleGFtcGxlLmNvbRoGRmFrZTEyIAEoATACEAEYAiABKJIh',
];

export async function runQrScenario(session, screenshotDir) {
  const { browser, extensionId } = session;
  const origin = `chrome-extension://${extensionId}`;
  const problems = [];
  const pages = [];

  // 확장 페이지에서 금고를 지운다.
  const clearVault = async () => {
    const page = await browser.newPage();
    pages.push(page);
    await page.goto(`${origin}/manage.html`, { waitUntil: 'load' });
    await page.evaluate(() => chrome.storage.local.remove('vault'));
    await page.close();
    pages.pop();
  };

  const openQrTab = async () => {
    const page = await browser.newPage();
    pages.push(page);
    page.on('pageerror', (err) => problems.push(`qr pageerror: ${err.message}`));
    await page.setViewport({ width: 320, height: 660 });
    await page.goto(`${origin}/manage.html?compact=1#add`, { waitUntil: 'load' });
    await page.bringToFront();
    await page.waitForSelector('[data-section="add"] .add-tabs', { timeout: 10000 });
    await page.click('[data-role="tab-qr"]');
    await page.waitForSelector('[data-role="qr-drop"]', { timeout: 5000 });
    return page;
  };

  try {
    // (a) 그림 붙여넣기
    await clearVault();
    const paste = await openQrTab();
    // 붙여넣기 리스너가 달릴 틈을 준다.
    await new Promise((resolve) => setTimeout(resolve, 300));
    const base64 = (await fs.readFile(FIXTURE)).toString('base64');
    await paste.evaluate((b64) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const file = new File([bytes], 'migration-qr.png', { type: 'image/png' });
      const dt = new DataTransfer();
      dt.items.add(file);
      document.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }),
      );
    }, base64);
    await paste.waitForSelector('[data-role="result"]', { timeout: 15000 });
    const pasted = await paste.$eval('[data-role="result"]', (el) => el.getAttribute('data-added'));
    if (pasted !== '2') problems.push(`붙여넣기: 추가가 2개여야 하는데 data-added=${pasted}`);
    if (await paste.$('[data-role="verify-row"]')) problems.push('QR 추가 뒤 불필요한 코드 확인 목록이 기본 표시됨');
    const visible = await paste.$eval('[data-role="result"]', (el) => {
      const box = el.getBoundingClientRect();
      return box.top >= 0 && box.bottom <= window.innerHeight;
    });
    if (!visible) problems.push('추가 완료 안내가 보이는 영역 밖에 있음');
    if (screenshotDir) await paste.screenshot({ path: `${screenshotDir}/qr-added-320.png` });

    // 중복만 가져온 경우에는 새로 추가됐다고 안내하면 안 된다.
    await paste.evaluate((b64) => {
      const dt = new DataTransfer();
      dt.items.add(new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], 'same-qr.png', { type: 'image/png' }));
      document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    }, base64);
    await paste.waitForFunction(() => document.querySelector('[data-role="result"]')?.getAttribute('data-duplicates') === '2');
    const duplicateAdded = await paste.$eval('[data-role="result"]', (el) => el.getAttribute('data-added'));
    if (duplicateAdded !== '0' || await paste.$('[data-role="verify-toggle"]')) problems.push('중복만 읽었는데 추가/코드 확인을 표시함');
    await paste.click('[data-role="add-done"]');
    await paste.waitForFunction(() => location.pathname.endsWith('/window.html'));
    await paste.waitForSelector('.popup-list .row');
    if ((await paste.$$('.popup-list .row')).length !== 2) problems.push('완료 뒤 코드 목록에 추가한 계정이 표시되지 않음');
    await paste.close();
    pages.pop();

    // (b) 카메라
    await clearVault();
    const cam = await openQrTab();
    await cam.click('[data-role="camera-start"]');
    await cam.waitForFunction(
      () => {
        const el = document.querySelector('[data-role="qr-progress"]');
        return el?.getAttribute('data-seen') === '2' && el.getAttribute('data-total') === '2';
      },
      { timeout: 20000 },
    );
    await cam.waitForFunction(
      () => document.querySelector('[data-role="result"]')?.getAttribute('data-added') === '12',
      { timeout: 10000 },
    );
    if (await cam.$('[data-role="verify-row"]')) problems.push('카메라 스캔 중 코드 확인 목록이 기본 표시됨');
    await cam.click('[data-role="camera-stop"]');
    await cam.click('[data-role="verify-toggle"]');
    await cam.waitForSelector('[data-role="verify-row"]');
    const rows = await cam.$$eval('[data-role="verify-row"]', (els) => els.length);
    if (rows !== 12) problems.push(`카메라: 확인 줄이 12개여야 하는데 ${rows}개`);
    if (await cam.$('[data-role="verify-same"]')) problems.push('선택적 진단에 불필요한 같아요 단추가 남음');
    const layout = await cam.$$eval('[data-role="verify-row"]', (els) => els.every((el) => {
      const code = el.querySelector('[data-role="verify-code"]')?.getBoundingClientRect();
      const action = el.querySelector('[data-role="verify-diff"]')?.getBoundingClientRect();
      return code && action && code.right <= action.left && action.right <= window.innerWidth;
    }));
    if (!layout) problems.push('좁은 화면에서 진단 코드와 설정 단추가 겹치거나 밖으로 나감');
    if (screenshotDir) await cam.screenshot({ path: `${screenshotDir}/qr-diagnostics-320.png` });
    await cam.click('[data-role="verify-toggle"]');
    if (await cam.$('[data-role="verify-row"]')) problems.push('진단을 접은 뒤 코드 목록이 남음');
    await cam.close();
    pages.pop();
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
