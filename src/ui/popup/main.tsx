import { render } from 'preact';
import '../shared/theme.css';
import { App } from './App';
import { CodeAccessHost } from '../shared/CodeAccessHost';

// Firefox에는 windows.onBoundsChanged가 없어서 별도 창 자신의 resize를 사용한다.
// 폴링하지 않고 마지막 크기 변경 뒤 한 번만 저장하며, 닫힌 문서의 타이머는 남기지 않는다.
if (location.pathname.endsWith('/window.html') && !chrome.windows.onBoundsChanged) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let closed = false;
  const saveBounds = async () => {
    const win = await chrome.windows.getCurrent();
    if (closed || win.type !== 'popup' || (win.state !== undefined && win.state !== 'normal') ||
        typeof win.width !== 'number' || typeof win.height !== 'number') return;
    const bounds = { width: win.width, height: win.height, left: win.left, top: win.top };
    await chrome.storage.local.set({ windowBounds: bounds });
  };
  const resized = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      void saveBounds().catch((error) => console.warn('windowBounds', error));
    }, 200);
  };
  const hidden = () => {
    if (document.visibilityState === 'hidden') resized();
  };
  // 옮기기만 한 경우는 resize가 없으니 포커스를 잃을 때도 저장한다.
  window.addEventListener('resize', resized);
  window.addEventListener('blur', resized);
  document.addEventListener('visibilitychange', hidden);
  window.addEventListener('pagehide', () => {
    closed = true;
    if (timer !== undefined) clearTimeout(timer);
    window.removeEventListener('resize', resized);
    window.removeEventListener('blur', resized);
    document.removeEventListener('visibilitychange', hidden);
  }, { once: true });
}

// 외부 사이트의 넣기 승인은 목록을 다시 열지 않고 작은 인증 상태만 표시한다.
// 이 값은 화면 모양만 바꾼다. 승인할 요청과 출처는 background가 검증한다.
const approvalOnly = new URLSearchParams(location.search).get('approval') === '1';
render(approvalOnly
  ? <div class="code-access-only"><CodeAccessHost temporary /></div>
  : <><App /><CodeAccessHost /></>, document.getElementById('app')!);
