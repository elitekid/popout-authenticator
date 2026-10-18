// 스토어 이미지 만들기: 스크린샷(en·ko 각 6장, 1280×800)과 브랜드 이미지 3장.
// 실행(extension 폴더에서): CHROME_PATH=<Chrome for Testing 실행 파일> node store/make-assets.mjs
// 빌드된 dist-chrome 을 헤드리스 크롬에 넣고, 가짜 계정만 써서 실제 화면을 찍은 뒤 설명 틀에 얹는다.
// STORE_DEBUG=1 이면 찍은 원본 화면을 store/.raw/<언어>/ 에도 남긴다.
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { launchWithExtension, cleanup } from '../tests/e2e/browser.mjs';
import { makeNoneVault } from '../tests/e2e/vault-fixture.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(ROOT, '../dist-chrome');
const ICON_SVG = path.resolve(ROOT, '../public/icons/icon.svg');
const DEBUG = process.env.STORE_DEBUG ? path.join(ROOT, '.raw') : null;
const SITE_HOST = 'mail.acme.example';
const SITE_URL = `https://${SITE_HOST}/login/verify`;
const FAKE_PASSWORD = 'fake-store-pass-1';

// 가짜 비밀키만 쓴다(base32). 이름·주소도 지어낸 것만 쓴다.
const FAKE = [
  ['Acme Mail', 'alex@example.com', 'JBSWY3DPEHPK3PXP', 'Work'],
  ['Northwind Cloud', 'alex.kim', 'GEZDGNBVGY3TQOJQ', 'Work'],
  ['Contoso Bank', 'alex@example.com', 'MFRGGZDFMZTWQ2LK', 'Personal'],
  ['Fabrikam Dev', 'alexk', 'ONSWG4TFORXXEZLT', 'Work'],
  ['Tailspin Shop', 'alex@example.com', 'KRUGKIDROVUWG2ZA', 'Personal'],
  ['Globex VPN', 'alex.kim@example.com', 'NBSWY3DPO5XXE3DE', 'Work'],
];

function base32(s) {
  const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of s) {
    value = (value << 5) | abc.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function accounts() {
  const now = Date.now();
  return FAKE.map(([issuer, label, secret, group], i) => ({
    id: randomUUID(), type: 'totp', issuer, label, secret: base32(secret),
    algorithm: 'SHA-1', digits: 6, period: 30, note: '', pinned: i === 0,
    group, matchHosts: i === 0 ? [SITE_HOST] : [], createdAt: now - i * 1000, updatedAt: now,
  }));
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// 확장 페이지 하나를 열어 고른 요소를 2배 해상도로 찍는다.
// 코드 목록은 남은 초가 fresh 초 이상일 때 찍는다(만료 직전의 '다음 코드' 표시가 끼지 않게).
// until 을 주면 그 요소의 아래 끝까지만 찍는다.
async function shoot(browser, url, { width = 400, height = 1200, selector = '[data-app]', before, stub, fresh = 0, until } = {}) {
  const left = 30 - ((Date.now() / 1000) % 30);
  if (left < fresh) await wait((left + 1) * 1000);
  const page = await browser.newPage();
  try {
    await page.setViewport({ width, height, deviceScaleFactor: 2 });
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
    if (stub) await page.evaluateOnNewDocument(stub, SITE_URL);
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForSelector('[data-app]', { visible: true, timeout: 10000 });
    if (before) await before(page);
    await page.waitForFunction(() => !document.querySelector('.screen-loading'), { timeout: 10000 }).catch(() => {});
    await wait(600);
    await page.evaluate(() => document.activeElement?.blur());
    await page.waitForSelector(selector, { visible: true, timeout: 10000 });
    if (until) {
      const bottom = await page.$eval(until, (el) => el.getBoundingClientRect().bottom);
      return await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width, height: Math.ceil(bottom) + 16 } });
    }
    return await (await page.$(selector)).screenshot({ type: 'png' });
  } finally {
    await page.close();
  }
}

async function inExtension(browser, origin, fn, ...args) {
  const page = await browser.newPage();
  try {
    await page.goto(`${origin}/manage.html`, { waitUntil: 'load' });
    return await page.evaluate(fn, ...args);
  } finally {
    await page.close();
  }
}

