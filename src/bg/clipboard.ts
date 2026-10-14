// 복사한 코드를 잠시 뒤 클립보드에서 지운다. 코드 자체는 저장하지 않고 해시만 session 에 둔다.
import { saveSettings } from '../store/settings';
import { supportsClipboardClear } from '../core/browser';

const ALARM = 'clipboard-clear';
const DELAY_MINUTES = 0.5;
const OFFSCREEN_URL = 'offscreen/clipboard.html';

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

// Firefox 의 배경 문서는 DOM 이 있으므로 offscreen 문서가 필요 없다.
async function clearInBackgroundDocument(hash: string): Promise<void> {
  const box = document.createElement('textarea');
  document.body.append(box);
  const read = () => {
    box.value = '';
    box.focus();
    if (!document.execCommand('paste')) throw new Error('clipboard read failed');
    return box.value;
  };
  try {
    const text = read();
    if (!text || await sha256Hex(text) !== hash) return;
    // 해시를 구하는 사이 다른 내용이 복사됐으면 남긴다. 재확인과 지우기 사이에는 await 가 없다.
    if (read() !== text) return;
    const clear = (event: ClipboardEvent) => {
      event.clipboardData?.setData('text/plain', '');
      event.preventDefault();
    };
    document.addEventListener('copy', clear, { once: true });
    try {
      if (!document.execCommand('copy')) throw new Error('clipboard clear failed');
    } finally {
      document.removeEventListener('copy', clear);
    }
  } finally {
    box.remove();
  }
}

async function clearIfSame(): Promise<void> {
  const got = await chrome.storage.session.get('clipboardPending');
  const pending = got.clipboardPending as { hash?: unknown; due?: unknown } | undefined;
  if (typeof pending?.hash !== 'string') return;
  // 앞 복사의 알람이 뒤 복사의 기록을 읽은 경우: 아직 때가 아니면 남은 시간 뒤로 다시 예약한다.
  if (typeof pending.due === 'number' && Date.now() < pending.due - 500) {
    await chrome.alarms.create(ALARM, { when: pending.due });
    return;
  }
  await chrome.storage.session.remove('clipboardPending');
  // 읽기 권한이 없으면 아무것도 하지 않는다(권한 요청은 설정 화면 몫).
  if (!(await chrome.permissions.contains({ permissions: ['clipboardRead'] }))) return;
  if (!chrome.offscreen && typeof document !== 'undefined') {
    await clearInBackgroundDocument(pending.hash);
    return;
  }
  try {
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_URL,
      reasons: [chrome.offscreen.Reason.CLIPBOARD],
      justification: 'Clear a copied one-time code from the clipboard',
    });
  } catch {
    // 이미 열려 있으면 그대로 쓴다.
  }
  try {
    // 막 만든 offscreen 문서는 스크립트가 아직 안 붙었을 수 있어 몇 번 다시 보낸다.
    for (let attempt = 0; attempt < 10; attempt++) {
      // 다른 확장 페이지만 열려 있으면 빈 응답이 오므로 offscreen 의 답(cleared)이 올 때까지.
      const reply = (await chrome.runtime
        .sendMessage({ type: 'offscreen-clipboard-clear', hash: pending.hash })
        .catch(() => undefined)) as { cleared?: boolean } | undefined;
      if (typeof reply?.cleared === 'boolean') break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  } finally {
    await chrome.offscreen.closeDocument().catch(() => undefined);
  }
}

export function register(): void {
  if (!supportsClipboardClear()) return;
  // 권한을 어디서 거두든(확장 관리 화면 등) 클립보드 지우기 설정도 끈다.
  chrome.permissions.onRemoved.addListener((removed) => {
    if (removed.permissions?.includes('clipboardRead')) void saveSettings({ clipboardClearAfterCopy: false });
  });
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (typeof message !== 'object' || message === null || message.type !== 'clipboard-copied') {
      return false;
    }
    const code = typeof message.code === 'string' ? message.code : '';
    void (async () => {
      if (code === '') return;
      // 시험용: 지연(ms)이 있으면 알람 대신 그 시간 뒤에 지운다.
      const test = (await chrome.storage.session.get('clipboardClearDelayMs')).clipboardClearDelayMs;
      const delayMs = typeof test === 'number' ? test : DELAY_MINUTES * 60_000;
      await chrome.storage.session.set({
        clipboardPending: { hash: await sha256Hex(code), due: Date.now() + delayMs },
      });
      if (typeof test === 'number') {
        setTimeout(() => void clearIfSame().catch((e) => console.warn('clipboard-clear', e)), test);
      } else {
        await chrome.alarms.create(ALARM, { delayInMinutes: DELAY_MINUTES });
      }
    })().then(
      () => sendResponse({ ok: true }),
      (error) => {
        console.warn('clipboard-copied', error);
        sendResponse({ ok: false });
      },
    );
    return true;
  });

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM) {
      void clearIfSame().catch((error) => console.warn('clipboard-clear', error));
    }
  });
}
