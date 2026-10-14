// 분리 창 시나리오: 두 번 열어도 창 1개, 크기를 기억해 다시 열기. 헤드리스 화면이 800×600 이라 그 안의 크기로 본다.
const TOLERANCE = 16;

export async function runOpenModeScenario(session) {
  const { browser, extensionId } = session;
  const origin = session.baseUrl ?? `chrome-extension://${extensionId}`;
  const problems = [];
  let page;

  const windowTargets = () =>
    browser.targets().filter((target) => target.url() === `${origin}/window.html`);

  try {
    page = await browser.newPage();
    await page.goto(`${origin}/manage.html`, { waitUntil: session.navigationWait ?? 'load' });
    // 이전 실행의 흔적 지우기
    await page.evaluate(() => chrome.storage.local.remove('windowBounds'));

    const send = () => page.evaluate(() => chrome.runtime.sendMessage({ type: 'open-window' }));
    await send();
    await send();
    await new Promise((resolve) => setTimeout(resolve, 1000));
    // Firefox BiDi targets에는 확장이 만든 창이 누락될 수 있어 실제 windows API로 센다.
    const count = session.browserName === 'firefox'
      ? await page.evaluate(async () => (await chrome.windows.getAll({ populate: true }))
        .filter((window) => window.tabs?.some((tab) => tab.url?.endsWith('/window.html'))).length)
      : windowTargets().length;
    if (count !== 1) problems.push(`window.html 창이 1개여야 하는데 ${count}개`);

    const id = await page.evaluate(async () => {
      const wins = await chrome.windows.getAll({ populate: true });
      const found = wins.find((w) => w.tabs?.some((t) => (t.url ?? '').endsWith('/window.html')));
      return found?.id ?? null;
    });
    if (id === null) {
      problems.push('window.html 창 id 를 찾지 못함');
      return problems;
    }

    await page.evaluate((winId) => chrome.windows.update(winId, { width: 520, height: 560 }), id);
    // 크기 저장은 bg 이벤트로 비동기
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await page.evaluate((winId) => chrome.windows.remove(winId), id);
    await new Promise((resolve) => setTimeout(resolve, 500));

    await send();
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const next = await page.evaluate(async () => {
      const wins = await chrome.windows.getAll({ populate: true });
      const found = wins.find((w) => w.tabs?.some((t) => (t.url ?? '').endsWith('/window.html')));
      return found ? { id: found.id, width: found.width, height: found.height } : null;
    });
    if (!next) {
      problems.push('창을 닫은 뒤 다시 보내도 새 창이 없음');
    } else {
      if (Math.abs(next.width - 520) > TOLERANCE) problems.push(`너비 520 기대, ${next.width}`);
      if (Math.abs(next.height - 560) > TOLERANCE) problems.push(`높이 560 기대, ${next.height}`);
      await page.evaluate((winId) => chrome.windows.remove(winId), next.id);
    }
  } catch (error) {
    problems.push(`open-mode 시나리오 예외: ${error instanceof Error ? error.message : error}`);
  } finally {
    if (page) await page.close().catch(() => undefined);
  }
  return problems;
}
