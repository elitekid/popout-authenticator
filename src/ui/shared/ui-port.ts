// 서비스 워커에 "UI 가 열려 있음"을 알리는 포트. 끊기면 1초 뒤 다시 연결한다.
const PORT_NAME = 'popout-ui';
const PORT_RECONNECT_NAME = 'popout-ui-reconnect';
const RETRY_MS = 1000;
const ACTIVITY_MS = 1000;

export type UiPort = { activity(): void; close(): void };

export function connectUiPort(): UiPort {
  let port: chrome.runtime.Port | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let closed = false;
  let reconnecting = false;
  let lastActivity = 0;
  let activityTimer: ReturnType<typeof setTimeout> | undefined;

  const sendActivity = () => {
    activityTimer = undefined;
    if (closed || !port) return;
    try {
      port.postMessage('activity');
      lastActivity = Date.now();
    } catch {
      // 끊긴 포트: onDisconnect 가 다시 연결한다.
    }
  };

  const retry = () => {
    port = null;
    if (!closed) timer = setTimeout(open, RETRY_MS);
  };

  function open(): void {
    if (closed) return;
    try {
      // 처음 연결만 활동으로 친다. 다시 연결은 이름을 달리해 기한만 확인하게 한다.
      const next = chrome.runtime.connect({ name: reconnecting ? PORT_RECONNECT_NAME : PORT_NAME });
      reconnecting = true;
      next.onDisconnect.addListener(() => {
        void chrome.runtime.lastError;
        retry();
      });
      port = next;
      lastActivity = Date.now(); // 연결 자체도 배경에서 활동으로 기록한다.
    } catch {
      retry();
    }
  }

  open();

  return {
    activity() {
      if (closed || activityTimer !== undefined) return;
      // 빠른 타이핑마다 저장·알람을 갱신하지 않고, 마지막 입력도 빠뜨리지 않는다.
      const wait = ACTIVITY_MS - (Date.now() - lastActivity);
      if (wait <= 0) sendActivity();
      else activityTimer = setTimeout(sendActivity, wait);
    },
    close() {
      closed = true;
      if (timer !== undefined) clearTimeout(timer);
      if (activityTimer !== undefined) clearTimeout(activityTimer);
      try {
        port?.disconnect();
      } catch {
        // 이미 끊김
      }
      port = null;
    },
  };
}