async function seed(browser, origin, lang) {
  const vault = await makeNoneVault(accounts());
  await inExtension(browser, origin, async (v, lang) => {
    await chrome.storage.local.clear();
    await chrome.storage.session.clear();
    await chrome.storage.local.set({
      vault: v,
      settings: { language: lang, avatars: true, theme: 'light', clockCheck: true },
      backupSnoozeUntil: Date.now() + 6 * 864e5,
      lockNudge: { count: 3, until: 0 },
      reviewDismissed: true,
      tabsFollowDismissed: true,
    });
  }, vault, lang);
}

// 팝업이 지금 탭을 가짜 로그인 주소로 보게 한다(그 사이트 계정에 '넣기' 단추가 붙는다).
function stubActiveTab(url) {
  if (!globalThis.chrome?.tabs) return;
  chrome.tabs.query = async () => [{ id: 1, windowId: 1, index: 0, active: true, url, title: 'Acme Mail' }];
}

async function captureRaw(session, lang) {
  const { browser, baseUrl: origin } = session;
  await seed(browser, origin, lang);
  const raw = {};
  const listReady = (p) => p.waitForSelector('[data-account-id]');
  raw.popup = await shoot(browser, `${origin}/popup.html`, { height: 600, fresh: 12, before: listReady });
  let code = '';
  raw.fill = await shoot(browser, `${origin}/popup.html`, {
    height: 600, fresh: 12, stub: stubActiveTab,
    before: async (p) => {
      await p.waitForSelector('[data-role="fill"]', { timeout: 10000 });
      code = await (await p.waitForSelector('[data-account-id] [data-code]')).evaluate((el) => el.dataset.code);
      await p.hover('[data-role="fill"]');
    },
  });
  raw.addMenu = await shoot(browser, `${origin}/popup.html`, {
    height: 600, fresh: 12,
    before: async (p) => {
      await listReady(p);
      await p.click('[data-role="add-menu"]');
      await p.waitForSelector('[data-role="capture-tab"]', { visible: true });
    },
  });
  await inExtension(browser, origin, (url) => chrome.storage.session.set({ openerUrl: url }), SITE_URL);
  // 창과 사이드 패널이 같은 코드를 보이게 한 주기 안에서 잇달아 찍는다.
  raw.window = await shoot(browser, `${origin}/window.html`, { height: 600, fresh: 20, before: listReady });
  raw.sidepanel = await shoot(browser, `${origin}/sidepanel.html`, { width: 360, height: 640, fresh: 12, before: listReady });
  raw.addQr = await shoot(browser, `${origin}/manage.html?compact=1&tab=qr#add`, { height: 420 });
  // 잠금: 가짜 비밀번호로 켜고 복구 코드 확인을 마친 화면.
  raw.lock = await shoot(browser, `${origin}/manage.html?compact=1#lock`, {
    height: 1400, until: '[data-role="passkeys"]',
    before: async (page) => {
      await page.waitForSelector('[data-role="lock-password"]', { visible: true });
      await page.type('[data-role="lock-password"]', FAKE_PASSWORD);
      await page.type('[data-role="lock-password2"]', FAKE_PASSWORD);
      await page.click('[data-role="lock-enable"]');
      await page.waitForSelector('[data-role="recovery-step"]', { timeout: 30000 });
      const recovery = await page.$eval('[data-role="recovery-code"]', (el) => el.getAttribute('data-code'));
      await page.type('[data-role="recovery-confirm"]', recovery);
      const saved = await page.$('[data-role="recovery-saved"]');
      if (saved) await saved.click();
      await page.click('[data-role="recovery-confirm-submit"]');
      await page.waitForSelector('[data-role="lock-state"]', { timeout: 30000 });
    },
  });
  // 잠금을 켠 뒤라 동기화 칸이 암호화 동기화 상태로 보인다.
  const display = `${origin}/manage.html?compact=1&panel=privacy#settings`;
  raw.sync = await shoot(browser, display, { selector: '[data-role="settings-sync-box"]', height: 2400 });
  raw.clock = await shoot(browser, display, { selector: '[data-role="clock"]', height: 2400 });
  raw.export = await shoot(browser, `${origin}/manage.html?compact=1#backup`, { selector: '[data-role="export"]' });
  // 잠긴 팝업: 풀린 열쇠만 지운다.
  await inExtension(browser, origin, () => chrome.storage.session.remove(['vaultKey', 'unlockedAt']));
  raw.locked = await shoot(browser, `${origin}/popup.html`, { height: 600 });
  if (DEBUG) {
    await fs.mkdir(path.join(DEBUG, lang), { recursive: true });
    for (const [k, v] of Object.entries(raw)) await fs.writeFile(path.join(DEBUG, lang, `${k}.png`), v);
  }
  if (!/^\d{6}$/.test(code)) throw new Error(`넣기 장면 코드를 못 읽음: ${JSON.stringify(code)}`);
  return { raw, code };
}

