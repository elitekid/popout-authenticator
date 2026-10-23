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

  // 열려 있는 compact 작업 창 수(windows API 로 센다).
  const taskWindowCount = (page) => page.evaluate(async () =>
    (await chrome.windows.getAll({ populate: true }))
      .filter((w) => w.tabs?.some((t) => (t.url ?? '').includes('manage.html?compact=1'))).length);

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
    // 같은 작업을 두 번 요청해도 작업 창은 하나여야 한다. 그 창을 시험 대상으로 쓴다.
    const helper = await browser.newPage();
    pages.push(helper);
    await helper.goto(`${origin}/manage.html`, { waitUntil: 'load' });
    const taskUrl = `${origin}/manage.html?compact=1#add`;
    const request = () => helper.evaluate((url) => chrome.runtime.sendMessage({ type: 'open-task-window', url }), taskUrl);
    await Promise.all([request(), request()]);
    await request();
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const taskCount = await taskWindowCount(helper);
    if (taskCount !== 1) problems.push(`작업 창이 1개여야 하는데 ${taskCount}개`);
    const target = await browser.waitForTarget(
      (t) => t.url().startsWith(`${origin}/manage.html?compact=1`), { timeout: 10000 });
    const paste = await target.page();
    pages.push(paste);
    paste.on('pageerror', (err) => problems.push(`qr pageerror: ${err.message}`));
    await paste.waitForSelector('[data-section="add"] .add-tabs', { timeout: 10000 });
    await paste.click('[data-role="tab-qr"]');
    await paste.waitForSelector('[data-role="qr-drop"]', { timeout: 5000 });
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
    // 완료하면 작업 창이 닫히고 window.html 로 바뀌지 않는다.
    const closed = new Promise((resolve) => paste.once('close', resolve));
    await paste.click('[data-role="add-done"]');
    await Promise.race([closed, new Promise((resolve) => setTimeout(resolve, 5000))]);
    if (!paste.isClosed()) problems.push('완료 뒤 작업 창이 닫히지 않음');
    pages.pop();
    if (await taskWindowCount(helper) !== 0) problems.push('완료 뒤 작업 창이 남아 있음');
    const list = await browser.newPage();
    pages.push(list);
    await list.goto(`${origin}/window.html`, { waitUntil: 'load' });
    await list.waitForSelector('.popup-list .row');
    if ((await list.$$('.popup-list .row')).length !== 2) problems.push('완료 뒤 코드 목록에 추가한 계정이 표시되지 않음');
    await list.close();
    pages.pop();
    await helper.close();
    pages.splice(pages.indexOf(helper), 1);

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

    // (c) 다른 앱 화면 QR: 화면 선택 모드 캡처 탭(가짜 getDisplayMedia)
    await clearVault();
    const origin3 = await openQrTab();
    const isActive = () => origin3.evaluate(async () => (await chrome.tabs.getCurrent())?.active === true);
    const openDisplayTab = async () => {
      const opened = browser.waitForTarget(
        (t) => t.url().startsWith(`${origin}/capture.html`) && t.url().includes('mode=display'),
        { timeout: 10000 },
      );
      await origin3.click('[data-role="qr-display"]');
      const cap = await (await opened).page();
      pages.push(cap);
      cap.on('pageerror', (err) => problems.push(`capture pageerror: ${err.message}`));
      await cap.waitForSelector('[data-role="capture-choose"]', { timeout: 10000 });
      if (!(await cap.$('[data-role="capture-hint"]'))) problems.push('화면 선택 모드에 안내 문구가 없음');
      return cap;
    };
    const closedWithin = async (page) => {
      const gone = new Promise((resolve) => page.once('close', () => resolve(true)));
      return Promise.race([gone, new Promise((resolve) => setTimeout(() => resolve(page.isClosed()), 10000))]);
    };

    // 성공: QR 그림을 그린 canvas 스트림 → 계정 추가 → 캡처 탭이 닫히고 원래 탭이 활성
    const ok = await openDisplayTab();
    await ok.evaluate((b64) => {
      navigator.mediaDevices.getDisplayMedia = async () => {
        const img = new Image();
        img.src = `data:image/png;base64,${b64}`;
        await img.decode();
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const draw = () => canvas.getContext('2d').drawImage(img, 0, 0);
        draw();
        setInterval(draw, 100);
        return canvas.captureStream(10);
      };
    }, base64);
    const okClosed = closedWithin(ok);
    await ok.click('[data-role="capture-choose"]');
    if (!(await okClosed)) problems.push('화면 선택 성공 추가 뒤 캡처 탭이 닫히지 않음');
    pages.pop();
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (!(await isActive())) problems.push('캡처 탭이 닫힌 뒤 원래 탭이 활성화되지 않음');
    const added = await origin3.evaluate(async () => {
      const file = (await chrome.storage.local.get('vault')).vault;
      return JSON.stringify(file ?? '').length > 2;
    });
    if (!added) problems.push('화면 선택으로 계정이 저장되지 않음');

    // 거절: NotAllowedError → 안내 문구와 닫기 단추, 닫으면 원래 탭으로 복귀
    const denied = await openDisplayTab();
    await denied.evaluate(() => {
      navigator.mediaDevices.getDisplayMedia = async () => {
        throw new DOMException('denied', 'NotAllowedError');
      };
    });
    await denied.click('[data-role="capture-choose"]');
    await denied.waitForSelector('[data-role="capture-display-error"]', { timeout: 5000 });
    if (!(await denied.$('[data-role="capture-close"]'))) problems.push('거절 뒤 닫기 단추가 없음');
    if (!(await denied.$('[data-role="capture-choose"]'))) problems.push('거절 뒤 다시 시도 단추가 사라짐');
    const deniedClosed = closedWithin(denied);
    await denied.click('[data-role="capture-close"]');
    if (!(await deniedClosed)) problems.push('닫기 단추를 눌러도 캡처 탭이 닫히지 않음');
    pages.pop();
    await new Promise((resolve) => setTimeout(resolve, 500));
    if (!(await isActive())) problems.push('닫기 뒤 원래 탭이 활성화되지 않음');
    await origin3.close();
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
