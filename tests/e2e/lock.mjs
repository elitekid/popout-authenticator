// 잠금·패스키는 현재 UI 안에서 진행한다. 비밀키와 인증기는 시험용 가짜만 쓴다.
import { createHmac, randomUUID } from 'node:crypto';
import { makeNoneVault } from './vault-fixture.mjs';

const PASSWORD = 'lock-e2e-pass-1';
const SECRET = Buffer.from([0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x21, 0xde, 0xad, 0xbe, 0xef]);
const VIRTUAL_AUTHENTICATOR = {
  protocol: 'ctap2', ctap2Version: 'ctap2_1', transport: 'internal', hasResidentKey: true,
  hasUserVerification: true, isUserVerified: true, hasPrf: true, automaticPresenceSimulation: true,
};
function fakeAccount() {
  const now = Date.now();
  return { id: randomUUID(), type: 'totp', issuer: 'Lock', label: 'demo@example.com', secret: SECRET,
    algorithm: 'SHA-1', digits: 6, period: 30, note: '', pinned: false, matchHosts: ['127.0.0.1'], createdAt: now, updatedAt: now };
}
async function virtualAuthenticator(page, remember = false) {
  const cdp = await page.createCDPSession();
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', { options: VIRTUAL_AUTHENTICATOR });
  if (remember) await page.evaluate(() => {
    for (const method of ['create', 'get']) {
      const original = navigator.credentials[method].bind(navigator.credentials);
      navigator.credentials[method] = async (...args) => {
        const credential = await original(...args);
        const output = credential?.getClientExtensionResults()?.prf?.results?.first;
        if (output) window.__fakePrf = {
          credId: btoa(String.fromCharCode(...new Uint8Array(credential.rawId))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_'),
          prfOutput: [...new Uint8Array(output)],
        };
        return credential;
      };
    }
  });
}
async function seed(page, vault) {
  await page.evaluate(async (v) => {
    await chrome.storage.session.clear();
    await chrome.storage.local.clear();
    await chrome.storage.local.set({ vault: v, settings: { language: 'ko', syncEnabled: false, clockCheck: false, lockTiming: 15 } });
  }, vault);
  await page.reload();
}
function newTargets(browser, before) {
  return browser.targets().filter((target) => !before.has(target) && target.type() === 'page');
}

export async function runLockScenario({ browser, extensionId }) {
  const origin = `chrome-extension://${extensionId}`;
  const problems = [];
  const page = await browser.newPage();
  page.on('pageerror', (error) => problems.push(`lock pageerror: ${error.message}`));
  try {
    await page.goto(`${origin}/manage.html#lock`);
    await seed(page, await makeNoneVault([fakeAccount()]));
    await page.bringToFront();
    await page.waitForSelector('[data-role="lock-enable-form"]');
    await page.type('[data-role="lock-password"]', PASSWORD);
    await page.type('[data-role="lock-password2"]', PASSWORD);
    await page.click('[data-role="lock-enable"]');
    await page.waitForSelector('[data-role="recovery-step"]', { timeout: 30000 });
    const recovery = await page.$eval('[data-role="recovery-code"]', (el) => el.getAttribute('data-code'));
    if (!recovery || recovery.replace(/-/g, '').length !== 32) throw new Error('복구 코드 형식 불일치');
    await page.type('[data-role="recovery-confirm"]', recovery.toLowerCase());
    await page.click('[data-role="recovery-confirm-submit"]');
    await page.waitForSelector('[data-role="lock-state"]');
    await virtualAuthenticator(page);
    const before = new Set(browser.targets());
    await page.waitForSelector('[data-role="passkey-add"]', { visible: true });
    await page.click('[data-role="passkey-add"]');
    await page.waitForSelector('[data-role="passkey-panel-done"], [data-role="passkey-panel-error"]', { timeout: 30000 });
    if (await page.$('[data-role="passkey-panel-error"]')) throw new Error(await page.$eval('[data-role="passkey-panel-error"]', (el) => el.textContent));
    if (newTargets(browser, before).length) problems.push('패스키 등록 때 추가 페이지를 열었음');
    const lock = await page.evaluate(async () => (await chrome.storage.local.get('vault')).vault?.lock);
    if (lock !== 'password+prf') problems.push(`패스키 등록 뒤 금고 잠금 종류 불일치: ${lock}`);

    // 가상 인증기는 같은 탭에 연결되므로 같은 페이지를 기본 UI로 이동해 해제한다.
    await page.evaluate(() => chrome.storage.session.remove(['vaultKey', 'unlockedAt']));
    await page.goto(`${origin}/window.html`);
    await page.bringToFront();
    await page.waitForSelector('[data-role="unlock-passkey"]');
    await page.click('[data-role="unlock-passkey"]');
    await page.waitForSelector('[data-account-id] [data-code]', { timeout: 30000 });
    if (newTargets(browser, before).length) problems.push('패스키 잠금 해제 때 추가 페이지를 열었음');
    if (await page.$('[data-role="passkey-start"]')) problems.push('잠금 해제에 시작 단추를 한 번 더 요구함');
    if (!(await page.evaluate(async () => (await chrome.storage.session.get('vaultKey')).vaultKey))) problems.push('해제 뒤 session vaultKey 없음');
  } catch (error) {
    problems.push(`잠금 시나리오: ${error instanceof Error ? error.message : String(error)}`);
  } finally { await page.close().catch(() => undefined); }
  return problems;
}

// 기본 UI의 실제 승인 포트를 사용한다. OS 응답만 등록 때 얻은 가짜 PRF로 제어한다.
export async function runCodeAccessScenario({ browser, extensionId }) {
  const origin = `chrome-extension://${extensionId}`;
  const problems = [];
  const pages = new Set();
  const account = fakeAccount();
  const hotp = { ...fakeAccount(), type: 'hotp', issuer: 'Fake HOTP', counter: 0 };
  let server;
  let stage = '인라인 설정';
  const assert = (ok, message) => { if (!ok) problems.push(`${stage}: ${message}`); };
  const newPage = async () => { const page = await browser.newPage(); pages.add(page); return page; };
  try {
    const requester = await newPage();
    requester.on('pageerror', (error) => problems.push(`${stage} pageerror: ${error.message}`));
    await requester.goto(`${origin}/manage.html#lock`);
    await seed(requester, await makeNoneVault([account, hotp]));
    await requester.bringToFront();
    await virtualAuthenticator(requester, true);
    const setupTargets = new Set(browser.targets());
    await requester.waitForSelector('[data-role="code-access-setup-open"]');
    await requester.click('[data-role="code-access-setup-open"]');
    await requester.waitForSelector('[data-role="code-access-setup"] [data-role="lock-password"]');
    await requester.type('[data-role="lock-password"]', PASSWORD);
    await requester.type('[data-role="lock-password2"]', PASSWORD);
    await requester.click('[data-role="lock-enable"]');
    await requester.waitForSelector('[data-role="recovery-saved"]', { timeout: 30000 });
    await requester.click('[data-role="recovery-saved"]');
    await requester.click('[data-role="recovery-confirm-submit"]');
    await requester.waitForSelector('[data-role="code-access-setup-done"], [data-role="code-access-setup-error"]', { timeout: 30000 });
    if (await requester.$('[data-role="code-access-setup-error"]')) throw new Error(await requester.$eval('[data-role="code-access-setup-error"]', (el) => el.textContent));
    const proof = await requester.evaluate(() => window.__fakePrf);
    if (!proof) throw new Error('가상 인증기의 PRF 결과 없음');
    assert(newTargets(browser, setupTargets).length === 0, '설정 중 추가 페이지를 열었음');
    await requester.click('[data-role="code-access-setup-close"]');
    await requester.waitForSelector('[data-role="code-access-toggle"]');
    assert(await requester.$eval('[data-role="code-access-toggle"]', (el) => el.checked), '설정을 마쳤지만 보호가 꺼져 있음');

    stage = '자동 잠금 안 함 저장';
    await requester.waitForSelector('[data-role="lock-timing-browser-close"]', { visible: true });
    await requester.click('[data-role="lock-timing-browser-close"]');
    await requester.waitForFunction(async () => (await chrome.storage.local.get('settings')).settings.lockTiming === 'browser-close');
    await requester.reload();
    await requester.waitForSelector('[data-role="lock-timing-manual-hint"]', { visible: true });
    assert(await requester.$eval('[data-role="lock-timing-browser-close"]', (el) => el.checked), '다시 열자 자동 잠금 안 함 선택이 사라짐');
    assert(await requester.$eval('[data-role="lock-timing-browser-close"]', (el) => el.closest('label').textContent.includes('자동 잠금 안 함')), '자동 잠금 안 함 이름 불일치');
    assert(await requester.$eval('[data-role="lock-timing-manual-hint"]', (el) => el.textContent.includes('브라우저를 완전히 종료하면 잠깁니다')), '브라우저 종료 시 잠금 안내 없음');
    await requester.click('[data-role="lock-timing-15"]');
    await requester.waitForFunction(async () => (await chrome.storage.local.get('settings')).settings.lockTiming === 15);

    await requester.evaluateOnNewDocument((fake) => {
      window.__completeCount = 0;
      const connect = chrome.runtime.connect.bind(chrome.runtime);
      chrome.runtime.connect = (...args) => {
        const port = connect(...args);
        if (args[0]?.name !== 'popout-code-access-ui') return port;
        window.__approvalPort ??= port;
        const post = port.postMessage.bind(port);
        port.postMessage = (message) => {
          if (message.type === 'complete') window.__completeCount++;
          post(message);
        };
        const add = port.onMessage.addListener.bind(port.onMessage);
        port.onMessage.addListener = (listener) => add(async (message) => {
          if (message.type === 'request') {
            if (window.__ttlMs) {
              const { codeAccessRequests } = await chrome.storage.session.get('codeAccessRequests');
              const pending = codeAccessRequests[message.requestId];
              pending.expiresAt = Date.now() + window.__ttlMs;
              message.request.expiresAt = pending.expiresAt;
              await chrome.storage.session.set({ codeAccessRequests });
            }
            window.__lastRequest = message.requestId;
          }
          if (message.type === 'result') window.__lastResult = message;
          listener(message);
        });
        return port;
      };
      navigator.credentials.get = async () => new Promise((resolve) => {
        // AbortSignal을 무시하는 늦은 OS 응답도 UI가 폐기해야 한다.
        window.__releaseFakePrf = () => resolve({
          rawId: Uint8Array.from(atob(fake.credId.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)).buffer,
          getClientExtensionResults: () => ({ prf: { results: { first: new Uint8Array(fake.prfOutput).buffer } } }),
        });
      });
      navigator.clipboard.writeText = async (value) => { window.__copied = value; };
    }, proof);
    await requester.goto(`${origin}/window.html`);
    await requester.bringToFront();
    await requester.waitForSelector(`[data-account-id="${account.id}"] [data-code]`);
    stage = '평소 표시와 복사';
    await requester.click(`[data-account-id="${account.id}"] button.code`);
    await requester.waitForFunction(() => /^\d{6}$/.test(window.__copied ?? ''));
    assert(!await requester.$('[data-role="code-access"]'), '일반 복사에 기기 인증을 요구함');
    assert(await requester.evaluate(async () => (await chrome.storage.local.get('codeProtection')).codeProtection), '일반 표시·복사 때문에 보호 자체를 끔');

    const workerTarget = await browser.waitForTarget((target) => target.type() === 'service_worker' && target.url().endsWith('/bg/sw.js'));
    const worker = await workerTarget.worker();
    const http = await import('node:http');
    server = http.createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<input id="otp" autocomplete="one-time-code"><script>document.querySelector("input").focus();document.addEventListener("input",()=>window.filledAt=Date.now())</script>');
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${server.address().port}/otp`;
    const site = await newPage();
    await site.goto(url);
    // 기본 UI 이외의 확장 페이지는 승인 호스트가 될 수 없다.
    const outsider = await newPage();
    await outsider.goto(`${origin}/passkey.html?mode=use`);
    const beginFill = async (id = account.id, ttlMs) => {
      await site.$eval('#otp', (el) => { el.value = ''; el.focus(); });
      await requester.bringToFront();
      await requester.evaluate((ttl) => { window.__ttlMs = ttl; window.__releaseFakePrf = undefined; window.__lastResult = null; }, ttlMs);
      const before = new Set(browser.targets());
      const result = await worker.evaluate(async ({ url, id, requesterUrl }) => {
        const [tab] = await chrome.tabs.query({ url });
        const [context] = await chrome.runtime.getContexts({ documentUrls: [requesterUrl] });
        if (!context?.documentId) throw new Error('내부 UI의 문서 식별자 없음');
        return globalThis.__popoutRunFill(
          { tabId: tab.id, pageUrl: tab.url, windowId: tab.windowId, accountId: id },
          { id: chrome.runtime.id, url: requesterUrl, documentId: context.documentId },
        );
      }, { url: site.url(), id, requesterUrl: requester.url() });
      assert(result === 'handed-over', '코드 넣기가 기본 UI 인증으로 넘어가지 않음');
      await requester.waitForFunction(() => typeof window.__releaseFakePrf === 'function', { timeout: 15000 });
      assert(newTargets(browser, before).length === 0, '추가 승인 페이지가 열림');
      assert(!await requester.$('[data-role="code-access-confirm"]'), '자동 인증 대신 시작 단추가 나타남');
      return requester.evaluate(() => window.__lastRequest);
    };
    const approve = async () => {
      await requester.evaluate(() => window.__releaseFakePrf());
      await requester.waitForSelector('[data-role="code-access-done"], [data-role="code-access-error"]', { timeout: 15000 });
      assert(!!await requester.$('[data-role="code-access-done"]'), '승인 뒤 완료 표시 없음');
    };
    const dismiss = async () => { if (await requester.$('[data-role="code-access-cancel"]')) await requester.click('[data-role="code-access-cancel"]'); };
    const hotpCounter = () => requester.evaluate(async (id) => {
      const { vault } = await chrome.storage.local.get('vault');
      const { vaultKey } = await chrome.storage.session.get('vaultKey');
      const bytes = (value) => Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
      const key = await crypto.subtle.importKey('raw', bytes(vaultKey), 'AES-GCM', false, ['decrypt']);
      const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes(vault.iv) }, key, bytes(vault.data));
      return JSON.parse(new TextDecoder().decode(plain)).find((a) => a.id === id).counter;
    }, hotp.id);
    const setPhase = (left) => requester.evaluate(async (remaining) => {
      const now = Date.now();
      const correctionMs = 60_000 - (now % 30_000) - remaining;
      const { settings } = await chrome.storage.local.get('settings');
      await chrome.storage.local.set({ settings: { ...settings, clockCheck: true }, clock: { state: 'off', offsetMs: correctionMs, correctionMs, checkedAt: now } });
      return correctionMs;
    }, left);

    stage = '다른 발신자와 포트 거절';
    const requestId = await beginFill(hotp.id);
    const forged = { type: 'complete', requestId, ...proof };
    await requester.evaluate((message) => {
      const other = chrome.runtime.connect({ name: 'popout-code-access-ui' });
      other.postMessage(message);
      window.__otherPort = other;
    }, forged);
    const denied = await outsider.evaluate(async (message) => ({
      complete: await chrome.runtime.sendMessage(message),
      request: await chrome.runtime.sendMessage({ type: 'code-access-request', action: 'disable' }),
    }), { ...forged, type: 'code-access-complete' });
    assert(denied.complete?.ok === false && denied.request?.ok === false, '승인 호스트 이외 발신자의 일반 메시지를 허용함');
    const oldActions = await requester.evaluate(async () => Promise.all(['view', 'copy'].map((action) => chrome.runtime.sendMessage({ type: 'code-access-request', action }))));
    assert(oldActions.every((reply) => reply?.ok === false), '사용하지 않는 보기·복사 승인 경로가 남아 있음');
    assert(await hotpCounter() === 0, '다른 포트에서 HOTP 승인을 소비함');
    assert(await site.$eval('#otp', (el) => el.value) === '', '인증 전에 코드가 입력됨');
    await requester.evaluate(() => window.__otherPort.disconnect());
    await approve();
    assert(await hotpCounter() === 1, 'HOTP 승인 뒤 카운터가 1이 아님');
    assert(await site.$eval('#otp', (el) => el.value) === '996554', 'HOTP 승인 코드 불일치');
    await requester.evaluate((message) => window.__approvalPort.postMessage(message), forged);
    assert(await hotpCounter() === 1, '소비한 HOTP 승인을 다시 허용함');
    await dismiss();

    stage = 'HOTP 취소';
    await beginFill(hotp.id);
    await dismiss();
    await requester.evaluate(() => window.__releaseFakePrf());
    assert(await hotpCounter() === 1, '취소 뒤 HOTP 카운터 증가');
    assert(await site.$eval('#otp', (el) => el.value) === '', '취소 뒤 코드가 입력됨');

    stage = '문서 이동';
    await beginFill();
    await site.goto(`${url}?changed=1`);
    await requester.evaluate(() => window.__releaseFakePrf());
    await requester.waitForSelector('[data-role="code-access-error"]');
    assert(await site.$eval('#otp', (el) => el.value) === '', '이동한 문서에 코드를 입력함');
    await dismiss();

    stage = '만료 뒤 늦게 온 인증';
    await beginFill(account.id, 700);
    const beforeComplete = await requester.evaluate(() => window.__completeCount);
    await requester.waitForSelector('[data-role="code-access-error"]', { timeout: 5000 });
    await requester.evaluate(() => window.__releaseFakePrf());
    assert(await requester.evaluate(() => window.__completeCount) === beforeComplete, '만료된 PRF 결과를 BG에 전달함');
    assert(await site.$eval('#otp', (el) => el.value) === '', '만료 뒤 코드가 입력됨');
    await dismiss();

    stage = '다음 코드 대기 중 만료';
    await beginFill(account.id, 700);
    await setPhase(1300);
    await requester.evaluate(() => window.__releaseFakePrf());
    await requester.waitForSelector('[data-role="code-access-error"]', { timeout: 5000 });
    assert(await site.$eval('#otp', (el) => el.value) === '', '대기 중 만료됐지만 다음 코드를 입력함');
    await dismiss();

    stage = '다음 코드 대기 중 취소';
    const waitingId = await beginFill();
    await setPhase(1300);
    await requester.evaluate(() => window.__releaseFakePrf());
    await requester.waitForFunction(async (id) => (await chrome.storage.session.get('codeAccessRequests')).codeAccessRequests?.[id]?.processing === true, {}, waitingId);
    await dismiss();
    await requester.waitForFunction(async (id) => !(await chrome.storage.session.get('codeAccessRequests')).codeAccessRequests?.[id], {}, waitingId);
    await new Promise((resolve) => setTimeout(resolve, 2300));
    assert(await site.$eval('#otp', (el) => el.value) === '', '취소 뒤 다음 코드가 입력됨');

    stage = '인증 뒤 최신 코드';
    await beginFill();
    const correction = await setPhase(1300);
    await approve();
    const inserted = await site.evaluate(() => ({ code: document.querySelector('#otp').value, at: window.filledAt }));
    const counter = Buffer.alloc(8);
    counter.writeBigUInt64BE(BigInt(Math.floor((inserted.at + correction) / 30_000)));
    const mac = createHmac('sha1', SECRET).update(counter).digest();
    const offset = mac[mac.length - 1] & 15;
    const expected = String((mac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0');
    assert(inserted.code === expected, '인증 전의 오래된 코드를 입력함');
    await dismiss();

    stage = '입력 직전 설정 읽기 중 취소';
    const blockedId = await beginFill();
    await setPhase(15_000);
    await worker.evaluate(() => {
      const getMessage = chrome.i18n.getMessage.bind(chrome.i18n);
      const get = chrome.storage.local.get.bind(chrome.storage.local);
      let readingInputSettings = false;
      chrome.i18n.getMessage = (...args) => {
        chrome.i18n.getMessage = getMessage;
        readingInputSettings = true;
        return getMessage(...args);
      };
      chrome.storage.local.get = async (...args) => {
        if (readingInputSettings && args[0] === 'settings') {
          chrome.storage.local.get = get;
          await new Promise((resolve) => { globalThis.__resumeInjectSettings = resolve; });
        }
        return get(...args);
      };
      globalThis.__restoreInjectSettings = () => {
        chrome.i18n.getMessage = getMessage;
        chrome.storage.local.get = get;
        globalThis.__resumeInjectSettings?.();
        delete globalThis.__resumeInjectSettings;
        delete globalThis.__restoreInjectSettings;
      };
    });
    try {
      await requester.evaluate(() => window.__releaseFakePrf());
      await worker.evaluate(async () => {
        const deadline = Date.now() + 5000;
        while (!globalThis.__resumeInjectSettings && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 10));
        if (!globalThis.__resumeInjectSettings) throw new Error('입력 직전 설정 읽기 대기에 도달하지 못함');
      });
      await dismiss();
      await requester.waitForFunction(async (id) => !(await chrome.storage.session.get('codeAccessRequests')).codeAccessRequests?.[id], {}, blockedId);
      await worker.evaluate(() => globalThis.__restoreInjectSettings());
      await requester.waitForFunction((id) => window.__lastResult?.requestId === id, {}, blockedId);
      assert(await requester.evaluate(() => window.__lastResult.ok) === false, '설정 읽기 중 취소된 인증을 승인함');
      assert(await site.$eval('#otp', (el) => el.value) === '', '설정 읽기가 끝난 뒤 취소된 코드를 입력함');
    } finally {
      await worker.evaluate(() => globalThis.__restoreInjectSettings?.());
    }

    stage = '같은 화면에서 인증 끄기';
    await requester.evaluate(() => { window.__ttlMs = undefined; window.__releaseFakePrf = undefined; });
    const disable = await requester.evaluate(() => chrome.runtime.sendMessage({ type: 'code-access-request', action: 'disable' }));
    assert(disable?.ok, '인증 끄기 요청 거절');
    await requester.waitForFunction(() => typeof window.__releaseFakePrf === 'function');
    await approve();
    assert(await requester.evaluate(async () => (await chrome.storage.local.get('codeProtection')).codeProtection === false), '기기 인증으로 보호를 끄지 못함');

    stage = '인증 중 기본 UI 닫기';
    await requester.evaluate(() => chrome.storage.local.set({ codeProtection: true }));
    const closedId = await beginFill();
    await requester.close();
    pages.delete(requester);
    await worker.evaluate(async (id) => {
      const deadline = Date.now() + 3000;
      while ((await chrome.storage.session.get('codeAccessRequests')).codeAccessRequests?.[id] && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      if ((await chrome.storage.session.get('codeAccessRequests')).codeAccessRequests?.[id]) throw new Error('UI 종료 뒤 인증 요청이 남음');
    }, closedId);
    assert(await site.$eval('#otp', (el) => el.value) === '', '기본 UI를 닫은 뒤 코드가 입력됨');

    stage = '다른 창의 UI가 있어도 사이트 창의 툴바 팝업 열기';
    await outsider.close();
    pages.delete(outsider);
    const detachedUrl = `${origin}/window.html?cross-window=1`;
    const detachedWindowId = await worker.evaluate(async (url) => {
      const win = await chrome.windows.create({ url, type: 'popup', width: 400, height: 640 });
      return win.id;
    }, detachedUrl);
    const detachedTarget = await browser.waitForTarget((target) => target.url() === detachedUrl);
    const detached = await detachedTarget.page();
    if (!detached) throw new Error('시험 분리 창 페이지에 연결하지 못함');
    pages.add(detached);
    await detached.waitForSelector(`[data-account-id="${account.id}"] [data-code]`);
    await site.bringToFront();
    await site.focus('#otp');
    assert(await detached.evaluate(() => !document.hidden), '다른 브라우저 창의 UI가 보이지 않아 창 간 전달 검증 불가');
    const siteWindowId = await worker.evaluate(async (url) => (await chrome.tabs.query({ url }))[0].windowId, site.url());
    assert(detachedWindowId !== siteWindowId, '분리 UI와 시험 사이트가 같은 창에 있음');
    const beforePopup = new Set(browser.targets());
    const windowsBefore = await worker.evaluate(async () => (await chrome.windows.getAll()).length);
    const popupTarget = browser.waitForTarget((target) => !beforePopup.has(target) && target.url().startsWith(origin), { timeout: 15000 });
    const openResult = worker.evaluate(async ({ url, id }) => {
      const [tab] = await chrome.tabs.query({ url });
      // windowId를 생략해도 실제 사이트 탭의 창으로 승인 UI가 연결되어야 한다.
      return globalThis.__popoutRunFill({ tabId: tab.id, pageUrl: tab.url, accountId: id });
    }, { url: site.url(), id: account.id });
    const target = await popupTarget;
    const popup = await target.page() ?? await target.asPage();
    if (!popup) throw new Error(`기본 팝업의 페이지에 연결하지 못함: ${target.type()}`);
    pages.add(popup);
    assert(new URL(popup.url()).pathname === '/popup.html', `기본 팝업 대신 ${new URL(popup.url()).pathname}을 열었음`);
    await popup.waitForSelector('[data-role="code-access-cancel"]', { timeout: 10000 });
    assert(await popup.evaluate(async () => (await chrome.windows.getCurrent()).id) === siteWindowId, '코드 넣기를 요청한 사이트 창이 아닌 곳에 팝업을 열었음');
    assert(!await detached.$('[data-role="code-access"]'), '다른 창의 분리 UI에 인증 요청을 보냈음');
    assert(await worker.evaluate(async () => (await chrome.windows.getAll()).length) === windowsBefore, '기본 팝업 외에 별도 창을 만들었음');
    assert(newTargets(browser, beforePopup).every((item) => new URL(item.url()).pathname === '/popup.html'), '추가 패스키 페이지를 만들었음');
    assert(new URL(popup.url()).searchParams.get('approval') === '1', '외부 인증 전용 화면이 아님');
    assert(!await popup.$('[data-app="popup"]'), '외부 인증 화면에 메인 목록을 다시 그림');
    const popupClosed = new Promise((resolve) => popup.once('close', resolve));
    // headless의 실제 OS 인증 대기는 시험 UI에서 취소한다. openPopup 응답보다 먼저 끝낼 수 있다.
    await popup.$eval('[data-role="code-access-cancel"]', (el) => el.click()).catch((error) => { if (!popup.isClosed()) throw error; });
    await Promise.race([popupClosed, new Promise((_, reject) => setTimeout(() => reject(new Error('인증 취소 후 팝업이 남음')), 5000))]);
    assert(await openResult === 'handed-over', '사이트 넣기 요청을 기본 팝업으로 전달하지 못함');
    assert(await site.$eval('#otp', (el) => el.value) === '', '기본 팝업 인증을 취소했지만 코드가 입력됨');
    assert(!detached.isClosed(), '사용자가 열어 둔 분리 창을 닫음');

    // 새 인증 화면의 OS 응답만 제어해 성공·OS 취소 후 자동 닫힘을 확인한다.
    for (const outcome of ['success', 'cancel']) {
      stage = `외부 인증 ${outcome} 뒤 화면 종료`;
      await site.$eval('#otp', (el) => { el.value = ''; });
      const auth = await newPage();
      await auth.evaluateOnNewDocument((fake) => {
        navigator.credentials.get = () => new Promise((resolve, reject) => {
          window.__finishAuth = (success) => success ? resolve({
            rawId: Uint8Array.from(atob(fake.credId.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)).buffer,
            getClientExtensionResults: () => ({ prf: { results: { first: new Uint8Array(fake.prfOutput).buffer } } }),
          }) : reject(new DOMException('test cancelled', 'NotAllowedError'));
        });
      }, proof);
      await auth.goto(`${origin}/popup.html?approval=1`);
      await auth.bringToFront();
      const authResult = await worker.evaluate(async ({ url, id }) => {
        const [tab] = await chrome.tabs.query({ url });
        return globalThis.__popoutRunFill({ tabId: tab.id, pageUrl: tab.url, accountId: id });
      }, { url: site.url(), id: account.id });
      assert(authResult === 'handed-over', '외부 인증 호스트에 전달 안 됨');
      await auth.waitForFunction(() => typeof window.__finishAuth === 'function');
      assert(!await auth.$('[data-app="popup"]'), '승인 호스트에 메인 목록이 나타남');
      const closed = new Promise((resolve) => auth.once('close', resolve));
      await auth.evaluate((success) => window.__finishAuth(success), outcome === 'success').catch((error) => { if (!auth.isClosed()) throw error; });
      await Promise.race([closed, new Promise((_, reject) => setTimeout(() => reject(new Error('인증 후 화면이 남음')), 5000))]);
      assert((await site.$eval('#otp', (el) => el.value) !== '') === (outcome === 'success'), '성공/취소 뒤 코드 입력 불일치');
      assert(!detached.isClosed(), '기존 분리 창이 닫힘');
    }
  } catch (error) {
    problems.push(`${stage}: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    for (const page of pages) await page.close().catch(() => undefined);
    if (server) await new Promise((resolve) => server.close(resolve));
  }
  return problems;
}