// ---- 틀 ----

const TEXT = {
  en: {
    font: '-apple-system, "SF Pro Display", "Helvetica Neue", Arial, sans-serif',
    site: { title: 'Two-step verification', sub: 'Enter the 6-digit code from your authenticator app.', field: 'Verification code', button: 'Verify', brand: 'Acme Mail' },
    dash: 'Project dashboard',
    window: 'Popout Authenticator',
    scenes: [
      ['01-codes', 'Your 2FA codes, one click away', 'Click a code to copy it. No limit on accounts.'],
      ['02-fill', 'Fill codes right into sign-in pages', 'The account for the site you are on is suggested first.'],
      ['03-window', 'Pop it out to a window or the side panel', 'Keep your codes open next to your work.'],
      ['04-add', 'Add accounts in seconds', 'Scan a QR code on screen or with your camera, paste links, or import a backup file.'],
      ['05-lock', 'Lock it with a password or passkey', 'Your accounts stay encrypted and lock automatically when idle.'],
      ['06-backup', 'Backups, encrypted sync and clock check', 'Export encrypted backups, sync between browsers, and get warned about a wrong clock.'],
    ],
  },
  ko: {
    font: '-apple-system, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif',
    site: { title: '2단계 인증', sub: '인증 앱에 표시된 6자리 코드를 입력하세요.', field: '인증 코드', button: '확인', brand: 'Acme Mail' },
    dash: '프로젝트 대시보드',
    window: '팝업 인증 도구',
    scenes: [
      ['01-codes', '클릭 한 번으로 2단계 인증 코드', '코드를 누르면 바로 복사됩니다. 계정 수 제한이 없습니다.'],
      ['02-fill', '로그인 화면에 코드를 바로 넣기', '지금 보고 있는 사이트의 계정을 먼저 알려 드립니다.'],
      ['03-window', '별도 창이나 사이드 패널로 열기', '작업하는 동안 코드를 옆에 띄워 둘 수 있습니다.'],
      ['04-add', '몇 초 만에 계정 추가', '화면이나 카메라로 QR 코드를 읽고, 링크나 백업 파일로 가져올 수 있습니다.'],
      ['05-lock', '비밀번호와 패스키로 잠금', '계정은 암호화해 보관하고, 쓰지 않으면 자동으로 잠깁니다.'],
      ['06-backup', '백업, 암호화 동기화, 시간 확인', '암호화 백업을 만들고, 브라우저끼리 동기화하고, 시계가 틀리면 알려 드립니다.'],
    ],
  },
};

const img = (buf) => `data:image/png;base64,${Buffer.from(buf).toString('base64')}`;

// 찍은 화면(2배)을 원래 CSS 크기로 놓는 카드. maxH 를 주면 위쪽만 보인다.
function card(buf, { w, maxH, extra = '' } = {}) {
  const style = [`width:${w}px`, maxH ? `max-height:${maxH}px` : '', extra].filter(Boolean).join(';');
  return `<div class="card" style="${style}"><img src="${img(buf)}" style="width:${w}px"></div>`;
}

function browserMock(url, body, { w, h, extra = '' }) {
  return `<div class="browser" style="width:${w}px;height:${h}px;${extra}">
    <div class="bar"><i></i><i></i><i></i><div class="url">${url}</div></div>
    <div class="page">${body}</div></div>`;
}

function sitePage(t, code) {
  return `<div class="site"><div class="logo">A</div><b class="brand">${t.site.brand}</b>
    <h2>${t.site.title}</h2><p>${t.site.sub}</p>
    <label>${t.site.field}</label><div class="field">${code}<span class="caret"></span></div>
    <div class="btn">${t.site.button}</div></div>`;
}

function dashPage(t) {
  const rows = Array.from({ length: 6 }, (_, i) => `<div class="row"><span style="width:${40 + ((i * 37) % 45)}%"></span></div>`).join('');
  return `<div class="dash"><h3>${t.dash}</h3><div class="tiles"><div></div><div></div><div></div></div>${rows}</div>`;
}

