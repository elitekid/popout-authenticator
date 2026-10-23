import { focusPage } from './browser.mjs';
// 팝업 시나리오: 검색·복사·가리기 → 팝업 안 편집·추가·설정 이동.
import { randomUUID } from 'node:crypto';
import { makeNoneVault, totp } from './vault-fixture.mjs';

// 가짜 비밀키(Hello! 뒤 de ad be ef)와 마지막 바이트만 바꾼 변형
const BASE = [0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x21, 0xde, 0xad, 0xbe];
const secrets = {
  Alpha: Buffer.from([...BASE, 0xef]),
  Bravo: Buffer.from([...BASE, 0x01]),
  Charlie: Buffer.from([...BASE, 0x02]),
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

export async function runPopupScenario(session) {
  const { browser, extensionId } = session;
  const origin = session.baseUrl ?? `chrome-extension://${extensionId}`;
  const problems = [];
  const pages = [];
  const unexpectedTargets = [];
  const onNewTarget = (target) => {
    if (target.type() === 'page') unexpectedTargets.push(target);
  };

  try {
    // 금고 넣기: 아무 확장 페이지에서 storage 에 쓴다.
    const vault = await makeNoneVault(['Alpha', 'Bravo', 'Charlie'].map(fakeAccount));
    const seed = await browser.newPage();
    pages.push(seed);
    await seed.goto(`${origin}/manage.html`, { waitUntil: session.navigationWait ?? 'load' });
    await seed.evaluate((v) => chrome.storage.local.set({ vault: v }), vault);
    await seed.evaluate(() => chrome.storage.session.remove(['codesHidden', 'codesHiddenAt']));
    await seed.close();
    pages.pop();

    // Firefox는 시험 manifest의 clipboardRead/Write 권한을 사용한다.
    if (session.browserName !== 'firefox') {
      await browser.defaultBrowserContext().overridePermissions(origin, [
        'clipboard-read',
        'clipboard-write',
        'clipboard-sanitized-write',
      ]);
    }

    const page = await browser.newPage();
    pages.push(page);
    page.on('pageerror', (err) => problems.push(`popup pageerror: ${err.message}`));
    await page.goto(`${origin}/popup.html`, { waitUntil: session.navigationWait ?? 'load' });
    await focusPage(page);
    await page.waitForSelector('[data-account-id]', { timeout: 10000 });
    await page.waitForSelector('[data-role="search"]', { timeout: 5000 });

    const rows = await page.$$eval('[data-account-id]', (els) => els.length);
    if (rows !== 3) problems.push(`계정 줄이 3개여야 하는데 ${rows}개`);

    // 클립보드 쓰기는 문서에 포커스가 있어야 된다(헤드리스에서 다른 탭을 연 직후 흔들림).
    await focusPage(page);
    await page.waitForFunction(() => document.hasFocus(), { timeout: 5000 });
    // 'brav' 입력 후 Enter → Bravo 코드가 클립보드에
    await page.keyboard.type('brav');
    const before = Date.now();
    await page.keyboard.press('Enter');
    await page.waitForFunction(
      () => document.querySelector('.copied') !== null,
      { timeout: 5000 },
    ).catch(() => problems.push("복사 뒤 '복사됨' 표시가 안 나옴"));
    const after = Date.now();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    const expected = [totp(secrets.Bravo, before), totp(secrets.Bravo, after)];
    if (!expected.includes(copied)) {
      problems.push(`클립보드가 Bravo 코드와 다름: got ${JSON.stringify(copied)}, want one of ${expected.join('/')}`);
    }

    // Alt+Shift+H → 가리기
    await page.keyboard.down('Alt');
    await page.keyboard.down('Shift');
    await page.keyboard.press('KeyH');
    await page.keyboard.up('Shift');
    await page.keyboard.up('Alt');
    const hiddenOk = await page
      .waitForSelector('[data-app="popup"][data-codes-hidden="true"]', { timeout: 5000 })
      .then(() => true)
      .catch(() => false);
    if (!hiddenOk) {
      problems.push('Alt+Shift+H 뒤 data-codes-hidden="true" 가 안 생김');
    } else {
      const texts = await page.$$eval('button.code', (els) => els.map((el) => el.textContent));
      if (texts.length === 0 || texts.some((s) => s !== '••• •••')) {
        problems.push(`가리기 중 코드 칸 글자가 다름: ${JSON.stringify(texts)}`);
      }
      const leaked = await page.$$eval('[data-code]', (els) => els.length);
      if (leaked > 0) problems.push('가리기 중에 data-code 속성이 남아 있음');
    }

    // 아래 일반 동작은 모두 같은 팝업 안에서 끝나야 한다.
    browser.on('targetcreated', onNewTarget);
    const screen = (id) => `[data-role="popup-screen"][data-screen="${id}"]`;
    const waitScreen = (id) => page.waitForSelector(screen(id), { visible: true, timeout: 10000 });
    const backToList = async () => {
      await page.click('[data-role="popup-screen"]:not([hidden]) [data-role="screen-back"]');
      await page.waitForSelector('[data-role="popup-screen"]', { hidden: true, timeout: 10000 });
      await page.waitForSelector('[data-role="search"]', { visible: true, timeout: 10000 });
    };

    // ⋯ → 편집 → 라벨 저장 뒤 목록에 반영된다.
    const bravoId = await page.$eval('[data-account-id]', (el) => el.getAttribute('data-account-id'));
    await page.click(`[data-account-id="${bravoId}"] [data-role="more"]`);
    await page.click(`[data-account-id="${bravoId}"] [data-role="menu-edit"]`);
    await waitScreen('accounts');
    const labelField = '[data-role="account-editor"] [data-role="label"]';
    await page.waitForSelector(labelField, { visible: true, timeout: 10000 });
    await page.click(labelField, { count: 3 });
    await page.keyboard.press('Backspace');
    await page.type(labelField, 'bravo-edited@example.test');
    await page.click('[data-role="account-editor"] [data-role="save"]');
    await page.waitForSelector('[data-role="popup-screen"]', { hidden: true, timeout: 10000 });
    await page.waitForFunction(
      (id) => document.querySelector(`[data-account-id="${id}"]`)?.textContent?.includes('bravo-edited@example.test'),
      { timeout: 10000 },
      bravoId,
    );

    // + → 직접 입력. 기존 계정과 겹치지 않는 RFC 시험 씨앗만 쓴다.
    await page.click('[data-role="search"]', { count: 3 });
    await page.keyboard.press('Backspace');
    await page.click('[data-role="add-menu"]');
    await page.click('[data-role="add-account"]');
    await waitScreen('add');
    await page.waitForSelector('[data-role="tab-manual"]', { visible: true, timeout: 10000 });
    await page.click('[data-role="tab-manual"]');
    await page.type('[data-section="add"] [data-role="issuer"]', 'Delta');
    await page.type('[data-section="add"] [data-role="label"]', 'delta@example.test');
    await page.type('[data-section="add"] [data-role="secret"]', 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    await page.click('[data-role="submit-manual"]');
    await page.waitForSelector('[data-role="result"][data-added="1"]', { timeout: 10000 });
    await backToList();
    await page.waitForFunction(
      () => [...document.querySelectorAll('[data-account-id]')].some((el) => el.textContent?.includes('delta@example.test')),
      { timeout: 10000 },
    );

    // 설정의 잠금·백업·휴지통도 새 탭 없이 열리고 뒤로 돌아온다.
    await page.click('[data-role="settings-menu"]');
    await waitScreen('settings');
    for (const section of ['lock', 'backup', 'trash']) {
      await page.click(`[data-role="screen-${section}"]`);
      await waitScreen(section);
      await page.waitForSelector(`${screen(section)} [data-section="${section}"]`, {
        visible: true,
        timeout: 10000,
      });
      await page.click('[data-role="popup-screen"]:not([hidden]) [data-role="screen-back"]');
      await waitScreen('settings');
    }
    await backToList();

    // B11: 순서 저장이 실패하면 오류를 보이고 원래 순서를 지킨다.
    const rowIds = () => page.$$eval('[data-account-id]', (els) => els.map((el) => el.getAttribute('data-account-id')));
    const orderBefore = await rowIds();
    await page.evaluate(() => {
      const local = chrome.storage.local;
      window.__origSet = local.set;
      local.set = () => Promise.reject(new Error('시험용 저장 실패'));
    });
    try {
      await page.focus(`[data-account-id="${orderBefore[0]}"]`);
      await page.keyboard.down('Alt');
      await page.keyboard.press('ArrowDown');
      await page.keyboard.up('Alt');
      await page.waitForSelector('[data-role="code-access-error"]', { visible: true, timeout: 5000 })
        .catch(() => problems.push('순서 저장 실패 뒤 오류 표시(code-access-error)가 안 나옴'));
      const orderAfter = await rowIds();
      if (orderAfter.join() !== orderBefore.join()) problems.push('순서 저장 실패 뒤 원래 순서가 아님');
    } finally {
      await page.evaluate(() => {
        chrome.storage.local.set = window.__origSet;
        delete window.__origSet;
      });
    }

    // N1·N3: 업데이트 대기 버전 1.0.2 → 띠가 목록 아래에 보이고, 확인하면 다시 열어도 안 보인다.
    // 여기서는 시험이 직접 팝업을 새로 여니 새 탭 감시를 먼저 끝낸다.
    browser.off('targetcreated', onNewTarget);
    await page.evaluate(() => chrome.storage.local.set({ pendingWhatsNew: '1.0.2' }));
    const open2 = async () => {
      const p = await browser.newPage();
      pages.push(p);
      p.on('pageerror', (err) => problems.push(`popup pageerror: ${err.message}`));
      await p.goto(`${origin}/popup.html`, { waitUntil: session.navigationWait ?? 'load' });
      await focusPage(p);
      await p.waitForSelector('[data-account-id]', { timeout: 10000 });
      return p;
    };
    const closeExtra = async (p) => {
      await p.close();
      pages.splice(pages.indexOf(p), 1);
    };
    const second = await open2();
    const noteShown = await second
      .waitForSelector('[data-role="whats-new"]', { visible: true, timeout: 5000 })
      .then(() => true)
      .catch(() => false);
    if (!noteShown) {
      problems.push('업데이트 안내 띠(whats-new)가 안 보임');
    } else {
      const below = await second.evaluate(() => {
        const note = document.querySelector('[data-role="whats-new"]');
        const list = document.querySelector('.popup-list');
        return !!note && !!list && !!(list.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING);
      });
      if (!below) problems.push('업데이트 안내 띠가 계정 목록 아래에 있지 않음');
      await second.click('[data-role="whats-new-done"]');
      await second.waitForFunction(() => document.querySelector('[data-role="whats-new"]') === null, { timeout: 5000 })
        .catch(() => problems.push("'확인' 뒤에도 안내 띠가 남음"));
    }
    await closeExtra(second);
    const third = await open2();
    await new Promise((r) => setTimeout(r, 500));
    if ((await third.$('[data-role="whats-new"]')) !== null) problems.push('확인한 뒤 다시 열었는데 안내 띠가 또 보임');

    // N3: 설정의 '변경 내용' 단추가 목록을 그 자리에서 펼친다.
    await third.click('[data-role="settings-menu"]');
    await third.waitForSelector('[data-role="screen-display"]', { visible: true, timeout: 10000 });
    await third.click('[data-role="screen-display"]');
    const changesBtn = await third
      .waitForSelector('[data-role="settings-changes"]', { visible: true, timeout: 10000 })
      .catch(() => null);
    if (!changesBtn) problems.push("설정에 '변경 내용' 단추가 안 보임");
    else {
      await changesBtn.click();
      await third
        .waitForSelector('[data-role="settings-changes-list"] li', { visible: true, timeout: 5000 })
        .catch(() => problems.push("'변경 내용'을 눌러도 목록이 안 펼쳐짐"));
    }
    await closeExtra(third);
  } catch (error) {
    problems.push(`시나리오 오류: ${error instanceof Error ? error.stack : String(error)}`);
  } finally {
    browser.off('targetcreated', onNewTarget);
    if (unexpectedTargets.length > 0) {
      problems.push(`팝업 안 편집·추가·설정 이동 중 새 탭/창 ${unexpectedTargets.length}개가 열림`);
      for (const target of unexpectedTargets) {
        try {
          await (await target.page())?.close();
        } catch {
          // 이미 닫힘
        }
      }
    }
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
