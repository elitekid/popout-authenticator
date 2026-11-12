import { focusPage, uploadFixture } from './browser.mjs';
// 초기화 시나리오: 백업 뒤 저장한 파일을 골라 대조하고 확인하면 기존 데이터가 지워진다. 열린 목록은 새 빈 금고를 만들 수 있다.
// 다른 시나리오가 모두 끝난 뒤에 돌려야 한다.
import { randomUUID, webcrypto } from 'node:crypto';
import fs from 'node:fs';
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

// 초기화 전 백업으로 내려받은 가장 최근 파일 경로(없으면 null)
async function waitForReset(dir, timeoutMs) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const found = fs.readdirSync(dir)
      .filter((n) => n.startsWith('popout-authenticator-before-reset-') && n.endsWith('.json'))
      .map((n) => `${dir}/${n}`)
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    if (found.length > 0) return found[0];
    await new Promise((r) => setTimeout(r, 200));
  }
  return null;
}

export async function runResetScenario(session) {
  const { browser, extensionId } = session;
  const origin = session.baseUrl ?? `chrome-extension://${extensionId}`;
  const problems = [];
  const pages = [];
  const dir = session.downloadDir ?? fs.mkdtempSync('/tmp/otp-e2e-reset-dl-');

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
    // 저장한 파일을 다시 골라 대조하므로 Chromium 은 임시 폴더로 받는다. Firefox 는 시험 프로필의 다운로드 폴더로 받아 종료 때 지운다.
    if (session.browserName !== 'firefox') {
      const cdp = await page.createCDPSession();
      try {
        await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dir });
      } catch {
        await cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: dir });
      }
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

    // B9: 다운로드만 하고 확인하지 않으면 초기화 단계가 막혀 있어야 한다(저장 대화상자 취소와 구분할 수 없다).
    await page.click('[data-role="reset-backup-save"]');
    await page.waitForSelector('[data-role="reset-backup-file"]', { timeout: 10000 });
    const saved = await waitForReset(dir, 10000);
    if (!saved) {
      problems.push('초기화 전 백업 파일이 내려받아지지 않음');
      return problems;
    }
    if (await page.$('[data-role="reset-ack"]')) problems.push('파일을 확인하지 않았는데 초기화 확인 칸이 열림');
    if (!(await runDisabled(page))) problems.push('파일을 확인하지 않았는데 초기화 단추가 눌릴 수 있음');

    // 틀린 파일이면 막힌 채 mismatch 가 보여야 한다.
    const wrongDir = fs.mkdtempSync('/tmp/otp-e2e-wrong-');
    const wrong = `${wrongDir}/wrong.json`;
    fs.writeFileSync(wrong, `${fs.readFileSync(saved, 'utf8')} `);
    await uploadFixture(await page.$('[data-role="reset-backup-file"]'), wrong, session);
    await page.waitForSelector('[data-role="reset-backup-mismatch"]', { timeout: 5000 });
    if (await page.$('[data-role="reset-ack"]')) problems.push('틀린 파일인데 초기화 확인 칸이 열림');
    if (!(await runDisabled(page))) problems.push('틀린 파일인데 초기화 단추가 눌릴 수 있음');

    // 방금 저장한 파일이면 다음 단계가 열린다.
    await uploadFixture(await page.$('[data-role="reset-backup-file"]'), saved, session);
    await page.waitForSelector('[data-role="reset-ack"]', { timeout: 10000 });
    // A1/A2: 확인 뒤 다른 경로로 금고 내용이 바뀌면 확인이 풀려 초기화 단계가 다시 막혀야 한다.
    const changed = await makeNoneVault([{ ...fakeAccount(), label: 'changed@example.com' }]);
    await page.evaluate(async (v) => { await chrome.storage.local.set({ vault: v }); }, changed);
    await page.waitForFunction(() => document.querySelector('[data-role="reset-ack"]') === null, { timeout: 5000 });
    if (!(await runDisabled(page))) problems.push('금고가 바뀌었는데 초기화 단추가 눌릴 수 있음');
    // 원래 금고로 되돌려 이어서 처음부터 다시 백업·확인한다.
    await page.evaluate(async (v) => { await chrome.storage.local.set({ vault: v }); }, vault);
    await page.click('[data-role="reset-backup-save"]');
    await page.waitForSelector('[data-role="reset-backup-file"]', { timeout: 10000 });
    const saved2 = await waitForReset(dir, 10000);
    await uploadFixture(await page.$('[data-role="reset-backup-file"]'), saved2, session);
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
