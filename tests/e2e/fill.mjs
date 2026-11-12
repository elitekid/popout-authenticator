// 코드 넣기 시나리오: 칸 하나·분할 칸·shadow 칸에 totp 코드가 들어가는지.
// 클립보드 지우기(clipboardRead 권한 필요)는 시험에서 권한을 요청할 수 없어 확인하지 않는다.
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeNoneVault, totp } from './vault-fixture.mjs';

const SECRET = Buffer.from('48656c6c6f21deadbeef', 'hex'); // JBSWY3DPEHPK3PXP
const PAGE = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), 'fill-page.html'),
);

const FOCUS = {
  single: () => document.getElementById('single').focus(),
  split: () => document.querySelector('#split input').focus(),
  shadow: () => document.getElementById('host').shadowRoot.getElementById('shadow').focus(),
};

const READ = {
  single: () => document.getElementById('single').value,
  split: () => [...document.querySelectorAll('#split input')].map((i) => i.value).join(''),
  shadow: () => document.getElementById('host').shadowRoot.getElementById('shadow').value,
};

export async function runFillScenario(session) {
  const { browser, extensionId } = session;
  const origin = `chrome-extension://${extensionId}`;
  const problems = [];
  let server;
  let page;
  let seed;

  try {
    const now = Date.now();
    const accountId = randomUUID();
    const vault = await makeNoneVault([
      {
        id: accountId,
        type: 'totp',
        issuer: 'Example',
        label: 'example@example.test',
        secret: SECRET,
        algorithm: 'SHA-1',
        digits: 6,
        period: 30,
        note: '',
        pinned: false,
        matchHosts: ['127.0.0.1'],
        createdAt: now,
        updatedAt: now,
      },
    ]);
    seed = await browser.newPage();
    await seed.goto(`${origin}/manage.html`, { waitUntil: 'load' });
    await seed.evaluate((v) => chrome.storage.local.set({ vault: v }), vault);
    await seed.close();
    seed = undefined;

    server = http.createServer((req, res) => {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(req.url === '/iframe' ? '<input id="top-otp" autocomplete="one-time-code"><iframe src="/frame"></iframe>'
        : req.url === '/frame' ? '<label>One-time code<input id="otp" autocomplete="one-time-code"></label>' : PAGE);
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const pageUrl = `http://127.0.0.1:${server.address().port}/`;

    const target = await browser.waitForTarget(
      (t) => t.type() === 'service_worker' && t.url().endsWith('/bg/sw.js'),
      { timeout: 10000 },
    );
    const worker = await target.worker();

    page = await browser.newPage();
    page.on('pageerror', (err) => problems.push(`fill 페이지 pageerror: ${err.message}`));
    await page.goto(pageUrl, { waitUntil: 'load' });

    for (const name of ['single', 'split', 'shadow']) {
      await page.bringToFront();
      await page.waitForFunction(() => document.hasFocus(), { timeout: 5000 });
      await page.evaluate(() => {
        for (const el of document.querySelectorAll('input')) el.value = '';
        const sh = document.getElementById('host').shadowRoot.getElementById('shadow');
        sh.value = '';
      });
      await page.evaluate(FOCUS[name]);

      const before = totp(SECRET, Date.now());
      let outcome;
      try {
        outcome = await worker.evaluate(async (url) => {
          const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
          return globalThis.__popoutRunFill({ tabId: tab.id, pageUrl: url, windowId: tab.windowId });
        }, pageUrl);
      } catch (error) {
        problems.push(`${name}: runFill 예외 ${error instanceof Error ? error.message : error}`);
        continue;
      }
      const after = totp(SECRET, Date.now());
      const value = await page.evaluate(READ[name]);
      if (outcome !== 'filled') problems.push(`${name}: 결과가 filled 여야 하는데 ${outcome}`);
      if (value !== before && value !== after) {
        problems.push(`${name}: 값 '${value}' 이(가) 기대 코드(${before}/${after})와 다름`);
      }
    }

    // 분리 창을 누른 뒤처럼 사이트의 포커스가 빠져도 마지막 iframe 입력칸을 쓴다.
    await page.goto(`${pageUrl}iframe`);
    const frame = page.frames().find((f) => f !== page.mainFrame());
    await frame.waitForSelector('#otp');
    await frame.click('#otp');
    seed = await browser.newPage();
    await seed.goto(`${origin}/window.html`);
    await seed.bringToFront();
    const iframeOutcome = await worker.evaluate(async ({ url, accountId }) => {
      const tab = (await chrome.tabs.query({})).find((t) => t.url === url);
      return globalThis.__popoutRunFill({ tabId: tab.id, pageUrl: url, accountId, submit: false });
    }, { url: `${pageUrl}iframe`, accountId });
    if (iframeOutcome !== 'filled' || !/^\d{6}$/.test(await frame.$eval('#otp', (el) => el.value))) {
      problems.push('포커스를 잃은 iframe의 코드 입력칸에 넣지 못함');
    }
    await frame.$eval('#otp', (el) => { el.value = ''; el.focus(); });
    await page.evaluate(() => { document.body.tabIndex = -1; document.body.focus(); });
    await seed.bringToFront();
    await worker.evaluate(async ({ url, accountId }) => {
      const tab = (await chrome.tabs.query({})).find((t) => t.url === url);
      return globalThis.__popoutRunFill({ tabId: tab.id, pageUrl: url, accountId, submit: false });
    }, { url: `${pageUrl}iframe`, accountId });
    if (await frame.$eval('#otp', (el) => el.value) !== '' ||
        !/^\d{6}$/.test(await page.$eval('#top-otp', (el) => el.value))) {
      problems.push('이전에 썼던 비활성 iframe 입력칸을 선택함');
    }

    const movedFrame = await worker.evaluate(async ({ url, accountId }) => {
      const tab = (await chrome.tabs.query({})).find((t) => t.url === url);
      const frames = await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, func: () => location.href });
      const child = frames.find((f) => f.frameId !== 0);
      try {
        await globalThis.__popoutRunFill({ tabId: tab.id, frameId: child.frameId, pageUrl: url + '-old', accountId });
        return 'accepted';
      } catch (error) { return error.message; }
    }, { url: `${pageUrl}iframe`, accountId });
    if (movedFrame !== 'codeProtection.targetChanged') problems.push('우클릭 당시와 URL이 다른 프레임을 허용함');
    await seed.close(); seed = undefined;

    // 주기 끝에서 새 코드를 기다리는 동안 이동한 새 문서에는 넣지 않는다.
    await page.goto(`${pageUrl}navigation-before`);
    await page.bringToFront();
    await page.evaluate(FOCUS.single);
    await worker.evaluate(() => { globalThis.__realNow = Date.now; Date.now = () => 59000; });
    try {
      const pending = worker.evaluate(async ({ url, accountId }) => {
        const tab = (await chrome.tabs.query({})).find((t) => t.url === url);
        try {
          return await globalThis.__popoutRunFill({ tabId: tab.id, pageUrl: url, accountId, submit: false });
        } catch (error) { return error.message; }
      }, { url: `${pageUrl}navigation-before`, accountId });
      await new Promise((resolve) => setTimeout(resolve, 300));
      await page.goto(`${pageUrl}navigation-after`);
      await page.evaluate(FOCUS.single);
      const outcome = await pending;
      if (outcome !== 'popup.fillError.changed' || await page.evaluate(READ.single) !== '') {
        problems.push(`대기 중 이동한 페이지에 코드 넣기를 차단하지 못함: ${outcome}`);
      }
    } finally {
      await worker.evaluate(() => { Date.now = globalThis.__realNow; delete globalThis.__realNow; });
    }
  } catch (error) {
    problems.push(`fill 시나리오 예외: ${error instanceof Error ? error.message : error}`);
  } finally {
    if (seed) await seed.close().catch(() => undefined);
    if (page) await page.close().catch(() => undefined);
    if (server) await new Promise((resolve) => server.close(resolve));
  }
  return problems.concat(await runAutoSubmitScenario(session), await runSiteMatchScenario(session));
}

