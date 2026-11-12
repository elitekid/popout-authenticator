import { focusPage, sizePage } from './browser.mjs';
// 칸 옆 넣기: 사이트와 스위치를 저장할 때 함께 반영, 저장 전 취소, 실제 입력과 끄기 정리.
import { randomUUID } from 'node:crypto';
import http from 'node:http';
import { makeNoneVault, totp } from './vault-fixture.mjs';

const SECRET = Buffer.from('48656c6c6f21deadbeef', 'hex'); // JBSWY3DPEHPK3PXP
const PAGE = '<!doctype html><meta charset="utf-8"><title>fake OTP login</title>' +
  '<form id="kc-otp-login-form"><label for="otp">One-time code</label>' +
  '<input id="otp" name="otp" autocomplete="off" type="text">' +
  '<input id="kc-login" name="login" type="submit" value="Sign In"></form>' +
  '<script>window.submissions=0;document.querySelector("form").onsubmit=e=>{e.preventDefault();window.submissions++;}</script>';

export async function runFieldButtonScenario(session) {
  const { browser, extensionId } = session;
  const origin = session.baseUrl ?? `chrome-extension://${extensionId}`;
  const problems = [];
  let server;
  let manage;
  let page;
  let seed;
  let allowedPage;
  let permissionPage;
  let popup;
  let detached;
  let detachedWindowId;
  let stage = '가짜 자료 준비';
  const unexpectedTargets = [];
  const onNewTarget = (target) => {
    if (target.type() === 'page') unexpectedTargets.push(target);
  };

  const registered = (p) =>
    p.evaluate(async () =>
      (await chrome.scripting.getRegisteredContentScripts()).some((s) => s.id === 'otp-field'),
    );

  try {
    const now = Date.now();
    const account = {
      id: randomUUID(),
      type: 'totp',
      issuer: 'Example',
      label: 'example@example.test',
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
    const vault = await makeNoneVault([account]);
    seed = await browser.newPage();
    await seed.goto(`${origin}/manage.html`, { waitUntil: session.navigationWait ?? 'load' });
    await seed.evaluate(async (v) => {
      await chrome.storage.local.remove(['fieldButtons', 'autoFieldButtons']);
      const { settings = {} } = await chrome.storage.local.get('settings');
      await chrome.storage.local.set({ vault: v, settings: { ...settings, language: 'ko' } });
    }, vault);
    await seed.close();
    seed = undefined;

    server = http.createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(PAGE);
    });
    // localhost 도 같은 포트로 열리게 기본(이중 스택) 주소에 연다.
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;

    // 등록 전부터 열린 사내 로그인 화면에도 새로고침 없이 반영되어야 한다.
    page = await browser.newPage();
    page.on('pageerror', (err) => problems.push(`field-button 페이지 pageerror: ${err.message}`));
    await page.goto(`http://127.0.0.1:${port}/realms/fake/login-actions/authenticate`, { waitUntil: session.navigationWait ?? 'load' });
    if (await page.$('popout-otp-button')) problems.push('직접 지정하기 전에 단추가 보임');

    stage = '사이트 등록·취소·저장';
    // 1. 새 사이트를 적고 켜도 저장 전에는 등록되지 않고, 취소하면 초안만 사라진다.
    manage = await browser.newPage();
    manage.on('pageerror', (err) => problems.push(`field-button manage pageerror: ${err.message}`));
    await manage.goto(`${origin}/manage.html#accounts`, { waitUntil: session.navigationWait ?? 'load' });
    await focusPage(manage);
    await manage.waitForSelector('[data-role="account-row"]', { timeout: 10000 });
    await manage.click('[data-role="account-row"]');
    await manage.waitForSelector('[data-role="field-button"]:not(:disabled)', { timeout: 5000 });
    await manage.type('[data-role="hosts"]', `http://127.0.0.1:${port}/realms/fake/login-actions/authenticate`);
    await manage.click('[data-role="field-button"]');
    if (await registered(manage)) problems.push('저장 전 스위치만 켰는데 페이지 스크립트가 등록됨');
    await manage.click('[data-role="back"]');
    await manage.click('[data-role="account-row"]');
    await manage.waitForSelector('[data-role="field-button"]:not(:disabled)');
    if (await manage.$eval('[data-role="hosts"]', el => el.value) !== '') problems.push('취소한 사이트 초안이 저장됨');
    await manage.type('[data-role="hosts"]', `http://127.0.0.1:${port}/realms/fake/login-actions/authenticate`);
    await manage.click('[data-role="field-button"]');
    await manage.click('[data-role="save"]');
    await manage.waitForSelector('[data-role="account-row"]');
    await manage.click('[data-role="account-row"]');
    await manage.waitForSelector('[data-role="field-button"]:not(:disabled)');
    if (await manage.$eval('[data-role="hosts"]', el => el.value) !== '127.0.0.1') problems.push('다시 편집하면 저장한 사이트가 사라짐');
    if (!await manage.$eval('[data-role="field-button"]', el => el.checked)) problems.push('저장한 사이트의 스위치가 꺼져 있음');
    try {
      await manage.waitForFunction(
        async () =>
          (await chrome.scripting.getRegisteredContentScripts()).some((s) => s.id === 'otp-field'),
        { timeout: 10000 },
      );
    } catch {
      problems.push('스위치를 켠 뒤에도 otp-field 등록이 생기지 않음');
      return problems;
    }

    stage = '기존 페이지 단추·코드 입력';
    // 2. 이미 열린 허락한 사이트에 단추가 뜨고, 눌러서 넣는다.
    await focusPage(page);
    let button;
    try {
      button = await page.waitForSelector('popout-otp-button', { timeout: 10000 });
    } catch {
      problems.push('허락한 사이트에 popout-otp-button 이 뜨지 않음');
      return problems;
    }
    const box = await button.boundingBox();
    if (!box) {
      problems.push('popout-otp-button 의 자리를 얻지 못함');
      return problems;
    }
    const before = totp(SECRET, Date.now());
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

    // 3. 지금 코드 또는 다음 코드가 칸에 들어간다.
    try {
      await page.waitForFunction(
        (a, b) => {
          const v = document.getElementById('otp').value;
          return v === a || v === b;
        },
        { timeout: 15000 },
        before,
        totp(SECRET, Date.now() + 30000),
      );
    } catch {
      const value = await page.evaluate(() => document.getElementById('otp').value);
      problems.push(`단추를 눌러도 코드가 들어가지 않음(값 '${value}', 기대 ${before} 또는 다음 코드)`);
    }
    await page.waitForFunction(() => window.submissions === 1);

    // 직접 만든 폼: 연결된 라벨만 OTP를 나타내거나 OTP가 password 타입이어도 인식한다.
    // 일반 비밀번호 칸에는 단추가 없어야 한다.
    for (const type of ['text', 'password']) {
      stage = `${type} 라벨 OTP 입력`;
      const previousButton = await page.$('popout-otp-button');
      await page.evaluate((type) => {
        document.body.innerHTML = '<form id="custom"><label for="challenge">One-time code</label>' +
          `<input id="challenge" type="${type}"><button type="submit">Sign In</button></form>` +
          '<form><label for="normal-password">Password</label><input id="normal-password" name="password" type="password"></form>';
        window.submissions = 0;
        document.getElementById('custom').onsubmit = (e) => { e.preventDefault(); window.submissions++; };
      }, type);
      await page.waitForFunction((el) => !el.isConnected, {}, previousButton);
      await previousButton.dispose();
      await page.waitForSelector('popout-otp-button');
      const count = await page.$$eval('popout-otp-button', els => els.length);
      if (count !== 1) problems.push(`${type}: OTP 단추가 하나가 아님(${count})`);
      const rect = await (await page.$('popout-otp-button')).boundingBox();
      await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2);
      await page.waitForFunction(() => /^\d{6}$/.test(document.getElementById('challenge').value));
      await page.waitForFunction(() => window.submissions === 1);
      if (await page.$eval('#normal-password', el => el.value) !== '') problems.push('일반 비밀번호 칸에 코드가 들어감');
    }
    allowedPage = page;
    page = undefined;

    stage = '미허용 사이트';
    // 4. 허락하지 않은 사이트(localhost)에는 단추가 없다.
    page = await browser.newPage();
    await page.goto(`http://localhost:${port}/`, { waitUntil: session.navigationWait ?? 'load' });
    await new Promise((resolve) => setTimeout(resolve, 1500));
    if (await page.$('popout-otp-button')) problems.push('허락하지 않은 localhost 에 단추가 뜸');
    await page.close();
    page = undefined;

    stage = '끄기·저장 실패·다시 켜기';
    // 5. 끄기를 취소하면 유지되고, 끄기를 저장하면 등록과 열린 페이지 단추가 사라진다.
    await focusPage(manage);
    await manage.click('[data-role="field-button"]');
    await manage.click('[data-role="back"]');
    if (!await registered(manage)) problems.push('끄기 초안을 취소했는데 등록이 사라짐');
    await manage.click('[data-role="account-row"]');
    await manage.waitForSelector('[data-role="field-button"]:not(:disabled)');
    await manage.click('[data-role="field-button"]');
    await manage.evaluate(() => {
      const original = chrome.storage.local.set.bind(chrome.storage.local);
      globalThis.originalFieldStorageSet = original;
      chrome.storage.local.set = async (value) => {
        if ('fieldButtons' in value) throw new Error('fake field setting failure');
        return original(value);
      };
    });
    await manage.click('[data-role="save"]');
    await manage.waitForSelector('[data-role="form-error"]');
    if (!await manage.$('[data-role="hosts"]')) problems.push('단추 설정 저장이 실패했는데 편집 화면이 닫힘');
    await manage.evaluate(() => { chrome.storage.local.set = globalThis.originalFieldStorageSet; });
    await manage.click('[data-role="save"]');
    await manage.waitForSelector('[data-role="account-row"]');
    try {
      await manage.waitForFunction(
        async () =>
          !(await chrome.scripting.getRegisteredContentScripts()).some((s) => s.id === 'otp-field'),
        { timeout: 10000 },
      );
    } catch {
      problems.push('스위치를 끈 뒤에도 otp-field 등록이 남아 있음');
    }
    if (await registered(manage)) problems.push('끈 뒤 등록이 아직 남아 있음');
    await allowedPage.waitForFunction(() => !document.querySelector('popout-otp-button'));

    // 다시 켜도 이미 열린 페이지에 즉시 돌아오고 단추가 중복되지 않는다.
    await manage.click('[data-role="account-row"]');
    await manage.waitForSelector('[data-role="field-button"]:not(:disabled)');
    await manage.click('[data-role="field-button"]');
    await manage.click('[data-role="save"]');
    await manage.waitForSelector('[data-role="account-row"]');
    await allowedPage.waitForSelector('popout-otp-button');
    if (await allowedPage.$$eval('popout-otp-button', els => els.length) !== 1) problems.push('다시 켠 뒤 단추가 중복됨');

    stage = '속성 변경 부착·제거';
    // 같은 input 의 속성만 바뀌어도(노드 추가·제거 없이) 단추가 붙고 떨어진다.
    // 뒤 탭에서는 raf 확인이 돌지 않아 앞으로 가져오고, 시간 간격으로 확인한다.
    await focusPage(allowedPage);
    // 페이지 안에서 시간 간격으로 센다(waitForFunction 확인이 이 단계에서 불안정했다).
    const buttonCount = async (n) => {
      const ok = await allowedPage.evaluate(async (want) => {
        for (let i = 0; i < 50; i++) {
          if (document.querySelectorAll('popout-otp-button').length === want) return true;
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        return false;
      }, n);
      if (!ok) throw new Error(`단추 ${n}개가 되지 않음`);
    };
    await allowedPage.evaluate(() => {
      document.body.innerHTML = '<form><input id="attr" type="text" name="username"></form>';
    });
    await buttonCount(0);
    await new Promise((resolve) => setTimeout(resolve, 700));
    if (await allowedPage.$('popout-otp-button')) problems.push('OTP 가 아닌 칸에 단추가 붙음');
    await allowedPage.evaluate(() => {
      const input = document.getElementById('attr');
      input.setAttribute('name', 'otp');
      input.setAttribute('autocomplete', 'one-time-code');
    });
    try {
      await buttonCount(1);
      await allowedPage.evaluate(() => { document.getElementById('attr').disabled = true; });
      await buttonCount(0);
    } catch {
      problems.push('속성 변경만으로 단추가 붙거나 떨어지지 않음');
    }
    // 원래 OTP 칸으로 되돌리고, 다음 단계는 관리 화면에서 이어 간다.
    await allowedPage.reload({ waitUntil: 'load' });
    await allowedPage.waitForSelector('popout-otp-button', { timeout: 10000 });
    await focusPage(manage);

    stage = '예전 사이트 설정 복구';
    // 이전 버그로 단추 설정에만 남은 사이트는 편집 초안에 복구하고, 저장해야 계정에도 반영한다.
    await manage.evaluate(async ({ v, id }) => {
      await chrome.storage.local.set({ vault: v, fieldButtons: { [id]: ['127.0.0.1'] } });
    }, { v: vault, id: account.id });
    await manage.reload({ waitUntil: session.navigationWait ?? 'load' });
    await manage.waitForSelector('[data-role="account-row"]');
    await manage.click('[data-role="account-row"]');
    await manage.waitForSelector('[data-role="field-button"]:not(:disabled)');
    if (await manage.$eval('[data-role="hosts"]', el => el.value) !== '127.0.0.1') problems.push('기존 단추 설정에만 남은 사이트가 편집에 복구되지 않음');
    await manage.click('[data-role="save"]');
    await manage.waitForSelector('[data-role="account-row"]');
    await manage.click('[data-role="account-row"]');
    await manage.waitForSelector('[data-role="field-button"]:not(:disabled)');
    if (await manage.$eval('[data-role="hosts"]', el => el.value) !== '127.0.0.1') problems.push('복구한 사이트가 저장되지 않음');

    stage = '권한 작업창 거절·재시도';
    // 팝업에서 보낸 권한 작업창은 켜기 의도를 유지한다. 재토글 없이 저장으로 권한을 요청한다.
    await manage.evaluate(async (v) => {
      await chrome.storage.local.set({ vault: v, fieldButtons: {} });
    }, await makeNoneVault([{ ...account, matchHosts: ['127.0.0.1'] }]));
    permissionPage = await browser.newPage();
    const permissionUrl = `${origin}/manage.html?compact=1&edit=${account.id}&field=1#accounts`;
    await permissionPage.goto(permissionUrl, { waitUntil: session.navigationWait ?? 'load' });
    await permissionPage.waitForSelector('[data-role="field-button"]:not(:disabled)');
    if (!await permissionPage.$eval('[data-role="field-button"]', el => el.checked)) problems.push('권한 작업창에서 켜기 초안이 사라짐');
    await permissionPage.evaluate(() => { chrome.permissions.request = async () => false; });
    await permissionPage.click('[data-role="save"]');
    await permissionPage.waitForSelector('[data-role="field-button-error"]');
    const deniedText = await permissionPage.$eval('[data-role="field-button-error"]', el => el.textContent);
    if (await permissionPage.$eval('[data-role="field-button"]', el => el.checked)) problems.push('권한 거절 뒤 켜짐 표시가 남음');
    await permissionPage.reload({ waitUntil: session.navigationWait ?? 'load' });
    await permissionPage.waitForSelector('[data-role="field-button"]:not(:disabled)');
    await permissionPage.click('[data-role="save"]');
    await manage.waitForFunction(async id =>
      (await chrome.storage.local.get('fieldButtons')).fieldButtons?.[id]?.includes('127.0.0.1'), {}, account.id);
    await allowedPage.waitForSelector('popout-otp-button');

    stage = '별도 창 열기';
    // 별도 창을 열어 둬도 popup.html의 편집·권한 요청은 저장한 문서에서 끝낸다.
    await manage.evaluate(() => chrome.storage.local.set({ fieldButtons: {} }));
    const detachedWindow = await manage.evaluate(() => chrome.windows.create({
      url: chrome.runtime.getURL('window.html'), type: 'popup', focused: false, width: 400, height: 640,
    }));
    detachedWindowId = detachedWindow.id;
    if (session.browserName === 'firefox') {
      // Firefox BiDi targets에서 확장이 만든 창이 누락된다. 같은 확장의 실제 view로 확인한다.
      await manage.waitForFunction(id => chrome.extension.getViews({ windowId: id })
        .some(view => view.document.querySelector('[data-account-id]')), {}, detachedWindowId);
    } else {
      const detachedTarget = await browser.waitForTarget(t => t.url() === `${origin}/window.html`);
      detached = await detachedTarget.page();
      await detached.waitForSelector('[data-account-id]');
    }
    stage = '별도 창 유지·현재 팝업 권한';
    popup = await browser.newPage();
    popup.on('pageerror', err => problems.push(`field-button popup pageerror: ${err.message}`));
    await popup.goto(`${origin}/popup.html`, { waitUntil: session.navigationWait ?? 'load' });
    await focusPage(popup);
    await popup.waitForSelector(`[data-account-id="${account.id}"]`);
    browser.on('targetcreated', onNewTarget);
    await popup.click(`[data-account-id="${account.id}"] [data-role="more"]`);
    await popup.click(`[data-account-id="${account.id}"] [data-role="menu-edit"]`);
    await popup.waitForSelector('[data-role="field-button"]:not(:disabled)');
    await popup.evaluate(() => {
      const request = chrome.permissions.request.bind(chrome.permissions);
      globalThis.fieldPermissionCalls = [];
      globalThis.fieldPermissionFails = true;
      chrome.permissions.request = async (permissions) => {
        globalThis.fieldPermissionCalls.push({ permissions, active: navigator.userActivation.isActive });
        if (globalThis.fieldPermissionFails) throw new Error('fake permission API failure');
        return request(permissions); // 사전 부여한 시험 권한으로 실제 API 호출도 확인한다.
      };
    });
    await popup.click('[data-role="field-button"]');
    await popup.click('[data-role="save"]');
    await popup.waitForSelector('[data-role="field-button-error"]');
    const requestError = await popup.$eval('[data-role="field-button-error"]', el => el.textContent);
    if (requestError === deniedText || !requestError.includes('사이트 접근 권한을 요청하지 못했습니다.')) {
      problems.push('권한 API 실패가 사용자 거절과 구별되지 않음');
    }
    if (await popup.$eval('[data-role="field-button"]', el => el.checked)) problems.push('권한 API 실패 뒤 스위치가 켜져 있음');
    await popup.evaluate(() => { globalThis.fieldPermissionFails = false; });
    await popup.click('[data-role="field-button"]');
    await popup.click('[data-role="save"]');
    await popup.waitForSelector('[data-role="account-editor"]', { hidden: true });
    await popup.waitForFunction(async id =>
      (await chrome.storage.local.get('fieldButtons')).fieldButtons?.[id]?.includes('127.0.0.1'), {}, account.id);
    const requests = await popup.evaluate(() => globalThis.fieldPermissionCalls);
    if (requests.length !== 2 || requests.some(r => !r.active || !r.permissions.origins.includes('*://127.0.0.1/*'))) {
      problems.push('저장 클릭의 사용자 동작 안에서 해당 사이트 권한을 요청하지 않음');
    }
    if (unexpectedTargets.length > 0) problems.push('팝업에서 저장했는데 별도 편집 창이나 탭이 열림');
    const detachedChanged = session.browserName === 'firefox'
      ? await manage.evaluate(id => {
        const view = chrome.extension.getViews({ windowId: id })[0];
        return !view || !view.location.href.endsWith('/window.html') || !!view.document.querySelector('[data-role="account-editor"]');
      }, detachedWindowId)
      : detached.url() !== `${origin}/window.html` || !!await detached.$('[data-role="account-editor"]');
    if (detachedChanged) {
      problems.push('다른 곳에 열린 별도 창이 권한 편집 화면으로 바뀜');
    }
  } catch (error) {
    problems.push(`field-button ${stage}: ${error instanceof Error ? error.message : error}`);
  } finally {
    browser.off('targetcreated', onNewTarget);
    for (const target of unexpectedTargets) await (await target.page().catch(() => null))?.close().catch(() => undefined);
    if (popup) await popup.close().catch(() => undefined);
    if (detached) await detached.close().catch(() => undefined);
    if (detachedWindowId !== undefined && manage) {
      await manage.evaluate(id => chrome.windows.remove(id), detachedWindowId).catch(() => undefined);
    }
    if (permissionPage) await permissionPage.close().catch(() => undefined);
    if (allowedPage) await allowedPage.close().catch(() => undefined);
    if (seed) await seed.close().catch(() => undefined);
    if (page) await page.close().catch(() => undefined);
    if (manage) await manage.close().catch(() => undefined);
    if (server) await new Promise((resolve) => server.close(resolve));
  }
  return problems;
}

