// 가짜 사이트 경고: 계정 사이트를 흉내 낸 주소에서 복사·넣기 전에 경고하고, '진짜 사이트'를 고르면 기억한다.
// 시험 주소(https://githuh.com 등)는 요청을 가로채 시험 페이지로 답한다(바깥으로 나가지 않는다).
import { randomUUID } from 'node:crypto';
import { makeNoneVault, totp } from './vault-fixture.mjs';

const SECRET = Buffer.from('48656c6c6f21deadbeef', 'hex'); // JBSWY3DPEHPK3PXP
export const SITE_WARN_HOSTS = ['githuh.com', 'github-login.com', 'sub1.main.test', 'sub2.main.test'];
const SUB_SECRET = Buffer.from('12345678901234567890'); // GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ (RFC 6238 시험값)
const SENTINEL = 'sentinel-not-a-code';
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function runSiteWarnScenario(session) {
  const { browser, extensionId } = session;
  const origin = `chrome-extension://${extensionId}`;
  const problems = [];
  let page;
  let manage;
  let windowId;
  let worker;
  let step = 'start';

  try {
    const now = Date.now();
    const id = randomUUID();
    const vault = await makeNoneVault([{
      id, type: 'totp', issuer: 'GitHub', label: 'octo@example.test', secret: SECRET,
      algorithm: 'SHA-1', digits: 6, period: 30, note: '', pinned: false, matchHosts: [],
      createdAt: now, updatedAt: now,
    }]);
    manage = await browser.newPage();
    await manage.goto(`${origin}/manage.html`, { waitUntil: 'load' });
    await manage.evaluate((v) => chrome.storage.local.set({ vault: v, settings: { view: 'normal' } }).then(
      () => chrome.storage.local.remove(['siteWarnTrusted', 'siteUsage'])), vault);

    const at = (host) => `https://${host}/sign-in`;

    const target = await browser.waitForTarget(
      (t) => t.type() === 'service_worker' && t.url().endsWith('/bg/sw.js'),
      { timeout: 10000 },
    );
    worker = await target.worker();

    page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', (r) => void r.respond({ status: 200, contentType: 'text/html',
      body: '<!doctype html><title>sign in</title><input id="otp" autocomplete="one-time-code">' }));
    await page.goto(at('githuh.com'), { waitUntil: 'load' });
    await page.bringToFront();
    windowId = await worker.evaluate(async (url) =>
      (await chrome.windows.create({ url, type: 'popup', focused: false, width: 400, height: 640 })).id,
    `${origin}/window.html`);
    const uiTarget = await browser.waitForTarget((t) => t.url() === `${origin}/window.html`);
    const ui = await uiTarget.page() ?? await uiTarget.asPage();
    ui.on('pageerror', (err) => problems.push(`site-warn 창 pageerror: ${err.message}`));
    await browser.defaultBrowserContext().overridePermissions(origin, ['clipboard-read', 'clipboard-write', 'clipboard-sanitized-write']);
    const row = `[data-account-id="${id}"]`;
    await ui.waitForSelector(row, { timeout: 10000 });

    const setClipboard = (text) => ui.evaluate((value) => navigator.clipboard.writeText(value), text);
    const clipboard = () => ui.evaluate(() => navigator.clipboard.readText());
    // 클립보드가 바뀔 때까지(최대 5초) 기다린 값.
    const copiedText = async () => {
      for (let i = 0; i < 25; i++) {
        const text = await clipboard();
        if (text !== SENTINEL) return text;
        await wait(200);
      }
      return SENTINEL;
    };
    const warnKind = async () => {
      await ui.waitForSelector('[data-role="site-warn"]', { timeout: 5000 }).catch(() => undefined);
      return ui.$eval('[data-role="site-warn"]', (el) => el.dataset.kind).catch(() => null);
    };
    const copy = async () => {
      await ui.bringToFront();
      await setClipboard(SENTINEL);
      await ui.click(row);
    };

    step = '(a)';
    // (a) 흉내 낸 주소에서 복사하면 경고만 띄우고 클립보드에 쓰지 않는다. '복사하지 않기'는 그대로 둔다.
    await copy();
    if (await warnKind() !== 'typo') problems.push('githuh.com 에서 복사했는데 오타 경고가 없음');
    const focused = await ui.evaluate(() => document.activeElement?.getAttribute('data-role') ?? `${document.activeElement?.outerHTML.slice(0, 160)} hasFocus=${document.hasFocus()}`);
    if (focused !== 'site-warn-cancel') problems.push(`경고의 첫 포커스가 '복사하지 않기'가 아님: ${focused}`);
    if (await clipboard() !== SENTINEL) problems.push('경고 중인데 코드가 클립보드에 들어감');
    await ui.click('[data-role="site-warn-cancel"]');
    await wait(300);
    if (await ui.$('[data-role="site-warn"]')) problems.push('복사하지 않기 뒤에도 경고가 남음');
    if (await clipboard() !== SENTINEL) problems.push('복사하지 않기 뒤 클립보드가 바뀜');

    step = '(b)';
    // (b) '진짜 사이트입니다'를 고르면 복사하고 그 도메인을 이 계정에 기억한다.
    await copy();
    if (await warnKind() !== 'typo') problems.push('두 번째 복사에서 경고가 없음');
    await ui.click('[data-role="site-warn-confirm"]');
    const copied = await copiedText();
    const codes = [totp(SECRET, Date.now() - 30000), totp(SECRET, Date.now()), totp(SECRET, Date.now() + 30000)];
    if (!codes.includes(copied)) problems.push(`진짜 사이트를 고른 뒤 코드가 복사되지 않음: ${copied}`);
    const trusted = await manage.evaluate(async () => (await chrome.storage.local.get('siteWarnTrusted')).siteWarnTrusted);
    if (JSON.stringify(trusted) !== JSON.stringify({ 'githuh.com': [id] })) problems.push(`기억한 도메인이 다름: ${JSON.stringify(trusted)}`);
    await copy();
    if (!/^\d{6}$/.test(await copiedText())) problems.push('진짜라고 한 도메인에서 바로 복사되지 않음');
    if (await ui.$('[data-role="site-warn"]')) problems.push('진짜라고 한 도메인에서 다시 경고함');

    step = '(c)';
    // (c) 넣기: 지정 사이트가 아닌 흉내 주소면 평소 확인보다 경고를 먼저 띄우고, 진짜를 고르면 평소 확인으로 넘어간다.
    await page.goto(at('github-login.com'), { waitUntil: 'load' });
    await page.bringToFront();
    await page.focus('#otp');
    await ui.bringToFront();
    await ui.click(`${row} [data-role="more"]`);
    await ui.click('[data-role="menu-fill"]');
    if (await warnKind() !== 'lure') {
      const shown = await ui.$eval('[data-role="fill-feedback"]', (el) => el.textContent).catch(() => '(없음)');
      problems.push(`github-login.com 넣기에서 미끼 경고가 없음(넣기 안내: ${shown})`);
    }
    if (await ui.$('[data-role="mismatch"]')) problems.push('경고와 평소 확인이 함께 보임');
    const fillCancel = await ui.$eval('[data-role="site-warn-cancel"]', (el) => el.textContent).catch(() => '');
    if (!/fill|넣지/i.test(fillCancel)) problems.push(`넣기 경고의 취소 문구가 넣기용이 아님: ${fillCancel}`);
    await ui.click('[data-role="site-warn-confirm"]');
    await ui.waitForSelector('[data-role="mismatch"]', { timeout: 5000 }).catch(() => undefined);
    if (!(await ui.$('[data-role="mismatch"]'))) problems.push('진짜를 고른 뒤 평소 확인(기억·이번만)이 뜨지 않음');
    await ui.click('[data-role="mismatch-cancel"]').catch(() => undefined);
    if (await page.$eval('#otp', (el) => el.value) !== '') problems.push('취소했는데 코드가 들어감');

    step = '(d)';
    // (d) 설정에서 끄면 경고하지 않고, 보안 점검이 켜기를 권한다.
    await manage.evaluate(() => chrome.storage.local.remove('siteWarnTrusted'));
    await manage.goto(`${origin}/manage.html#settings`, { waitUntil: 'load' });
    await manage.bringToFront();
    await manage.waitForSelector('[data-role="settings-site-warn"]', { timeout: 10000 });
    if (!(await manage.$eval('[data-role="settings-site-warn"]', (el) => el.checked))) problems.push('가짜 사이트 경고가 기본으로 켜져 있지 않음');
    // 설정 화면이 막 다시 그려질 때 좌표 클릭이 떼어진 요소에 걸린다. 요소를 다시 찾아 누른다.
    await manage.$eval('[data-role="settings-site-warn"]', (el) => el.click());
    await wait(500);
    const saved = await manage.evaluate(async () => (await chrome.storage.local.get('settings')).settings?.siteWarnEnabled);
    if (saved !== false) problems.push(`스위치를 꺼도 설정이 저장되지 않음: ${saved}`);
    if (!(await manage.$('[data-role="advisor-item"][data-id="siteWarn"]'))) problems.push('경고를 껐는데 보안 점검 권고가 없음');
    await page.goto(at('githuh.com'), { waitUntil: 'load' });
    await page.bringToFront();
    await wait(300);
    await copy();
    if (!/^\d{6}$/.test(await copiedText())) problems.push('경고를 끈 뒤 바로 복사되지 않음');
    if (await ui.$('[data-role="site-warn"]')) problems.push('경고를 껐는데도 경고함');

    step = '(e)';
    // (e) 사이트 매칭: main.test 계정과 sub1.main.test 계정이 있으면 sub1 에서는 하위 계정, 다른 하위 도메인에서는 부모 계정을 고른다.
    const mainId = randomUUID();
    const subId = randomUUID();
    const base = { type: 'totp', label: 'm@example.test', algorithm: 'SHA-1', digits: 6, period: 30, note: '', pinned: false, createdAt: now, updatedAt: now };
    const matchVault = await makeNoneVault([
      { ...base, id: mainId, issuer: 'Main', secret: SECRET, matchHosts: ['main.test'] },
      { ...base, id: subId, issuer: 'Sub', secret: SUB_SECRET, matchHosts: ['sub1.main.test'] },
    ]);
    await manage.evaluate((v) => chrome.storage.local.set({ vault: v }), matchVault);
    const fillHere = async (host, secret, who) => {
      await page.goto(at(host), { waitUntil: 'load' });
      await page.bringToFront();
      await page.focus('#otp');
      const outcome = await worker.evaluate(async (url) => {
        const original = chrome.action.openPopup;
        chrome.action.openPopup = async () => { throw new Error('test: no popup'); };
        try {
          const [tab] = await chrome.tabs.query({ url });
          return await globalThis.__popoutRunFill({ tabId: tab.id, pageUrl: url, windowId: tab.windowId });
        } catch (error) { return error.message; } finally { chrome.action.openPopup = original; }
      }, at(host));
      const value = await page.$eval('#otp', (el) => el.value);
      const codes = [-30000, 0, 30000].map((d) => totp(secret, Date.now() + d));
      if (!codes.includes(value)) problems.push(`${host} 에서 ${who} 계정을 고르지 않음(${outcome}, 넣은 값 ${value || '없음'})`);
    };
    await fillHere('sub1.main.test', SUB_SECRET, '하위 도메인에 묶인');
    await fillHere('sub2.main.test', SECRET, '부모 도메인에 묶인');

    step = '(f)';
    // (f) 페이지 우클릭 '이 사이트 코드 복사': 입력칸에 넣지 않고 그 사이트 계정 코드만 복사한다. 고를 수 없으면 복사하지 않는다.
    const menuCopy = async (host) => {
      await ui.bringToFront();
      await setClipboard(SENTINEL);
      await page.goto(at(host), { waitUntil: 'load' });
      await page.bringToFront();
      await page.focus('#otp');
      const outcome = await worker.evaluate(async (url) => {
        const original = chrome.action.openPopup;
        chrome.action.openPopup = async () => { throw new Error('test: no popup'); };
        try {
          const [tab] = await chrome.tabs.query({ url });
          await globalThis.__popoutMenuClick({ menuItemId: 'quick-copy', pageUrl: url, frameId: 0, editable: false }, tab);
          return 'done';
        } catch (error) { return error.message; } finally { chrome.action.openPopup = original; }
      }, at(host));
      await ui.bringToFront();
      return { outcome, text: await copiedText(), field: await page.$eval('#otp', (el) => el.value) };
    };
    const subCopy = await menuCopy('sub1.main.test');
    const subCodes = [-30000, 0, 30000].map((d) => totp(SUB_SECRET, Date.now() + d));
    if (!subCodes.includes(subCopy.text)) problems.push(`우클릭 복사가 sub1.main.test 계정 코드를 복사하지 않음(${subCopy.outcome}, ${subCopy.text})`);
    if (subCopy.field !== '') problems.push('우클릭 복사가 입력칸에 코드를 넣음');
    const usage = await manage.evaluate(async () => (await chrome.storage.local.get('siteUsage')).siteUsage);
    if (usage?.['sub1.main.test']?.[subId]?.c !== 1) problems.push(`우클릭 복사가 사용 기록에 남지 않음: ${JSON.stringify(usage)}`);
    const none = await menuCopy('githuh.com');
    if (none.text !== SENTINEL) problems.push(`맞는 계정이 없는 사이트에서 우클릭 복사가 클립보드를 바꿈: ${none.text}`);
  } catch (error) {
    problems.push(`site-warn 시나리오 예외(${step}): ${error instanceof Error ? error.message : error}`);
  } finally {
    if (windowId !== undefined && worker) await worker.evaluate((wid) => chrome.windows.remove(wid), windowId).catch(() => undefined);
    if (manage) {
      await manage.evaluate(() => chrome.storage.local.remove(['settings', 'siteWarnTrusted', 'siteUsage'])).catch(() => undefined);
      await manage.close().catch(() => undefined);
    }
    if (page) await page.close().catch(() => undefined);
  }
  return problems;
}
