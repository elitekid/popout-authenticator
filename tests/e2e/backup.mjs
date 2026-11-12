import { focusPage, uploadFixture } from './browser.mjs';
// 백업 화면 시나리오: 암호화 백업 만들기·다운로드 → 금고 지우기 → 추가 화면에서 그 파일로 되살리기.
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { makeNoneVault, totp } from './vault-fixture.mjs';

const PASSWORD = 'fake-pass-5678';

// 가짜 비밀키(Hello! 뒤 de ad be ef)와 마지막 바이트만 바꾼 변형
const BASE = [0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x21, 0xde, 0xad, 0xbe];
const secrets = {
  Alpha: Buffer.from([...BASE, 0xef]),
  Bravo: Buffer.from([...BASE, 0x01]),
};

function fakeAccount(issuer) {
  const now = Date.now();
  return {
    id: randomUUID(),
    type: 'totp',
    issuer,
    label: `${issuer.toLowerCase()}@example.test`,
    secret: secrets[issuer],
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

async function waitForDownload(dir, timeoutMs) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    const done = fs.readdirSync(dir).filter((n) => n.endsWith('.json'));
    if (done.length > 0) return done[0];
    await new Promise((r) => setTimeout(r, 200));
  }
  return null;
}

export async function runBackupScenario(session) {
  const { browser, extensionId } = session;
  const origin = session.baseUrl ?? `chrome-extension://${extensionId}`;
  const problems = [];
  const pages = [];
  const dir = session.downloadDir ?? fs.mkdtempSync('/tmp/otp-e2e-dl-');

  try {
    const vault = await makeNoneVault(['Alpha', 'Bravo'].map(fakeAccount));
    const seed = await browser.newPage();
    pages.push(seed);
    await seed.goto(`${origin}/manage.html`, { waitUntil: session.navigationWait ?? 'load' });
    await seed.evaluate(async (v) => {
      await chrome.storage.local.remove(['vault', 'backupInfo']);
      await chrome.storage.local.set({ vault: v });
    }, vault);
    await seed.close();
    pages.pop();

    const page = await browser.newPage();
    pages.push(page);
    page.on('pageerror', (err) => problems.push(`backup pageerror: ${err.message}`));
    if (session.browserName !== 'firefox') {
      const client = await page.createCDPSession();
      try {
        await client.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dir });
      } catch {
        await client.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: dir });
      }
    }
    await page.goto(`${origin}/manage.html#backup`, { waitUntil: session.navigationWait ?? 'load' });
    await focusPage(page);
    await page.waitForSelector('[data-section="backup"] [data-role="export-format"]', { timeout: 10000 });

    await page.select('[data-role="export-format"]', 'own-encrypted');
    await page.type('[data-role="export-password"]', PASSWORD);
    await page.type('[data-role="export-password2"]', PASSWORD);
    await page.click('[data-role="make"]');

    await page.waitForSelector('[data-role="verify-result"]', { timeout: 30000 });
    const counts = await page.$eval('[data-role="verify-result"]', (el) => ({
      expected: el.getAttribute('data-expected'),
      found: el.getAttribute('data-found'),
    }));
    if (counts.expected !== '2' || counts.found !== '2') {
      problems.push(`대조가 2개 중 2개여야 하는데 ${JSON.stringify(counts)}`);
    }

    await page.click('[data-role="download"]');
    const name = await waitForDownload(dir, 10000);
    if (!name) {
      problems.push('10초 안에 .json 파일이 내려받아지지 않음');
      return problems;
    }
    const backup = `${dir}/${name}`;

    // 저장 대화상자 취소를 알 수 없으므로, 다운로드만으로는 백업 완료로 기록하지 않고 '저장했습니다'를 눌러야 기록한다.
    await page.waitForSelector('[data-role="saved-confirm"]', { timeout: 5000 });
    if ((await page.evaluate(() => chrome.storage.local.get('backupInfo'))).backupInfo !== undefined) {
      problems.push('저장했습니다를 누르기 전에 backupInfo 가 기록됨');
    }
    await page.click('[data-role="saved-confirm"]');
    await page.waitForFunction(
      async () => (await chrome.storage.local.get('backupInfo')).backupInfo !== undefined,
      { timeout: 5000 },
    );

    // 금고만 지우고 추가 화면에서 그 파일로 되살린다.
    await page.evaluate(() => chrome.storage.local.remove('vault'));
    await page.close();
    pages.pop();

    const add = await browser.newPage();
    pages.push(add);
    add.on('pageerror', (err) => problems.push(`backup add pageerror: ${err.message}`));
    await add.goto(`${origin}/manage.html#add`, { waitUntil: session.navigationWait ?? 'load' });
    await focusPage(add);
    await add.waitForSelector('[data-section="add"] .add-tabs', { timeout: 10000 });

    const startedAt = Date.now();
    await add.click('[data-role="tab-file"]');
    const input = await add.waitForSelector('[data-role="file-input"]', { timeout: 5000 });
    await uploadFixture(input, backup, session);
    await add.waitForSelector('[data-role="password"]', { timeout: 10000 });
    await add.type('[data-role="password"]', PASSWORD);
    await add.click('[data-role="submit-password"]');

    await add.waitForSelector('[data-role="result"]', { timeout: 30000 });
    const added = await add.$eval('[data-role="result"]', (el) => el.getAttribute('data-added'));
    if (added !== '2') problems.push(`추가가 2개여야 하는데 data-added=${added}`);
    await add.click('[data-role="verify-toggle"]');
    await add.waitForFunction(
      () => document.querySelectorAll('[data-role="verify-row"] [data-code]').length === 2,
      { timeout: 10000 },
    );
    const rows = await add.$$eval('[data-role="verify-row"]', (els) =>
      els.map((el) => ({
        issuer: el.querySelector('.issuer')?.textContent ?? '',
        code: el.querySelector('[data-code]')?.getAttribute('data-code') ?? '',
      })),
    );
    const endedAt = Date.now();
    for (const issuer of ['Alpha', 'Bravo']) {
      const row = rows.find((r) => r.issuer === issuer);
      const expected = [totp(secrets[issuer], startedAt), totp(secrets[issuer], endedAt)];
      if (!row || !expected.includes(row.code)) {
        problems.push(`${issuer} 코드가 다름: got ${JSON.stringify(row?.code)}, want one of ${expected.join('/')}`);
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
    if (!session.downloadDir) fs.rmSync(dir, { recursive: true, force: true });
  }
  return problems;
}
