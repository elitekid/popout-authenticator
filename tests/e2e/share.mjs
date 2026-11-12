import { focusPage } from './browser.mjs';
// 코드 공유 시나리오: 팝업에서 비밀번호 링크 만들기 → 받는 쪽 정적 페이지(dist-share)에서 열어 코드·이름 확인.
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeNoneVault, totp } from './vault-fixture.mjs';

const PASSWORD = 'pw-e2e-1234';
const SHARE_BASE = 'https://elitekid.github.io/popout-authenticator/share/#';
const SHARE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist-share');

// 가짜 비밀키 JBSWY3DPEHPK3PXP (Hello! 뒤 de ad be ef)
const SECRET = Buffer.from([0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x21, 0xde, 0xad, 0xbe, 0xef]);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

function fakeAccount() {
  const now = Date.now();
  return {
    id: randomUUID(),
    type: 'totp',
    issuer: 'Share',
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

// dist-share 만 정적으로 서빙한다. 폴더 밖 경로는 거부.
function serveShare() {
  const server = http.createServer((req, res) => {
    const pathname = decodeURIComponent((req.url ?? '/').split('?')[0].split('#')[0]);
    const file = path.resolve(SHARE_DIR, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (file !== SHARE_DIR && !file.startsWith(SHARE_DIR + path.sep)) {
      res.writeHead(403).end();
      return;
    }
    fs.readFile(file, (error, body) => {
      if (error) {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
      res.end(body);
    });
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

export async function runShareScenario(session) {
  const { browser, extensionId } = session;
  const origin = session.baseUrl ?? `chrome-extension://${extensionId}`;
  const problems = [];
  const pages = [];
  let server;

  if (!fs.existsSync(path.join(SHARE_DIR, 'index.html'))) {
    return ['dist-share 없음(npm run build)'];
  }

  try {
    const vault = await makeNoneVault([fakeAccount()]);
    const seed = await browser.newPage();
    pages.push(seed);
    await seed.goto(`${origin}/manage.html`, { waitUntil: session.navigationWait ?? 'load' });
    await seed.evaluate(async (v) => {
      await chrome.storage.local.remove('vault');
      await chrome.storage.local.set({ vault: v });
    }, vault);
    await seed.close();
    pages.pop();

    const popup = await browser.newPage();
    pages.push(popup);
    popup.on('pageerror', (err) => problems.push(`share popup pageerror: ${err.message}`));
    await popup.goto(`${origin}/popup.html`, { waitUntil: session.navigationWait ?? 'load' });
    await focusPage(popup);
    // 공유는 줄의 ⋯ 메뉴 안 항목
    await popup.waitForSelector('[data-role="more"]', { timeout: 10000 });
    await popup.click('[data-role="more"]');
    await popup.waitForSelector('[data-role="share"]', { timeout: 5000 });
    await popup.click('[data-role="share"]');
    await popup.waitForSelector('[data-role="share-form"]', { timeout: 5000 });
    await popup.click('[data-role="share-duration"][data-seconds="300"]');
    await popup.type('[data-role="share-password"]', PASSWORD);
    await popup.click('[data-role="share-create"]');
    await popup.waitForSelector('[data-role="share-link"]', { timeout: 30000 });
    const link = await popup.$eval('[data-role="share-link"]', (el) => el.value);
    if (!link.startsWith(SHARE_BASE)) {
      problems.push(`링크가 ${SHARE_BASE} 로 시작해야 하는데 ${link.slice(0, 80)}`);
      return problems;
    }
    const fragment = link.slice(SHARE_BASE.length);
    await popup.close();
    pages.pop();

    server = await serveShare();
    const { port } = server.address();
    const page = await browser.newPage();
    pages.push(page);
    page.on('pageerror', (err) => problems.push(`share page pageerror: ${err.message}`));
    await page.goto(`http://127.0.0.1:${port}/index.html#${fragment}`, { waitUntil: session.navigationWait ?? 'load' });
    await focusPage(page);

    // 틀린 비밀번호 한 번
    await page.waitForSelector('[data-role="share-password"]', { timeout: 10000 });
    await page.type('[data-role="share-password"]', 'wrong-pw-0000');
    await page.click('[data-role="share-open"]');
    await page.waitForSelector('[data-role="share-error"]', { timeout: 30000 });

    // 맞는 비밀번호
    await page.type('[data-role="share-password"]', PASSWORD);
    await page.click('[data-role="share-open"]');
    await page.waitForSelector('[data-role="share-code"][data-code]', { timeout: 30000 });
    const before = Date.now();
    const got = await page.$eval('[data-role="share-code"]', (el) => el.getAttribute('data-code'));
    const after = Date.now();
    const expected = [before - 1000, before, after, after + 1000].map((at) => totp(SECRET, at));
    if (!expected.includes(got)) {
      problems.push(`코드가 다름: got ${JSON.stringify(got)}, want one of ${expected.join('/')}`);
    }
    const name = await page.$eval('[data-role="share-name"]', (el) => el.textContent);
    if (name !== 'Share demo@example.com') {
      problems.push(`이름이 'Share demo@example.com' 이어야 하는데 ${JSON.stringify(name)}`);
    }
    // 공유 페이지에서 복사 거절을 숨기지 않고, 재시도 성공도 같은 자리에 알린다.
    await page.evaluate(() => {
      navigator.clipboard.writeText = async () => { throw new Error('test copy denied'); };
    });
    await page.click('[data-role="share-code"]');
    await page.waitForSelector('[data-role="share-copy-status"].error', { timeout: 5000 });
    await page.evaluate(() => {
      navigator.clipboard.writeText = async (value) => { window.__shareCopied = value; };
    });
    await page.click('[data-role="share-code"]');
    await page.waitForFunction(() => /^\d{6}$/.test(window.__shareCopied ?? '') &&
      !document.querySelector('[data-role="share-copy-status"]')?.classList.contains('error'));
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
    if (server) {
      server.closeAllConnections?.();
      await new Promise((resolve) => server.close(() => resolve()));
    }
  }
  return problems;
}