function sceneBody(n, lang, { raw, code }) {
  const t = TEXT[lang];
  switch (n) {
    case 0:
      return `<div class="stage">${card(raw.popup, { w: 400 })}</div>`;
    case 1:
      return `<div class="stage">${browserMock(SITE_URL, sitePage(t, code), { w: 1000, h: 590 })}
        <div class="float" style="right:150px;top:52px">${card(raw.fill, { w: 400 })}</div></div>`;
    case 2:
      return `<div class="stage">${browserMock('https://app.northwind.example/projects', dashPage(t) +
        `<div class="side"><img src="${img(raw.sidepanel)}" style="width:360px"></div>`, { w: 1100, h: 590 })}
        <div class="float win" style="left:150px;top:100px"><div class="wbar"><i></i><i></i><i></i><span>${t.window}</span></div>
        ${card(raw.window, { w: 330, maxH: 462, extra: 'border-radius:0 0 14px 14px;box-shadow:none' })}</div></div>`;
    case 3:
      return `<div class="stage">${card(raw.addMenu, { w: 400 })}${card(raw.addQr, { w: 400 })}</div>`;
    case 4:
      return `<div class="stage">${card(raw.locked, { w: 400, maxH: 560 })}${card(raw.lock, { w: 400 })}</div>`;
    default:
      return `<div class="stage">${card(raw.export, { w: 370 })}<div class="col">${card(raw.sync, { w: 370, maxH: 400 })}${card(raw.clock, { w: 370 })}</div></div>`;
  }
}

const CSS = `
*{box-sizing:border-box;margin:0}
html,body{width:1280px;height:800px;overflow:hidden}
body{background:linear-gradient(160deg,#eaf1fd 0%,#dbe7fb 55%,#cddcf7 100%);color:#0f1b33;display:flex;flex-direction:column;align-items:center}
header{text-align:center;padding:42px 60px 0;height:166px}
h1{font-size:44px;font-weight:700;letter-spacing:-.5px;line-height:1.15}
header p{font-size:22px;color:#3b4a66;margin-top:12px;line-height:1.35}
.stage{position:relative;flex:1;width:1280px;display:flex;justify-content:center;align-items:flex-start;gap:36px;padding-top:6px}
.card{background:#eef2f8;border-radius:14px;overflow:hidden;box-shadow:0 18px 50px rgba(20,45,100,.22),0 2px 6px rgba(20,45,100,.12)}
.card img{display:block}
.col{display:flex;flex-direction:column;gap:24px}
.float{position:absolute}
.browser{background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 18px 50px rgba(20,45,100,.2);display:flex;flex-direction:column}
.bar{height:44px;background:#e9edf3;display:flex;align-items:center;gap:8px;padding:0 16px;flex:none}
.bar i,.wbar i{width:12px;height:12px;border-radius:50%;background:#c9d0db;display:block}
.url{margin-left:16px;flex:1;max-width:520px;height:28px;border-radius:14px;background:#fff;font:14px/28px -apple-system,sans-serif;color:#5b6475;padding:0 14px}
.page{position:relative;flex:1;background:#f7f8fa;overflow:hidden}
.site{width:400px;margin:56px 0 0 90px;background:#fff;border:1px solid #e3e6ec;border-radius:12px;padding:30px 32px}
.site .logo{width:40px;height:40px;border-radius:10px;background:#e8543f;color:#fff;font:700 22px/40px -apple-system,sans-serif;text-align:center;display:inline-block;vertical-align:middle}
.site .brand{font-size:20px;margin-left:10px;vertical-align:middle}
.site h2{font-size:24px;margin:22px 0 8px}
.site p{font-size:15px;color:#5b6475;line-height:1.4}
.site label{display:block;font-size:14px;color:#3b4250;margin:22px 0 8px}
.site .field{height:48px;border:2px solid #286cdb;border-radius:8px;font:600 24px/44px ui-monospace,Menlo,monospace;letter-spacing:6px;padding:0 14px;box-shadow:0 0 0 4px rgba(40,108,219,.15)}
.caret{display:inline-block;width:2px;height:24px;background:#286cdb;vertical-align:middle;margin-left:2px}
.site .btn{margin-top:22px;height:46px;border-radius:8px;background:#e8543f;color:#fff;font-size:17px;font-weight:600;text-align:center;line-height:46px}
.dash{padding:28px 36px;margin-right:360px}
.dash h3{font-size:22px;color:#2a3242}
.tiles{display:flex;gap:16px;margin:20px 0}
.tiles div{flex:1;height:110px;border-radius:10px;background:#e6ebf3}
.dash .row{height:44px;border-bottom:1px solid #e3e6ec;display:flex;align-items:center}
.dash .row span{height:12px;border-radius:6px;background:#dde3ec;display:block}
.side{position:absolute;right:0;top:0;bottom:0;width:360px;border-left:1px solid #d6dbe4;background:#eef2f8;overflow:hidden}
.win{border-radius:14px;box-shadow:0 22px 60px rgba(20,45,100,.3);background:#eef2f8}
.wbar{height:34px;background:#e3e8f0;display:flex;align-items:center;gap:7px;padding:0 12px;border-radius:14px 14px 0 0}
.wbar span{margin-left:10px;font:500 13px -apple-system,sans-serif;color:#4a5568}
`;

