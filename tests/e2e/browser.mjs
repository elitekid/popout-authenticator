// e2e 공용: 확장을 넣은 헤드리스 크롬 띄우기와 정리.
import fs from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

// Firefox BiDi는 확장 문서의 activate/setViewport/setFiles를 지원하지 않는다.
// 포커스와 창 크기는 실제 확장 API로, 가짜 시험 파일은 DOM File 입력으로 전달한다.
export async function focusPage(page) {
  // BiDi의 page.url() 캐시는 waitUntil:[] 직후 아직 about:blank일 수 있다.
  if (await page.evaluate(() => location.protocol) !== 'moz-extension:') return page.bringToFront();
  await page.evaluate(async () => {
    const tab = await chrome.tabs.getCurrent();
    await chrome.tabs.update(tab.id, { active: true });
    await chrome.windows.update(tab.windowId, { focused: true });
  });
}

export async function sizePage(page, viewport) {
  if (await page.evaluate(() => location.protocol) !== 'moz-extension:') return page.setViewport(viewport);
  await page.evaluate(async ({ width, height }) => {
    const tab = await chrome.tabs.getCurrent();
    await chrome.windows.update(tab.windowId, {
      width: width + Math.max(0, outerWidth - innerWidth),
      height: height + Math.max(0, outerHeight - innerHeight),
    });
  }, viewport);
}

export async function uploadFixture(input, file, session) {
  if (session.browserName !== 'firefox') return input.uploadFile(file);
  const data = await fs.readFile(file);
  await input.evaluate((element, { name, bytes }) => {
    const files = new DataTransfer();
    files.items.add(new File([new Uint8Array(bytes)], name, { type: 'application/json' }));
    element.files = files.files;
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }, { name: path.basename(file), bytes: [...data] });
}

export async function launchWithExtension({ chromePath, distDir, extraArgs = [], browserName = 'chrome' }) {
  const profileDir = await fs.mkdtemp(path.join('/tmp', 'otp-e2e-'));
  let browser;
  try {
    if (browserName === 'firefox') {
      const manifest = JSON.parse(await fs.readFile(path.join(distDir, 'manifest.json'), 'utf8'));
      const addonId = manifest.browser_specific_settings.gecko.id;
      const extensionId = '9186d790-7984-4c3a-a64d-54cd0f3aeee7';
      const downloadDir = path.join(profileDir, 'downloads');
      await fs.mkdir(downloadDir);
      browser = await puppeteer.launch({
        browser: 'firefox', executablePath: chromePath, headless: true, userDataDir: profileDir,
        args: ['--remote-allow-system-access', ...extraArgs],
        extraPrefsFirefox: {
          'extensions.webextensions.uuids': JSON.stringify({ [addonId]: extensionId }),
          'browser.download.folderList': 2,
          'browser.download.dir': downloadDir,
          'browser.download.useDownloadDir': true,
          'browser.helperApps.neverAsk.saveToDisk': 'application/json,application/octet-stream,text/plain',
        },
      });
      await browser.installExtension(path.resolve(distDir));
      // Firefox BiDi는 확장 문서의 load/DOMContentLoaded 완료를 보고하지 않는다.
      // 이동 응답 뒤 각 시나리오가 실제 앱 selector를 기다린다.
      return { browser, profileDir, pid: browser.process()?.pid, extensionId, browserName,
        baseUrl: `moz-extension://${extensionId}`, navigationWait: [], downloadDir };
    }
    browser = await puppeteer.launch({
      executablePath: chromePath,
      headless: true,
      userDataDir: profileDir,
      ignoreDefaultArgs: ['--disable-extensions'],
      args: [
        '--use-mock-keychain',
        '--password-store=basic',
        `--disable-extensions-except=${distDir}`,
        `--load-extension=${distDir}`,
        ...extraArgs,
      ],
    });
    const worker = await browser.waitForTarget(
      (target) =>
        target.type() === 'service_worker' &&
        target.url().startsWith('chrome-extension://') &&
        target.url().endsWith('/bg/sw.js'),
      { timeout: 15000 },
    );
    const extensionId = new URL(worker.url()).host;
    return { browser, profileDir, pid: browser.process()?.pid, extensionId, browserName,
      baseUrl: `chrome-extension://${extensionId}` };
  } catch (error) {
    await cleanup({ browser, profileDir, pid: browser?.process()?.pid });
    throw error;
  }
}

// 자기가 띄운 browser 만 닫고, 안 닫히면 그 pid 만 종료한다. 프로필 폴더를 지운다.
export async function cleanup({ browser, profileDir, pid }) {
  if (browser) {
    try {
      await browser.close();
    } catch {
      // 아래에서 pid 로 정리
    }
    if (pid) {
      try {
        process.kill(pid, 0);
        process.kill(pid, 'SIGKILL');
      } catch {
        // 이미 끝남
      }
    }
  }
  if (profileDir) await fs.rm(profileDir, { recursive: true, force: true });
}

// 페이지를 열어 콘솔 error·pageerror 를 모으고, 앱 루트([data-app])가 그려질 때까지 기다린다.
export async function openAndCheck(browser, url, appName, navigationWait = 'load') {
  const problems = [];
  const page = await browser.newPage();
  page.on('console', (msg) => {
    if (msg.type() === 'error') problems.push(`console.error: ${msg.text()}`);
  });
  page.on('pageerror', (err) => problems.push(`pageerror: ${err.message}`));
  await page.goto(url, { waitUntil: navigationWait });
  try {
    await page.waitForSelector(`[data-app="${appName}"]`, { timeout: 10000 });
  } catch {
    problems.push(`app root [data-app="${appName}"] was not rendered`);
  }
  await page.close();
  return problems;
}