// 지정 사이트가 아니면 단축키는 이름만 비슷한 계정을 고르지 않고, 팝업 넣기는 확인을 받는다.
export async function runSiteMatchScenario(session) {
  const { browser, extensionId } = session;
  const problems = [];
  let server;
  let page;
  let worker;
  let windowId;
  let originalSettings;
  try {
    const target = await browser.waitForTarget(
      (t) => t.type() === 'service_worker' && t.url() === `chrome-extension://${extensionId}/bg/sw.js`,
      { timeout: 10000 },
    );
    worker = await target.worker();
    originalSettings = await worker.evaluate(async () => (await chrome.storage.local.get('settings')).settings);
    const now = Date.now();
    const base = { type: 'totp', secret: SECRET, algorithm: 'SHA-1', digits: 6, period: 30, note: '', pinned: false, createdAt: now, updatedAt: now };
    // 127.0.0.1 의 첫 칸 '127' 과 이름만 겹친다(예전에는 이름 추측으로 골랐다).
    const nameOnly = { ...base, id: randomUUID(), issuer: '127 Example', label: 'name@example.test', matchHosts: [] };
    const elsewhere = { ...base, id: randomUUID(), issuer: 'Example', label: 'other@example.test', matchHosts: ['example.test'] };
    const vault = await makeNoneVault([nameOnly, elsewhere]);
    await worker.evaluate(async (v) => {
      const { settings = {} } = await chrome.storage.local.get('settings');
      await chrome.storage.local.set({ vault: v, codeProtection: false, settings: { ...settings, autoSubmit: true, syncEnabled: false, clockCheck: false } });
    }, vault);
    server = http.createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end('<!doctype html><form><label>OTP <input id="otp" autocomplete="one-time-code" maxlength="6"></label><button type="submit">Verify</button></form>'
        + '<script>window.otpTest={submits:0};document.querySelector("form").addEventListener("submit",(e)=>{e.preventDefault();window.otpTest.submits++;});</script>');
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const pageUrl = `http://127.0.0.1:${server.address().port}/`;
    page = await browser.newPage();
    await page.goto(pageUrl, { waitUntil: 'load' });
    await page.bringToFront();
    await page.focus('#otp');

    // (a) 단축키처럼 계정 없이: 이름만 맞는 계정에는 넣지 않고 넘긴다(시험에서는 팝업 대신 페이지 안내).
    const shortcut = await worker.evaluate(async (url) => {
      const original = chrome.action.openPopup;
      chrome.action.openPopup = async () => { throw new Error('test: no popup'); };
      try {
        const [tab] = await chrome.tabs.query({ url });
        return await globalThis.__popoutRunFill({ tabId: tab.id, pageUrl: url, windowId: tab.windowId });
      } catch (error) { return error.message; } finally { chrome.action.openPopup = original; }
    }, pageUrl);
    if (shortcut !== 'handed-over' || await page.$eval('#otp', (el) => el.value) !== '') {
      problems.push(`이름만 맞는 사이트에 단축키로 넣음: ${shortcut}`);
    }

    // (b) 팝업 넣기: 지정 사이트가 아니면 확인을 돌려주고, '이번만 넣기'는 넣되 자동 제출하지 않는다.
    windowId = await worker.evaluate(async (url) =>
      (await chrome.windows.create({ url, type: 'popup', focused: false, width: 400, height: 640 })).id,
    `chrome-extension://${extensionId}/window.html`);
    const uiTarget = await browser.waitForTarget((t) => t.url() === `chrome-extension://${extensionId}/window.html`);
    const ui = await uiTarget.page() ?? await uiTarget.asPage();
    await page.focus('#otp');
    const send = (extra) => ui.evaluate((message) => chrome.runtime.sendMessage(message),
      { type: 'fill-code', accountId: elsewhere.id, submit: true, ...extra });
    const refused = await send({});
    if (refused?.ok !== false || refused.mismatch?.host !== '127.0.0.1' || await page.$eval('#otp', (el) => el.value) !== '') {
      problems.push(`지정 사이트가 아닌 팝업 넣기가 확인을 돌려주지 않음: ${JSON.stringify(refused)}`);
    }
    // 확인한 호스트와 다른 곳(다른 탭으로 옮긴 경우)에는 넣지 않는다.
    const otherHost = await send({ allowSiteMismatch: 'other.example' });
    if (otherHost?.mismatch?.host !== '127.0.0.1' || await page.$eval('#otp', (el) => el.value) !== '') {
      problems.push(`다른 호스트 확인으로 넣음: ${JSON.stringify(otherHost)}`);
    }
    const once = await send({ allowSiteMismatch: '127.0.0.1' });
    const actual = await page.evaluate(() => ({ code: document.getElementById('otp').value, submits: window.otpTest.submits }));
    if (once?.outcome !== 'filled' || !/^\d{6}$/.test(actual.code) || actual.submits !== 0) {
      problems.push(`이번만 넣기 결과가 다름: ${JSON.stringify(once)} ${JSON.stringify(actual)}`);
    }
  } catch (error) {
    problems.push(`지정 사이트 시나리오 예외: ${error instanceof Error ? error.message : error}`);
  } finally {
    if (worker && windowId !== undefined) await worker.evaluate((id) => chrome.windows.remove(id), windowId).catch(() => undefined);
    if (worker) await worker.evaluate((settings) => settings === undefined
      ? chrome.storage.local.remove('settings') : chrome.storage.local.set({ settings }), originalSettings).catch(() => undefined);
    if (page) await page.close().catch(() => undefined);
    if (server) await new Promise((resolve) => server.close(resolve));
  }
  return problems;
}