function frameHtml(lang, title, sub, body) {
  return `<!doctype html><html lang="${lang}"><meta charset="utf-8"><style>${CSS}
  body{font-family:${TEXT[lang].font}}</style><body><header><h1>${title}</h1>${sub ? `<p>${sub}</p>` : ''}</header>${body}</body></html>`;
}

async function renderHtml(browser, html, width, height, file, transparent = false) {
  const page = await browser.newPage();
  try {
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await page.screenshot({ path: file, type: 'png', omitBackground: transparent, clip: { x: 0, y: 0, width, height } });
    console.log('wrote', path.relative(ROOT, file));
  } finally {
    await page.close();
  }
}

async function makeScreenshots(browser, lang, shots) {
  for (const [n, [name, title, sub]] of TEXT[lang].scenes.entries()) {
    const file = path.join(ROOT, 'screenshots', lang, `${name}.png`);
    await renderHtml(browser, frameHtml(lang, title, sub, sceneBody(n, lang, shots)), 1280, 800, file);
  }
}

// ---- 브랜드 이미지 ----

async function makeBrand(browser) {
  const svg = await fs.readFile(ICON_SVG, 'utf8');
  const icon = (size, shadow) => svg.replace('<svg ', `<svg width="${size}" height="${size}" style="display:block;filter:drop-shadow(${shadow})" `);
  const head = `<!doctype html><meta charset="utf-8"><style>*{margin:0;box-sizing:border-box}
    body{font-family:-apple-system,"SF Pro Display","Helvetica Neue",Arial,sans-serif;overflow:hidden;display:flex;align-items:center;justify-content:center}
    .bg{background:linear-gradient(135deg,#2f76e6 0%,#1f57b8 100%);color:#fff}</style>`;
  const items = [
    ['logo-300x300.png', 300, 300, true, `${head}<body style="width:300px;height:300px">${icon(300, '0 0 0 transparent')}`],
    ['small-tile-440x280.png', 440, 280, false, `${head}<style>body{flex-direction:column;gap:16px}
      h1{font-size:30px;font-weight:700;letter-spacing:-.3px}p{font-size:16px;opacity:.88}</style>
      <body class="bg" style="width:440px;height:280px">${icon(116, '0 8px 18px rgba(0,0,0,.25)')}
      <h1>Popout Authenticator</h1><p>2FA codes in your browser</p>`],
    ['marquee-1400x560.png', 1400, 560, false, `${head}<style>body{gap:64px}
      h1{font-size:76px;font-weight:700;letter-spacing:-1.5px;line-height:1.05}p{font-size:32px;opacity:.9;margin-top:22px}</style>
      <body class="bg" style="width:1400px;height:560px">${icon(260, '0 16px 36px rgba(0,0,0,.28)')}
      <div><h1>Popout Authenticator</h1><p>2FA &amp; OTP codes, one click away</p></div>`],
  ];
  for (const [name, w, h, transparent, html] of items) {
    await renderHtml(browser, html, w, h, path.join(ROOT, 'brand', name), transparent);
  }
}

async function main() {
  const chromePath = process.env.CHROME_PATH;
  if (!chromePath) throw new Error('CHROME_PATH 가 필요하다');
  for (const lang of ['en', 'ko']) {
    // 크롬 자체 문구(파일 고르기 단추 등)도 같은 언어가 되게 언어마다 따로 띄운다.
    // macOS 크롬은 --lang 을 무시해서 AppleLanguages 를 실행 인자로만 준다(시스템 설정은 건드리지 않음).
    const session = await launchWithExtension({
      chromePath, distDir: DIST,
      extraArgs: [`--lang=${lang}`, `--accept-lang=${lang}`, '-AppleLanguages', `(${lang})`],
    });
    try {
      const shots = await captureRaw(session, lang);
      await makeScreenshots(session.browser, lang, shots);
      if (lang === 'en') await makeBrand(session.browser);
    } finally {
      await cleanup(session);
    }
  }
}

await main();
