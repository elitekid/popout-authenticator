import { focusPage } from './browser.mjs';
// 초기화 시나리오: 백업 뒤 확인하면 기존 데이터가 지워진다. 열린 목록은 새 빈 금고를 만들 수 있다.
// 다른 시나리오가 모두 끝난 뒤에 돌려야 한다.
import { randomUUID, webcrypto } from 'node:crypto';
import { makeNoneVault } from './vault-fixture.mjs';

// 가짜 비밀키: Hello! 뒤 de ad be ef
const SECRET = Buffer.from([0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x21, 0xde, 0xad, 0xbe, 0xef]);

function fakeAccount() {
  const now = Date.now();
  return {
    id: randomUUID(),
    type: 'totp',
    issuer: 'Reset',
    label: 'demo@example.com',
    secret: SECRET,
    algorithm: 'SHA-1',
    digits: 6,
    period: 30,
    note: '',
    pinned: false,
    matchHosts: [],
    createdAt: now,
    updatedAt: now,
  };
}

const RUN = '[data-role="reset-run"]';

// 없거나 disabled 면 true
async function runDisabled(page) {
  return page.evaluate((selector) => {
    const el = document.querySelector(selector);
    return el === null || el.disabled;
  }, RUN);
}

export async function runResetScenario(session) {
  const { browser, extensionId } = session;
  const origin = session.baseUrl ?? `chrome-extension://${extensionId}`;
  const problems = [];
  const pages = [];

  try {
    const vault = await makeNoneVault([fakeAccount()]);
    const seed = await browser.newPage();
    pages.push(seed);
    await seed.goto(`${origin}/manage.html`, { waitUntil: session.navigationWait ?? 'load' });
    await seed.evaluate(async (v) => {
      await chrome.storage.local.clear();
      await chrome.storage.local.set({ vault: v });
    }, vault);
    await seed.close();
    pages.pop();

    const page = await browser.newPage();
    pages.push(page);
    page.on('pageerror', (err) => problems.push(`reset pageerror: ${err.message}`));
    // Chromium은 다운로드 차단, Firefox는 시험 프로필의 다운로드 폴더로 받아 종료 때 지운다.
    if (session.browserName !== 'firefox') {
      const cdp = await page.createCDPSession();
      await cdp.send('Browser.setDownloadBehavior', { behavior: 'deny' });
    }
    await page.goto(`${origin}/manage.html#reset`, { waitUntil: session.navigationWait ?? 'load' });
    await focusPage(page);
    await page.waitForSelector('[data-role="reset-backup-save"]', { timeout: 10000 });

    if (!(await runDisabled(page))) problems.push('백업 전에 초기화 단추가 눌릴 수 있음');

    // 백업 전에는 확인 칸이 있어도 초기화가 열리지 않아야 한다.
    const ackBefore = await page.$('[data-role="reset-ack"]');
    if (ackBefore) {
      await ackBefore.click();
      if (!(await runDisabled(page))) problems.push('확인만 체크했는데 초기화 단추가 눌릴 수 있음');
    }

    await page.click('[data-role="reset-backup-save"]');
    await page.waitForSelector('[data-role="reset-ack"]', { timeout: 10000 });
    const checked = await page.$eval('[data-role="reset-ack"]', (el) => el.checked);
    if (!checked) await page.click('[data-role="reset-ack"]');
    await page.waitForFunction(
      (selector) => {
        const el = document.querySelector(selector);
        return el !== null && !el.disabled;
      },
      { timeout: 5000 },
      RUN,
    );

    await page.click(RUN);
    await page.waitForSelector('[data-role="reset-done"]', { visible: true, timeout: 15000 });

    const left = await page.evaluate(() => chrome.storage.local.get(null));
    const remaining = Object.keys(left).filter((key) => key !== 'vault');
    if (remaining.length > 0) {
      problems.push(`초기화 뒤 local 데이터가 남음: ${remaining.join(', ')}`);
    }
    if (left.vault !== undefined) {
      // 열린 popup/window/sidepanel은 저장소 삭제 알림을 받고 createVault()를 부른다.
      // count만 믿지 않고 실제 복호화해 기존 계정이 남지 않았는지 확인한다.
      const empty = left.vault;
      if (empty.lock !== 'none' || empty.count !== 0 || empty.wrappedKeys?.length !== 1 || empty.wrappedKeys[0].kind !== 'none') {
        problems.push('초기화 뒤 기존 금고가 남음');
      } else {
        const key = await webcrypto.subtle.importKey('raw', Buffer.from(empty.wrappedKeys[0].data, 'base64'), 'AES-GCM', false, ['decrypt']);
        const plain = await webcrypto.subtle.decrypt({ name: 'AES-GCM', iv: Buffer.from(empty.iv, 'base64') }, key, Buffer.from(empty.data, 'base64'));
        const accounts = JSON.parse(new TextDecoder().decode(plain));
        if (!Array.isArray(accounts) || accounts.length !== 0) problems.push('초기화 뒤 금고 안에 계정이 남음');
      }
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