// 알려진 서비스는 실제 사이트에 연결하지 않고 HTTPS 요청을 가짜 OTP 화면으로 대체한다.
export async function runKnownFieldScenario(session, screenshotDir) {
  const { browser, extensionId } = session;
  const origin = session.baseUrl ?? `chrome-extension://${extensionId}`;
  const problems = [];
  const pages = [];
  let manage;
  const now = Date.now();
  const fake = (id, issuer) => ({ id, issuer, label: 'fake@example.test', type: 'totp', algorithm: 'SHA-1', digits: 6, period: 30, secret: SECRET, matchHosts: [], note: '', pinned: false, createdAt: now, updatedAt: now });
  const a = fake(randomUUID(), 'GitHub');
  const manual = fake(randomUUID(), 'Manual');
  const synthetic = async (url, html = PAGE) => {
    const p = await browser.newPage();
    pages.push(p);
    p.on('pageerror', e => problems.push(`known-field pageerror: ${e.message}`));
    await p.setRequestInterception(true);
    p.on('request', r => void r.respond({ status: 200, contentType: 'text/html', body: html }));
    await p.goto(url, { waitUntil: session.navigationWait ?? 'load' });
    return p;
  };
  try {
    manage = await browser.newPage();
    pages.push(manage);
    manage.on('pageerror', e => problems.push(`known-field manage pageerror: ${e.message}`));
    await manage.goto(origin + '/manage.html', { waitUntil: session.navigationWait ?? 'load' });
    await manage.evaluate(async id => {
      await chrome.storage.local.remove('vault');
      await chrome.storage.local.set({ fieldButtons: { [id]: ['127.0.0.1'] }, autoFieldButtons: { enabled: false, accounts: {} }, settings: { language: 'ko', clockCheck: false, syncEnabled: false } });
    }, manual.id);
    await sizePage(manage, { width: 320, height: 660 });
    await manage.goto(origin + '/manage.html?compact=1&panel=field-buttons#settings', { waitUntil: session.navigationWait ?? 'load' });
    // 권한 작업 창은 해당 설정 패널을 바로 연다.
    await manage.waitForSelector('[data-role="settings-field-buttons-toggle"]:not(:disabled)', { visible: true, timeout: 10000 });
    // 거절 경로: 스위치는 꺼진 채여야 한다.
    await manage.evaluate(() => {
      globalThis.originalPermissionRequest = chrome.permissions.request.bind(chrome.permissions);
      chrome.permissions.request = async () => false;
    });
    await manage.click('[data-role="settings-field-buttons-toggle"]');
    await manage.waitForSelector('[data-role="settings-field-buttons-error"]');
    if (await manage.$eval('[data-role="settings-field-buttons-toggle"]', el => el.checked)) problems.push('권한 거절 뒤 자동 인식 스위치가 켜져 있음');
    await manage.evaluate(() => { chrome.permissions.request = globalThis.originalPermissionRequest; });
    await manage.waitForSelector('[data-role="settings-field-buttons-toggle"]:not(:disabled)', { visible: true });
    await manage.click('[data-role="settings-field-buttons-toggle"]');
    // 계정이 없는 첫 실행에도 켤 수 있고, 이후 추가한 계정이 자동 연결된다.
    await manage.waitForFunction(async () => (await chrome.storage.local.get('autoFieldButtons')).autoFieldButtons?.enabled === true);
    await manage.evaluate(v => chrome.storage.local.set({ vault: v }), await makeNoneVault([a, manual]));
    await manage.waitForFunction(async id => (await chrome.storage.local.get('autoFieldButtons')).autoFieldButtons?.accounts?.[id]?.includes('github.com'), {}, a.id);
    const patterns = await manage.evaluate(async () => (await chrome.scripting.getRegisteredContentScripts()).find(s => s.id === 'otp-field')?.matches ?? []);
    if (!patterns.includes('https://github.com/*') || patterns.includes('https://*/*') || patterns.includes('https://*.github.com/*')) problems.push('알려진 서비스 스크립트가 정확한 호스트 범위를 벗어남');
    await manage.waitForSelector('[data-role="settings-field-buttons-toggle"]:checked:not(:disabled)');
    if (screenshotDir) await manage.screenshot({ path: screenshotDir + '/known-field-settings.png' });

    const github = await synthetic('https://github.com/fake-otp');
    await github.waitForSelector('popout-otp-button');
    await focusPage(github);
    const button = await github.$('popout-otp-button');
    let box = await button.boundingBox();
    const before = totp(SECRET, Date.now());
    await github.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await github.waitForFunction((current, next) => [current, next].includes(document.getElementById('otp').value), { timeout: 15000 }, before, totp(SECRET, Date.now() + 30000));

    // 계정이 없는 알려진 서비스에는 단추를 띄우지 않는다.
    const google = await synthetic('https://accounts.google.com/fake-otp');
    await new Promise(resolve => setTimeout(resolve, 350));
    if (await google.$('popout-otp-button')) problems.push('Google 계정이 없는데 단추가 나옴');
    const subdomain = await synthetic('https://unrelated.github.com/fake-otp');
    await new Promise(resolve => setTimeout(resolve, 350));
    if (await subdomain.$('popout-otp-button')) problems.push('허용하지 않은 GitHub 하위 도메인에 자동 단추가 나옴');

    // 자동 모드에서 새 계정 추가를 반영하고, 같은 서비스 계정 둘이면 임의로 넣지 않는다.
    const b = fake(randomUUID(), 'GitHub');
    await manage.evaluate(v => chrome.storage.local.set({ vault: v }), await makeNoneVault([a, b, manual]));
    await manage.waitForFunction(async id => !!(await chrome.storage.local.get('autoFieldButtons')).autoFieldButtons?.accounts?.[id], { polling: 100 }, b.id);
    await focusPage(github);
    await github.evaluate(() => { document.getElementById('otp').value = ''; });
    box = await button.boundingBox();
    await github.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await new Promise(resolve => setTimeout(resolve, 500));
    if (await github.$eval('#otp', el => el.value) !== '') problems.push('GitHub 계정 둘 중 하나를 임의로 넣음');

    // 자동을 꺼도 직접 지정한 사이트는 보존된다.
    await focusPage(manage);
    await manage.click('[data-role="settings-field-buttons-toggle"]');
    await manage.waitForFunction(async () => (await chrome.storage.local.get('autoFieldButtons')).autoFieldButtons?.enabled === false);
    await github.waitForFunction(() => !document.querySelector('popout-otp-button'));
    const remaining = await manage.evaluate(async id => ({ hosts: (await chrome.storage.local.get('fieldButtons')).fieldButtons?.[id], matches: (await chrome.scripting.getRegisteredContentScripts()).find(s => s.id === 'otp-field')?.matches ?? [] }), manual.id);
    if (remaining.hosts?.[0] !== '127.0.0.1' || remaining.matches.includes('https://github.com/*') || !remaining.matches.includes('*://127.0.0.1/*')) problems.push('자동 끄기가 수동 설정을 지우거나 자동 등록을 남김');
  } catch (error) {
    problems.push(`known-field 시나리오 예외: ${error instanceof Error ? error.stack : error}`);
  } finally {
    for (const p of pages.reverse()) await p.close().catch(() => undefined);
  }
  return problems;
}