// 자동 확인은 OTP 전용 폼의 단일 제출 단추에만, 사용자 넣기에서만 한 번 실행한다.
// 별도 export로 이번 변경의 경로만 좁게 실행할 수도 있다.
export async function runAutoSubmitScenario(session) {
  const { browser, extensionId } = session;
  const problems = [];
  let server;
  let page;
  let worker;
  let originalSettings;
  try {
    const target = await browser.waitForTarget(
      (t) => t.type() === 'service_worker' && t.url() === `chrome-extension://${extensionId}/bg/sw.js`,
      { timeout: 10000 },
    );
    worker = await target.worker();
    originalSettings = await worker.evaluate(async () => (await chrome.storage.local.get('settings')).settings);
    const now = Date.now();
    const accountId = randomUUID();
    const vault = await makeNoneVault([{
      id: accountId, type: 'totp', issuer: 'Example', label: 'auto-submit@example.test',
      secret: SECRET, algorithm: 'SHA-1', digits: 6, period: 30, note: '', pinned: false,
      matchHosts: ['127.0.0.1'], createdAt: now, updatedAt: now,
    }]);
    await worker.evaluate((v) => chrome.storage.local.set({ vault: v, codeProtection: false }), vault);
    server = http.createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end('<!doctype html><html><head><title>OTP auto-submit test</title></head><body></body></html>');
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const pageUrl = `http://127.0.0.1:${server.address().port}/`;
    page = await browser.newPage();
    page.on('pageerror', (err) => problems.push(`auto-submit pageerror: ${err.message}`));
    await page.goto(pageUrl, { waitUntil: 'load' });

    const cases = [
      { name: 'OTP 전용 폼', enabled: true, submits: 1, clicks: 1 },
      { name: '설정 끔', enabled: false, submits: 0, clicks: 0 },
      { name: '복사할 때 넣기', enabled: true, submit: false, submits: 0, clicks: 0 },
      { name: '다른 입력 포함', enabled: true, mixed: true, submits: 0, clicks: 0 },
      { name: '제출 단추 여럿', enabled: true, multiple: true, submits: 0, clicks: 0 },
      { name: '사이트가 먼저 제출', enabled: true, siteSubmit: true, submits: 1, clicks: 0 },
    ];
    for (const scenario of cases) {
      await worker.evaluate(async (enabled) => {
        const { settings = {} } = await chrome.storage.local.get('settings');
        await chrome.storage.local.set({ settings: { ...settings, autoSubmit: enabled, syncEnabled: false, clockCheck: false } });
      }, scenario.enabled);
      await page.bringToFront();
      await page.waitForFunction(() => document.hasFocus(), { timeout: 5000 });
      await page.evaluate(({ mixed, multiple, siteSubmit }) => {
        document.body.innerHTML = '<form id="otp-form"><label>OTP <input id="otp" autocomplete="one-time-code" maxlength="6"></label>'
          + (mixed ? '<label>Name <input id="name"></label>' : '')
          + '<button type="submit">Verify</button>'
          + (multiple ? '<button type="submit">Continue</button>' : '') + '</form>';
        window.otpTest = { submits: 0, clicks: 0 };
        const form = document.querySelector('form');
        form.addEventListener('submit', (event) => { event.preventDefault(); window.otpTest.submits++; });
        for (const button of form.querySelectorAll('button')) {
          button.addEventListener('click', () => window.otpTest.clicks++);
        }
        const input = document.getElementById('otp');
        if (siteSubmit) {
          let didSubmit = false;
          input.addEventListener('input', () => {
            if (!didSubmit && /^\d{6}$/.test(input.value)) {
              didSubmit = true;
              form.requestSubmit();
            }
          });
        }
        input.focus();
      }, scenario);
      const before = totp(SECRET, Date.now());
      const outcome = await worker.evaluate(async ({ url, accountId, submit }) => {
        const [tab] = await chrome.tabs.query({ url });
        return globalThis.__popoutRunFill({ tabId: tab.id, pageUrl: url, windowId: tab.windowId, accountId, submit });
      }, { url: pageUrl, accountId, submit: scenario.submit });
      const after = totp(SECRET, Date.now());
      const actual = await page.evaluate(() => ({ ...window.otpTest, code: document.getElementById('otp').value }));
      if (outcome !== 'filled') problems.push(`${scenario.name}: filled 대신 ${outcome}`);
      if (actual.code !== before && actual.code !== after) problems.push(`${scenario.name}: OTP가 입력되지 않음`);
      if (actual.submits !== scenario.submits || actual.clicks !== scenario.clicks) {
        problems.push(`${scenario.name}: 제출 ${actual.submits}, 클릭 ${actual.clicks}; 기대 ${scenario.submits}/${scenario.clicks}`);
      }
    }
  } catch (error) {
    problems.push(`auto-submit 시나리오 예외: ${error instanceof Error ? error.message : error}`);
  } finally {
    if (worker) await worker.evaluate((settings) => settings === undefined
      ? chrome.storage.local.remove('settings') : chrome.storage.local.set({ settings }), originalSettings).catch(() => undefined);
    if (page) await page.close().catch(() => undefined);
    if (server) await new Promise((resolve) => server.close(resolve));
  }
  return problems;
}

