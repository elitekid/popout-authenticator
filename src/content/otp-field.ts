// 사용자가 허락한 사이트의 OTP 입력칸 옆에 '코드 넣기' 단추를 띄운다.
// 등록된 페이지 스크립트(고전 스크립트)로 돈다: 다른 모듈을 값으로 import 하지 않고 export 도 두지 않는다.
// 단추를 누를 때만 서비스 워커에 넣기를 청구한다. 코드는 이 스크립트가 받지 않는다.
import type { FieldCheckMessage, FieldCheckReply, FieldFillMessage } from '../store/field-buttons';

(() => {
  const FLAG = '__popoutOtpFieldLoaded';
  const g = globalThis as unknown as Record<string, unknown>;
  if (g[FLAG]) return;
  g[FLAG] = true;

  const MAX_BUTTONS = 3;
  const RESCAN_MS = 300;
  const GAP = 4;
  const HEIGHT = 24;
  const TYPES = new Set(['text', 'tel', 'number', 'password', '']);
  const HINT = /otp|totp|2fa|two.?factor|mfa|one.?time|verification.?code|auth.?code|security.?code/i;

  type Entry = { input: HTMLInputElement; host: HTMLElement };
  const entries: Entry[] = [];
  const known = new WeakMap<HTMLInputElement, Entry>();
  let stopped = false;
  let started = false;
  let checkSequence = 0;
  let frame = 0;
  let timer = 0;
  let fullScan = false;
  const dirty = new Set<HTMLInputElement>();
  // looksLikeOtp 와 단추 묶음 판별이 읽는 속성만 본다.
  const WATCHED = ['type', 'autocomplete', 'name', 'id', 'placeholder', 'aria-label', 'disabled', 'readonly', 'maxlength'];

  function visible(el: HTMLElement): boolean {
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const style = getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden';
  }

  // 속성을 먼저 보고 필요할 때만 연결된 라벨을 읽는다. OTP 힌트가 있어야 배치를 확인한다.
  function looksLikeOtp(input: HTMLInputElement): boolean {
    if (input.disabled || input.readOnly) return false;
    if (!TYPES.has(input.getAttribute('type')?.toLowerCase() ?? '')) return false;
    let hinted =
      input.autocomplete.toLowerCase().includes('one-time-code') ||
      [input.name, input.id, input.placeholder, input.getAttribute('aria-label') ?? ''].some((s) => HINT.test(s));
    if (!hinted && input.labels) {
      for (const label of input.labels) {
        if (HINT.test(label.textContent ?? '')) {
          hinted = true;
          break;
        }
      }
    }
    // password 타입도 OTP 힌트가 명확할 때만 허용한다. 일반 비밀번호 칸은 제외한다.
    return hinted && visible(input);
  }

  function groupOf(input: HTMLInputElement): unknown {
    return input.form ?? input.parentElement?.parentElement ?? document;
  }

  // 단추가 있어야 할 자리. 지금 실제 위치와의 차이만큼 현재 좌표를 옮긴다. 그래서 html·body 가
  // position·margin·테두리를 가져도 문서 좌표 계산이 어긋나지 않는다. 읽기만 하고 쓰지 않는다.
  function target(entry: Entry): { left: number; top: number } {
    const rect = entry.input.getBoundingClientRect();
    const got = entry.host.getBoundingClientRect();
    const left = parseFloat(entry.host.style.left) || 0;
    const top = parseFloat(entry.host.style.top) || 0;
    return {
      left: Math.max(0, left + rect.right - GAP - got.width - got.left),
      top: Math.max(0, top + rect.top + (rect.height - HEIGHT) / 2 - got.top),
    };
  }

  function move(entry: Entry, at: { left: number; top: number }): void {
    entry.host.style.left = `${at.left}px`;
    entry.host.style.top = `${at.top}px`;
  }

  function place(entry: Entry): void {
    move(entry, target(entry));
  }

  function drop(entry: Entry): void {
    entry.host.remove();
    known.delete(entry.input);
    const i = entries.indexOf(entry);
    if (i >= 0) entries.splice(i, 1);
  }

  function makeButton(input: HTMLInputElement): Entry {
    const host = document.createElement('popout-otp-button');
    host.style.cssText = 'all:initial;position:absolute;display:block;margin:0;padding:0;height:24px;z-index:2147483647;top:0;left:0;';
    const root = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent =
      'button{all:initial;box-sizing:border-box;display:block;height:24px;padding:0 8px;' +
      'border-radius:6px;background:#2c64d6;color:#fff;font:12px/24px system-ui,-apple-system,"Segoe UI",sans-serif;' +
      'cursor:pointer;white-space:nowrap;}button:disabled{opacity:.6;cursor:default;}';
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = chrome.i18n.getMessage('fieldFillButton');
    button.title = chrome.i18n.getMessage('appShortName');
    // 칸의 포커스를 빼앗지 않는다.
    button.addEventListener('mousedown', (event) => event.preventDefault());
    button.addEventListener('click', (event) => {
      // 페이지 스크립트가 만든 가짜 클릭은 무시한다.
      if (!event.isTrusted || button.disabled) return;
      button.disabled = true;
      input.focus();
      const message: FieldFillMessage = { type: 'field-fill' };
      void (async () => {
        try {
          const reply = (await chrome.runtime.sendMessage(message)) as { ok?: boolean } | undefined;
          // 더는 켜져 있지 않거나 이 문서에서 쓸 수 없다고 답하면 단추를 모두 거둔다.
          if (reply?.ok === false) {
            stop();
            return;
          }
        } catch {
          // 확장이 다시 불러와졌거나 서비스 워커가 응답하지 못했다. 단추만 되살린다.
        } finally {
          button.disabled = false;
        }
      })();
    });
    root.append(style, button);
    document.documentElement.append(host);
    return { input, host };
  }

  function scan(): void {
    if (stopped) return;
    for (const entry of [...entries]) {
      if (!entry.input.isConnected || !visible(entry.input)) drop(entry);
    }
    if (entries.length >= MAX_BUTTONS) return;
    const seenGroups = new Set<unknown>();
    // 이미 단추가 있는 분할 칸의 그룹에는 다른 칸에 단추를 또 두지 않는다.
    for (const entry of entries) {
      if (entry.input.maxLength === 1) seenGroups.add(groupOf(entry.input));
    }
    for (const input of document.querySelectorAll('input')) {
      if (entries.length >= MAX_BUTTONS) break;
      attach(input, seenGroups);
    }
  }

  function attach(input: HTMLInputElement, seenGroups: Set<unknown>): void {
    if (known.has(input) || !looksLikeOtp(input)) return;
    // 한 글자씩 나뉜 칸은 첫 칸에만 단추를 둔다.
    if (input.maxLength === 1) {
      const group = groupOf(input);
      if (seenGroups.has(group)) return;
      seenGroups.add(group);
    }
    const entry = makeButton(input);
    known.set(input, entry);
    entries.push(entry);
    place(entry);
  }

  // 판별 속성만 바뀐 칸들을 그 칸만 다시 판별한다. 문서 전체는 훑지 않는다.
  function recheck(): void {
    if (stopped) return;
    const inputs = [...dirty];
    dirty.clear();
    const seenGroups = new Set<unknown>();
    for (const entry of entries) {
      if (entry.input.maxLength === 1) seenGroups.add(groupOf(entry.input));
    }
    for (const input of inputs) {
      const entry = known.get(input);
      if (entry) {
        if (!input.isConnected || !looksLikeOtp(input)) drop(entry);
      } else if (entries.length < MAX_BUTTONS && input.isConnected) {
        attach(input, seenGroups);
      }
    }
  }

  function schedulePlace(): void {
    if (stopped || frame !== 0) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      for (const entry of [...entries]) {
        if (!entry.input.isConnected || !visible(entry.input)) drop(entry);
      }
      // 모두 읽은 뒤 모두 쓴다. 단추마다 읽기·쓰기를 섞으면 레이아웃을 여러 번 다시 계산한다.
      const spots = entries.map(target);
      entries.forEach((entry, i) => move(entry, spots[i]));
    });
  }

  function scheduleScan(): void {
    if (stopped || timer !== 0) return;
    timer = window.setTimeout(() => {
      timer = 0;
      // 노드 추가·제거가 있었으면 전체 검사를 하고, 속성이 바뀐 칸은 따로 다시 판별한다
      // (전체 검사는 이미 단추가 있는 칸이 OTP 칸에서 벗어났는지 보지 않는다).
      if (fullScan) scan();
      fullScan = false;
      recheck();
      // 칸 위에 문구 등이 끼어 칸이 밀렸을 수 있다.
      schedulePlace();
    }, RESCAN_MS);
  }

  function onMutations(records: MutationRecord[]): void {
    for (const record of records) {
      if (record.type === 'childList') fullScan = true;
      else if (record.target instanceof HTMLInputElement) dirty.add(record.target);
    }
    if (fullScan || dirty.size > 0) scheduleScan();
  }

  const observer = new MutationObserver(onMutations);
  // 문서 높이가 변하면(이미지 로드, 접힘 펼침 등) 칸이 밀린 것이다.
  const resizeObserver = new ResizeObserver(schedulePlace);

  // 꺼졌거나 쓸 수 없는 문서면 단추·관찰·예약·리스너를 모두 거둔다.
  function stop(): void {
    if (stopped) return;
    stopped = true;
    for (const entry of [...entries]) drop(entry);
    observer.disconnect();
    resizeObserver.disconnect();
    window.removeEventListener('scroll', schedulePlace, { capture: true });
    window.removeEventListener('resize', schedulePlace);
    if (timer !== 0) window.clearTimeout(timer);
    if (frame !== 0) cancelAnimationFrame(frame);
    timer = 0;
    frame = 0;
    dirty.clear();
    try {
      chrome.storage.onChanged.removeListener(onStorageChanged);
    } catch {
      // 확장 문맥이 이미 닫혔다.
    }
    g[FLAG] = false;
  }

  function onStorageChanged(changes: Record<string, chrome.storage.StorageChange>, area: string): void {
    if (area !== 'local' || (!('fieldButtons' in changes) && !('autoFieldButtons' in changes))) return;
    checkEnabled();
  }

  function start(): void {
    if (stopped || started) return;
    started = true;
    window.addEventListener('scroll', schedulePlace, { capture: true, passive: true });
    window.addEventListener('resize', schedulePlace, { passive: true });
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: WATCHED });
    resizeObserver.observe(document.documentElement);
    if (document.body) resizeObserver.observe(document.body);
    scan();
  }

  function checkEnabled(): void {
    const sequence = ++checkSequence;
    const message: FieldCheckMessage = { type: 'field-check' };
    void (async () => {
      try {
        const reply = (await chrome.runtime.sendMessage(message)) as FieldCheckReply | undefined;
        if (stopped || sequence !== checkSequence) return;
        if (reply?.enabled === true) start();
        else stop();
      } catch {
        // 처음부터 계정을 확인하지 못한 페이지에는 단추를 붙이지 않는다.
        if (!started && sequence === checkSequence) stop();
      }
    })();
  }

  chrome.storage.onChanged.addListener(onStorageChanged);
  checkEnabled();
})();
