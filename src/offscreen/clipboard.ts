// 서비스 워커가 시키는 대로 클립보드를 쓰거나, 읽어 해시가 같을 때만 비운다.
async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

function readClipboard(box: HTMLTextAreaElement): string {
  box.value = '';
  box.focus();
  document.execCommand('paste');
  return box.value;
}

// 동기로 비운다(읽은 뒤 비우기까지 사이에 다른 복사가 끼지 않게 await 를 두지 않는다).
function clearClipboard(box: HTMLTextAreaElement): void {
  // 빈 선택으로는 copy 가 클립보드를 바꾸지 않아, copy 이벤트에서 빈 글을 직접 넣는다.
  const onCopy = (event: ClipboardEvent) => {
    event.clipboardData?.setData('text/plain', '');
    event.preventDefault();
  };
  document.addEventListener('copy', onCopy, { once: true });
  box.focus();
  document.execCommand('copy');
  document.removeEventListener('copy', onCopy);
}

// 포커스가 없어도 되도록 textarea 를 선택해 execCommand('copy') 로 쓴다.
function writeClipboard(text: string): boolean {
  const box = document.createElement('textarea');
  box.value = text;
  document.body.append(box);
  try {
    box.focus();
    box.select();
    return document.execCommand('copy');
  } finally {
    box.value = '';
    box.remove();
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (typeof message === 'object' && message !== null && message.type === 'offscreen-clipboard-write') {
    let written = false;
    try {
      written = typeof message.text === 'string' && message.text !== '' && writeClipboard(message.text);
    } catch {
      written = false;
    }
    sendResponse({ written });
    return false;
  }
  if (typeof message !== 'object' || message === null || message.type !== 'offscreen-clipboard-clear') {
    return false;
  }
  const hash = typeof message.hash === 'string' ? message.hash : '';
  void (async () => {
    const box = document.createElement('textarea');
    document.body.append(box);
    try {
      const text = readClipboard(box);
      if (text === '' || (await sha256Hex(text)) !== hash) return false;
      // 해시를 계산하는 사이 사용자가 다른 것을 복사했으면 건드리지 않는다.
      if (readClipboard(box) !== text) return false;
      clearClipboard(box);
      return true;
    } finally {
      box.remove();
    }
  })().then(
    (cleared) => sendResponse({ cleared }),
    () => sendResponse({ cleared: false }),
  );
  return true;
});