// 복사 뒤 클립보드 지우기: 시험 사본 manifest 에만 clipboardRead 를 준다(제품은 선택 권한).
export async function runClipboardScenario(session) {
  const { browser, extensionId } = session;
  const origin = `chrome-extension://${extensionId}`;
  const problems = [];
  let page;
  try {
    await browser.defaultBrowserContext().overridePermissions(origin, ['clipboard-read', 'clipboard-write', 'clipboard-sanitized-write']);
    page = await browser.newPage();
    await page.goto(`${origin}/manage.html`, { waitUntil: 'load' });
    await page.bringToFront();
    await page.waitForFunction(() => document.hasFocus(), { timeout: 5000 });
    await page.evaluate(async () => {
      await chrome.storage.session.set({ clipboardClearDelayMs: 500 });
      await navigator.clipboard.writeText('123456');
      await chrome.runtime.sendMessage({ type: 'clipboard-copied', code: '123456' });
    });
    await new Promise((resolve) => setTimeout(resolve, 2500));
    const after = await page.evaluate(() => navigator.clipboard.readText());
    if (after === '123456') problems.push('줄인 시간 뒤에도 클립보드에 코드가 남아 있음');
    await page.evaluate(() => chrome.storage.session.remove('clipboardClearDelayMs'));
  } catch (error) {
    problems.push(`클립보드 시나리오 오류: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    if (page) await page.close().catch(() => undefined);
  }
  return problems;
}
