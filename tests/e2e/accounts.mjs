import fs from 'node:fs/promises';
import { focusPage, uploadFixture } from './browser.mjs';
// 계정 정리: 삭제·복원, 평소 목록 끌기·복사 뒤 순서 유지·재열기, 간결 보기 끌기.
import { randomUUID, webcrypto } from 'node:crypto';
import { makeNoneVault, totp } from './vault-fixture.mjs';

// popup.mjs 와 같은 가짜 비밀키
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

const NAMES = ['Alpha', 'Bravo', 'Charlie'];

export async function runAccountsScenario(session) {
  const { browser, extensionId } = session;
  const origin = session.baseUrl ?? `chrome-extension://${extensionId}`;
  const problems = [];
  const pages = [];

  const open = async (file, readySelector) => {
    const page = await browser.newPage();
    pages.push(page);
    page.on('pageerror', (err) => problems.push(`accounts pageerror: ${err.message}`));
    await page.goto(`${origin}/${file}`, { waitUntil: session.navigationWait ?? 'load' });
    await focusPage(page);
    await page.waitForSelector(readySelector, { timeout: 10000 });
    return page;
  };
  const close = async (page) => {
    pages.splice(pages.indexOf(page), 1);
    await page.close();
  };
  const rowIds = (page) =>
    page.$$eval('[data-account-id]', (els) =>
      els.map((el) => ({ id: el.getAttribute('data-account-id'), text: el.textContent ?? '' })),
    );

  try {
    // 시작: 가짜 계정 3개, 평소 보기
    const accounts = NAMES.map(fakeAccount);
    const vault = await makeNoneVault(accounts);
    const seed = await browser.newPage();
    pages.push(seed);
    await seed.goto(`${origin}/manage.html`, { waitUntil: session.navigationWait ?? 'load' });
    await seed.evaluate(async (v) => {
      await chrome.storage.local.remove('vault');
      await chrome.storage.local.set({ vault: v, settings: { view: 'normal', suggestionsEnabled: false } });
      await chrome.storage.session.remove(['codesHidden', 'codesHiddenAt']);
    }, vault);
    await close(seed);

    // (a) 삭제 → 휴지통 → 복원
    let popup = await open('popup.html', '[data-account-id]');
    await popup.waitForFunction(() => document.querySelectorAll('[data-account-id]').length === 3, {
      timeout: 10000,
    });
    const bravo = (await rowIds(popup)).find((r) => r.text.includes('Bravo'));
    if (!bravo) throw new Error('Bravo 줄을 못 찾음');
    // 우클릭과 ⋯는 같은 메뉴. 삭제는 편집 화면 없이 확인 후 휴지통으로 보낸다.
    const bravoRow = `[data-account-id="${bravo.id}"]`;
    const originalList = await popup.$('.popup-list');
    await popup.click(`${bravoRow} .code`, { button: 'right' });
    await popup.waitForSelector(`${bravoRow} [data-role="menu-delete"]`, { visible: true });
    if (await popup.$('.row.copied')) problems.push('우클릭이 복사로 처리됨');
    await popup.click(`${bravoRow} [data-role="menu-delete"]`);
    await popup.waitForSelector('[data-role="popup-delete"]', { visible: true });
    if (!(await popup.evaluate((list) => list === document.querySelector('.popup-list') && list.isConnected, originalList))) {
      problems.push('삭제 확인을 열 때 메인 목록 DOM이 교체됨');
    }
    if ((await rowIds(popup)).length !== 3) problems.push('삭제 확인 뒤 메인 목록이 사라짐');
    if (!(await popup.$eval('[data-role="popup-delete"]', (el) => el.textContent.includes('Bravo')))) {
      problems.push('삭제 확인에 대상 계정 이름이 없음');
    }
    await popup.click('[data-role="popup-delete-cancel"]');
    await popup.waitForSelector(bravoRow, { visible: true });
    if ((await rowIds(popup)).length !== 3) problems.push('취소했지만 계정이 삭제됨');
    if (!(await popup.$eval(`${bravoRow} [data-role="more"]`, (el) => el === document.activeElement))) {
      problems.push('삭제 취소 뒤 원래 계정으로 포커스가 돌아오지 않음');
    }
    await originalList.dispose();
    await popup.$eval(bravoRow, (el) => el.focus());
    await popup.keyboard.down('Shift');
    await popup.keyboard.press('F10');
    await popup.keyboard.up('Shift');
    await popup.waitForSelector(`${bravoRow} [data-role="menu-delete"]`, { visible: true });
    await popup.keyboard.press('ArrowDown');
    if (await popup.evaluate(() => document.activeElement?.getAttribute('data-role')) !== 'menu-next') {
      problems.push('메뉴 방향키가 다음 메뉴 항목으로 이동하지 않음');
    }
    await popup.keyboard.press('Escape');
    await popup.click(`${bravoRow} [data-role="more"]`);
    await popup.click(`${bravoRow} [data-role="menu-delete"]`);
    // 실제 저장 거절 시 계정은 남고 같은 확인창에서 재시도할 수 있어야 한다.
    await popup.evaluate(() => {
      const set = chrome.storage.local.set.bind(chrome.storage.local);
      chrome.storage.local.set = async (items) => {
        if ('vault' in items) { chrome.storage.local.set = set; throw new Error('fake save failure'); }
        return set(items);
      };
    });
    await popup.click('[data-role="popup-delete-confirm"]');
    await popup.waitForSelector('[data-role="popup-delete-error"]', { visible: true });
    await popup.click('[data-role="popup-delete-cancel"]');
    await popup.waitForSelector(bravoRow, { visible: true });
    if ((await rowIds(popup)).length !== 3) problems.push('삭제 저장 실패 뒤 목록에서 계정이 사라짐');
    await popup.click(`${bravoRow} [data-role="more"]`);
    await popup.click(`${bravoRow} [data-role="menu-delete"]`);
    await popup.click('[data-role="popup-delete-confirm"]');
    await popup
      .waitForFunction(() => document.querySelectorAll('[data-account-id]').length === 2, { timeout: 10000 })
      .catch(() => problems.push('삭제 뒤 줄이 2개가 안 됨'));
    // 한 계정 삭제 뒤에도 되돌리기 알림이 뜬다(여기서는 누르지 않고 휴지통 복원을 시험한다).
    await popup
      .waitForSelector('[data-role="undo-notice"] [data-role="undo"]', { visible: true, timeout: 5000 })
      .catch(() => problems.push('한 계정 삭제 뒤 되돌리기 알림이 안 뜸'));
    await close(popup);

    const manage = await open('manage.html#trash', '[data-section="trash"] [data-role="trash-row"]');
    await manage.click('[data-section="trash"] [data-role="restore"]');
    await manage
      .waitForSelector('[data-role="trash-empty"]', { timeout: 10000 })
      .catch(() => problems.push('복원 뒤 휴지통이 비지 않음'));
    await close(manage);

    const before = Date.now();
    popup = await open('popup.html', '[data-account-id]');
    await popup.waitForFunction(() => document.querySelectorAll('[data-account-id]').length === 3, {
      timeout: 10000,
    });
    const codeSel = `[data-account-id="${bravo.id}"] [data-code]`;
    await popup.waitForSelector(codeSel, { timeout: 10000 });
    const code = await popup.$eval(codeSel, (el) => el.getAttribute('data-code'));
    const after = Date.now();
    const expected = [totp(secrets.Bravo, before), totp(secrets.Bravo, after)];
    if (!expected.includes(code)) {
      problems.push(`복원한 Bravo 코드가 다름: got ${JSON.stringify(code)}, want one of ${expected.join('/')}`);
    }
    await close(popup);

    // (b) 편집 모드 없이 이름/코드를 잡아 Charlie 를 Alpha 위로 끌기
    popup = await open('popup.html', '.row.reorderable');
    await popup.waitForFunction(() => document.querySelectorAll('[data-account-id]').length === 3, {
      timeout: 10000,
    });
    const nameById = new Map();
    for (const r of await rowIds(popup)) {
      const name = NAMES.find((n) => r.text.includes(n));
      if (name) nameById.set(r.id, name);
    }
    const idOf = (name) => [...nameById].find(([, n]) => n === name)?.[0];
    const dragAbove = async (source, target) => {
      const from = await popup.$(source);
      const to = await popup.$(target);
      const fromBox = await from.boundingBox();
      const toBox = await to.boundingBox();
      if (!fromBox || !toBox) throw new Error('끌기 위치를 못 구함');
      const x = fromBox.x + fromBox.width / 2;
      await popup.mouse.move(x, fromBox.y + fromBox.height / 2);
      await popup.mouse.down();
      await popup.mouse.move(x, toBox.y + 2, { steps: 12 });
      await popup.mouse.up();
    };
    await dragAbove(`[data-account-id="${idOf('Charlie')}"] .code`, `[data-account-id="${idOf('Alpha')}"]`);
    await popup.waitForFunction(
      () => document.querySelector('[data-account-id]')?.textContent?.includes('Charlie'),
      { timeout: 10000 },
    );
    if (await popup.$('.row.copied')) problems.push('드래그가 코드 복사로 처리됨');

    // 뒤쪽 Alpha 를 실제로 복사해도 순서가 움직이지 않는다.
    await popup.click(`[data-account-id="${idOf('Alpha')}"] .code`);
    await popup.waitForSelector(`[data-account-id="${idOf('Alpha')}"].copied`, { timeout: 5000 });
    const copiedOrder = (await rowIds(popup)).map((r) => nameById.get(r.id));
    if (copiedOrder.join(',') !== 'Charlie,Alpha,Bravo') {
      problems.push(`복사 뒤 순서가 바뀜: ${copiedOrder.join(',')}`);
    }
    await close(popup);

    popup = await open('popup.html', '.row.reorderable');
    await popup.waitForFunction(() => document.querySelectorAll('[data-account-id]').length === 3, {
      timeout: 10000,
    });
    const order = (await rowIds(popup)).map((r) => nameById.get(r.id));
    if (order.join(',') !== 'Charlie,Alpha,Bravo') {
      problems.push(`다시 열어도 수동 순서가 유지되지 않음: ${order.join(',')}`);
    }

    // (c) 간결 보기에서도 같은 코드 줄을 잡아 순서를 바꾼다.
    await popup.evaluate(async () => {
      const got = await chrome.storage.local.get('settings');
      await chrome.storage.local.set({ settings: { ...got.settings, view: 'compact' } });
    });
    await popup.waitForSelector('.row-compact');
    await dragAbove(`[data-account-id="${idOf('Bravo')}"] .code`, `[data-account-id="${idOf('Charlie')}"]`);
    await popup.waitForFunction(
      () => document.querySelector('[data-account-id]')?.textContent?.includes('Bravo'),
      { timeout: 10000 },
    );
    const compactOrder = (await rowIds(popup)).map((r) => nameById.get(r.id));
    if (compactOrder.join(',') !== 'Bravo,Charlie,Alpha') problems.push(`간결 보기 순서가 다름: ${compactOrder.join(',')}`);
    await close(popup);

    // 금고 파일('none' 잠금)을 풀어 계정 목록을 읽는다.
    const readVault = async (page) => {
      const { vault: file } = await page.evaluate(() => chrome.storage.local.get('vault'));
      const master = Buffer.from(file.wrappedKeys[0].data, 'base64');
      const key = await webcrypto.subtle.importKey('raw', master, 'AES-GCM', false, ['decrypt']);
      const plain = await webcrypto.subtle.decrypt(
        { name: 'AES-GCM', iv: Buffer.from(file.iv, 'base64') },
        key,
        Buffer.from(file.data, 'base64'),
      );
      return JSON.parse(new TextDecoder().decode(plain));
    };
    const waitVault = async (page, ok, what) => {
      for (let i = 0; i < 50; i++) {
        const list = await readVault(page);
        if (ok(list)) return list;
        await new Promise((r) => setTimeout(r, 200));
      }
      problems.push(`금고에 반영되지 않음: ${what}`);
      return readVault(page);
    };
    const reseed = async (list) => {
      const page = await browser.newPage();
      pages.push(page);
      await page.goto(`${origin}/manage.html`, { waitUntil: session.navigationWait ?? 'load' });
      await page.evaluate(async (v) => {
        await chrome.storage.local.remove(['vault', 'popupFoldedGroups']);
        await chrome.storage.local.set({ vault: v, settings: { view: 'normal', suggestionsEnabled: false } });
      }, await makeNoneVault(list));
      await close(page);
    };
    const old = Date.now() - 100_000;
    const sample = (issuer, label, secret, group) => ({
      ...fakeAccount('Alpha'),
      issuer,
      label,
      secret,
      createdAt: old,
      updatedAt: old,
      ...(group ? { group } : {}),
    });
    const acme = () => sample('Acme Mail', 'alex@example.com', secrets.Alpha, 'Work'); // JBSWY3DPEHPK3PXP
    const wingtip = () => sample('Wingtip Cloud', 'sam@example.com', secrets.Bravo, 'Work'); // 가짜 비밀키
    const contoso = () => sample('Contoso Vault', 'kim@example.com', secrets.Charlie, 'Home');
    const byIssuer = (list, issuer) => list.find((a) => a.issuer === issuer);

    // (d) 그룹 이름 변경 → 같은 이름 안내 → 그룹 해제
    await reseed([acme(), wingtip(), contoso()]);
    popup = await open('popup.html', '[data-role="group-fold"]');
    await popup.waitForFunction(() => document.querySelectorAll('[data-role="group-fold"]').length === 2, {
      timeout: 10000,
    });
    const typeName = async (name) => {
      await popup.$eval('[data-role="group-rename-input"]', (el) => el.select());
      await popup.keyboard.type(name);
    };
    await popup.click('[data-role="group-more"]'); // 첫 그룹(Work)
    await popup.click('[data-role="group-rename"]');
    await popup.waitForSelector('[data-role="group-rename-input"]', { visible: true });
    await typeName('Team');
    await popup.keyboard.press('Enter');
    let list = await waitVault(popup, (l) => byIssuer(l, 'Acme Mail')?.group === 'Team', '그룹 이름 변경');
    if (byIssuer(list, 'Wingtip Cloud')?.group !== 'Team') problems.push('같은 그룹의 둘째 계정 이름이 안 바뀜');
    if (byIssuer(list, 'Contoso Vault')?.group !== 'Home') problems.push('다른 그룹이 바뀜');
    if (byIssuer(list, 'Contoso Vault')?.updatedAt !== old) problems.push('다른 그룹 계정의 updatedAt 이 바뀜');
    if ((byIssuer(list, 'Acme Mail')?.updatedAt ?? 0) <= old) problems.push('바뀐 계정의 updatedAt 이 갱신 안 됨');
    if (list.length !== 3) problems.push(`이름 변경 뒤 계정 수가 다름: ${list.length}`);

    // 이미 있는 이름이면 합쳐진다는 안내
    await popup.waitForFunction(
      () => [...document.querySelectorAll('.sec-name')].some((e) => e.textContent === 'Team'),
      { timeout: 10000 },
    );
    const homeIndex = await popup.$$eval('.sec-name', (els) => els.findIndex((e) => e.textContent === 'Home'));
    await (await popup.$$('[data-role="group-more"]'))[homeIndex].click();
    await popup.click('[data-role="group-rename"]');
    await popup.waitForSelector('[data-role="group-rename-input"]', { visible: true });
    await typeName('Team');
    await popup
      .waitForSelector('[data-role="group-merge-hint"]', { visible: true, timeout: 5000 })
      .catch(() => problems.push('같은 이름 그룹 합침 안내가 안 보임'));
    await popup.keyboard.press('Escape');
    if (await popup.$('[data-role="group-rename-input"]')) problems.push('Esc 로 이름 입력이 안 닫힘');
    if (byIssuer(await readVault(popup), 'Contoso Vault')?.group !== 'Home') problems.push('취소했는데 그룹이 바뀜');

    // 해제: Team 의 두 계정만 group 이 없어진다.
    const teamIndex = await popup.$$eval('.sec-name', (els) => els.findIndex((e) => e.textContent === 'Team'));
    await (await popup.$$('[data-role="group-more"]'))[teamIndex].click();
    await popup.click('[data-role="group-ungroup"]');
    list = await waitVault(popup, (l) => !byIssuer(l, 'Acme Mail')?.group, '그룹 해제');
    if (byIssuer(list, 'Wingtip Cloud')?.group) problems.push('해제 뒤 둘째 계정에 group 이 남음');
    if (byIssuer(list, 'Contoso Vault')?.group !== 'Home') problems.push('해제가 다른 그룹까지 건드림');
    // 해제 직후 되돌리기: Team 두 계정이 다시 Team 으로.
    await popup.waitForSelector('[data-role="undo"]', { visible: true, timeout: 5000 });
    await popup.click('[data-role="undo"]');
    list = await waitVault(popup, (l) => byIssuer(l, 'Acme Mail')?.group === 'Team', '그룹 해제 되돌리기');
    if (byIssuer(list, 'Wingtip Cloud')?.group !== 'Team') problems.push('해제 되돌리기 뒤 둘째 계정이 Team 이 아님');
    if (byIssuer(list, 'Contoso Vault')?.group !== 'Home') problems.push('해제 되돌리기가 다른 그룹까지 건드림');
    if (await popup.$('[data-role="undo-notice"]')) problems.push('되돌린 뒤에도 되돌리기 알림이 남음');
    await close(popup);

    // (e) 선택 모드: 3개 중 2개를 한 번에 휴지통으로
    const picks = [sample('Acme Mail', 'alex@example.com', secrets.Alpha), sample('Wingtip Cloud', 'sam@example.com', secrets.Bravo), sample('Contoso Vault', 'kim@example.com', secrets.Charlie)];
    await reseed(picks);
    popup = await open('popup.html', '[data-account-id]');
    await popup.waitForFunction(() => document.querySelectorAll('[data-account-id]').length === 3, {
      timeout: 10000,
    });
    await (await popup.waitForSelector('[data-role="select-start"]', { visible: true, timeout: 5000 })).click();
    await popup.waitForSelector('[data-role="select-count"]', { visible: true });
    // 선택 모드에서 행(코드) 클릭은 복사가 아니라 체크
    await popup.click(`[data-account-id="${picks[0].id}"] .code`);
    if (await popup.$('.row.copied')) problems.push('선택 모드에서 행 클릭이 복사로 처리됨');
    await popup.click(`[data-account-id="${picks[1].id}"] input.pick`);
    const count = await popup.$eval('[data-role="select-count"]', (el) => el.getAttribute('data-count'));
    if (count !== '2') problems.push(`선택 개수가 2가 아님: ${count}`);
    await popup.click('[data-role="select-trash"]');
    await popup.waitForSelector('[data-role="select-confirm"]', { visible: true });
    if (byIssuer(await readVault(popup), 'Acme Mail')?.deletedAt !== undefined) problems.push('확인 전에 휴지통으로 감');
    await popup.click('[data-role="select-confirm-yes"]');
    list = await waitVault(popup, (l) => l.filter((a) => a.deletedAt !== undefined).length === 2, '여러 개 휴지통');
    if (list.length !== 3) problems.push(`휴지통 이동 뒤 계정 수가 다름: ${list.length}`);
    if (byIssuer(list, 'Contoso Vault')?.deletedAt !== undefined) problems.push('고르지 않은 계정이 휴지통으로 감');
    if (byIssuer(list, 'Acme Mail')?.deletedAt === undefined || byIssuer(list, 'Wingtip Cloud')?.deletedAt === undefined) {
      problems.push('고른 계정이 휴지통에 안 감');
    }
    await popup
      .waitForFunction(() => document.querySelectorAll('[data-account-id]').length === 1, { timeout: 10000 })
      .catch(() => problems.push('휴지통 이동 뒤 목록이 1줄이 아님'));
    if (await popup.$('[data-role="select-count"]')) problems.push('휴지통 이동 뒤 선택 모드가 안 끝남');

    // 휴지통 보내기 직후 되돌리기: 두 계정이 원래 자리로.
    await popup.waitForSelector('[data-role="undo"]', { visible: true, timeout: 5000 });
    await popup.click('[data-role="undo"]');
    list = await waitVault(popup, (l) => l.every((a) => a.deletedAt === undefined), '휴지통 되돌리기');
    if (list.map((a) => a.id).join() !== picks.map((a) => a.id).join()) problems.push('휴지통 되돌리기 뒤 순서가 바뀜');
    await popup
      .waitForFunction(() => document.querySelectorAll('[data-account-id]').length === 3, { timeout: 10000 })
      .catch(() => problems.push('휴지통 되돌리기 뒤 목록이 3줄이 아님'));

    // (f) 여러 계정을 한 번에 새 그룹으로 옮기고 되돌리기, 있는 그룹으로 옮기기, 그룹에서 빼기
    await (await popup.waitForSelector('[data-role="select-start"]', { visible: true, timeout: 5000 })).click();
    await popup.click(`[data-account-id="${picks[0].id}"] input.pick`);
    await popup.click(`[data-account-id="${picks[1].id}"] input.pick`);
    await popup.click('[data-role="select-group"]');
    await popup.waitForSelector('[data-role="select-group-panel"]', { visible: true });
    if (await popup.$('[data-role="select-group-remove"]')) problems.push('그룹이 하나도 없는데 그룹 빼기가 보임');
    await popup.keyboard.press('Escape');
    if (await popup.$('[data-role="select-group-panel"]')) problems.push('Esc 로 그룹 패널이 안 닫힘');
    if (!(await popup.$('[data-role="select-count"]'))) problems.push('Esc 한 번에 선택 모드까지 끝남');
    await popup.click('[data-role="select-group"]');
    await popup.click('[data-role="select-group-new"]');
    await popup.waitForSelector('[data-role="select-group-input"]', { visible: true });
    await popup.type('[data-role="select-group-input"]', '   ');
    await popup.click('[data-role="select-group-save"]');
    if ((await popup.$eval('[data-role="select-group-input"]', (el) => el.getAttribute('aria-invalid'))) !== 'true') {
      problems.push('빈 그룹 이름이 거절되지 않음');
    }
    await popup.$eval('[data-role="select-group-input"]', (el) => { el.value = ''; });
    await popup.type('[data-role="select-group-input"]', 'Work');
    await popup.keyboard.press('Enter');
    list = await waitVault(popup, (l) => byIssuer(l, 'Acme Mail')?.group === 'Work', '여러 계정 새 그룹');
    if (byIssuer(list, 'Wingtip Cloud')?.group !== 'Work') problems.push('둘째 고른 계정이 Work 로 안 감');
    if (byIssuer(list, 'Contoso Vault')?.group) problems.push('고르지 않은 계정에 그룹이 붙음');
    await popup.waitForFunction(() => !document.querySelector('[data-role="select-count"]'), { timeout: 5000 })
      .catch(() => problems.push('그룹 옮긴 뒤 선택 모드가 안 끝남'));
    await popup.waitForSelector('[data-role="undo"]', { visible: true, timeout: 5000 });
    await popup.click('[data-role="undo"]');
    list = await waitVault(popup, (l) => l.every((a) => !a.group), '그룹 옮기기 되돌리기');

    // 있는 그룹으로: Contoso 를 Home 에 넣어 두고 나머지 둘을 Home 으로, 그다음 셋 다 빼기.
    await (await popup.waitForSelector('[data-role="select-start"]', { visible: true, timeout: 5000 })).click();
    await popup.click(`[data-account-id="${picks[2].id}"] input.pick`);
    await popup.click('[data-role="select-group"]');
    await popup.click('[data-role="select-group-new"]');
    await popup.type('[data-role="select-group-input"]', 'Home');
    await popup.keyboard.press('Enter');
    await waitVault(popup, (l) => byIssuer(l, 'Contoso Vault')?.group === 'Home', '한 계정 Home');
    await (await popup.waitForSelector('[data-role="select-start"]', { visible: true, timeout: 5000 })).click();
    await popup.click('[data-role="select-all"]');
    await popup.click('[data-role="select-group"]');
    const choices = await popup.$$eval('[data-role="select-group-pick"]', (els) => els.map((e) => e.textContent));
    if (choices.join() !== 'Home') problems.push(`그룹 고르기 목록이 다름: ${choices.join()}`);
    await popup.click('[data-role="select-group-pick"]');
    list = await waitVault(popup, (l) => l.every((a) => a.group === 'Home'), '있는 그룹으로 옮기기');
    // 저장이 먼저 보이고 알림은 뒤따라 바뀔 수 있어 알림이 바뀔 때까지 기다린다.
    await popup.waitForFunction(() => document.querySelector('[data-role="undo-notice"] .undo-text')?.textContent?.includes('2'), { timeout: 5000 })
      .catch(async () => problems.push(`이미 Home 인 계정까지 센 알림: ${await popup.$eval('[data-role="undo-notice"] .undo-text', (el) => el.textContent ?? '').catch(() => '(없음)')}`));
    // 되돌리면 원래 Home 이던 Contoso 는 그대로 Home.
    await popup.click('[data-role="undo"]');
    list = await waitVault(popup, (l) => !byIssuer(l, 'Acme Mail')?.group, '있는 그룹 옮기기 되돌리기');
    if (byIssuer(list, 'Contoso Vault')?.group !== 'Home') problems.push('되돌리기가 원래 Home 이던 계정까지 뺌');
    await (await popup.waitForSelector('[data-role="select-start"]', { visible: true, timeout: 5000 })).click();
    await popup.click('[data-role="select-all"]');
    await popup.click('[data-role="select-group"]');
    await popup.click('[data-role="select-group-remove"]');
    list = await waitVault(popup, (l) => l.every((a) => !a.group), '여러 계정 그룹 빼기');

    // (g) 계정 그림: 읽을 수 없는 파일은 안내, 그림은 64px 로 다시 그려 저장, 팝업 타일에 보임, 내장 아이콘을 고르면 지워짐.
    const editor = await open('manage.html#accounts', '[data-role="account-row"]');
    const acmeId = byIssuer(list, 'Acme Mail')?.id;
    await editor.click(`[data-role="account-row"][data-account-id="${acmeId}"]`);
    await editor.waitForSelector('[data-role="icon-image-choose"]', { visible: true });
    if (await editor.$('[data-icon-id="image"]')) problems.push('그림이 없는데 내 그림 칸이 보임');
    const wide = await editor.evaluate(() => {
      const c = document.createElement('canvas');
      c.width = 120;
      c.height = 60;
      const x = c.getContext('2d');
      x.fillStyle = '#d00';
      x.fillRect(0, 0, 60, 60);
      x.fillStyle = '#00d';
      x.fillRect(60, 0, 60, 60);
      return c.toDataURL('image/png').split(',')[1];
    });
    const goodFile = `/tmp/otp-e2e-icon-${randomUUID()}.png`;
    const badFile = `/tmp/otp-e2e-icon-${randomUUID()}.png`;
    await fs.writeFile(goodFile, Buffer.from(wide, 'base64'));
    await fs.writeFile(badFile, 'not an image');
    try {
      const input = await editor.$('[data-role="icon-image-file"]');
      await uploadFixture(input, badFile, session);
      await editor.waitForSelector('[data-role="icon-image-error"]', { visible: true, timeout: 5000 })
        .catch(() => problems.push('그림이 아닌 파일에 안내가 없음'));
      await uploadFixture(input, goodFile, session);
      await editor.waitForSelector('[data-icon-id="image"] img', { visible: true, timeout: 5000 });
      if (await editor.$('[data-role="icon-image-error"]')) problems.push('그림을 읽은 뒤에도 오류 안내가 남음');
      if (!(await editor.$('[data-role="icon-image-note"]'))) problems.push('그림은 동기화되지 않는다는 안내가 없음');
    } finally {
      await fs.rm(goodFile, { force: true });
      await fs.rm(badFile, { force: true });
    }
    await editor.click('[data-role="save"]');
    list = await waitVault(editor, (l) => byIssuer(l, 'Acme Mail')?.iconImage?.startsWith('data:image/'), '계정 그림 저장');
    const saved = byIssuer(list, 'Acme Mail')?.iconImage ?? '';
    if (saved.length > 32768) problems.push(`그림이 너무 큼: ${saved.length}`);
    const shape = await editor.evaluate(async (src) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const x = c.getContext('2d');
      x.drawImage(img, 0, 0);
      const left = x.getImageData(8, 32, 1, 1).data;
      const right = x.getImageData(56, 32, 1, 1).data;
      return { w: img.naturalWidth, h: img.naturalHeight, left: [...left], right: [...right] };
    }, saved);
    if (shape.w !== 64 || shape.h !== 64) problems.push(`그림 크기가 64px 이 아님: ${shape.w}x${shape.h}`);
    // 가운데 정사각을 잘랐으니 왼쪽은 빨강, 오른쪽은 파랑.
    if (!(shape.left[0] > 150 && shape.left[2] < 80 && shape.right[2] > 150 && shape.right[0] < 80)) {
      problems.push(`그림 가운데 자르기가 다름: ${shape.left} / ${shape.right}`);
    }
    await editor.waitForSelector(`[data-account-id="${acmeId}"] .account-icon.img-tile img`, { timeout: 5000 })
      .catch(() => problems.push('관리 목록에 그림이 안 보임'));
    await popup.waitForSelector(`[data-account-id="${acmeId}"] .tile.img-tile img`, { timeout: 5000 })
      .catch(() => problems.push('팝업 타일에 그림이 안 보임'));
    // 그림 없는 다른 줄에도 타일 자리가 생긴다(이니셜 타일 꺼짐).
    const gap = await popup.$$eval('.row.no-tile', (els) => els.length);
    if (gap !== 0) problems.push(`그림 계정이 있는데 타일 자리가 없는 줄: ${gap}`);
    await editor.click(`[data-role="account-row"][data-account-id="${acmeId}"]`);
    await editor.waitForSelector('[data-icon-id="key"]', { visible: true });
    await editor.click('[data-icon-id="key"]');
    if (await editor.$('[data-icon-id="image"]')) problems.push('내장 아이콘을 골라도 내 그림 칸이 남음');
    await editor.click('[data-role="save"]');
    list = await waitVault(editor, (l) => byIssuer(l, 'Acme Mail')?.iconImage === undefined, '그림 지우기');
    if (byIssuer(list, 'Acme Mail')?.iconId !== 'key') problems.push('그림을 지우며 고른 내장 아이콘이 저장되지 않음');
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
