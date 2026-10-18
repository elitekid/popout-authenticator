// 받는 쪽 정적 페이지: 주소 '#' 뒤 조각을 열어 지금 코드를 보여 준다. 서버로 보내는 것은 없다.
import { WrongSecretError } from '../src/core/crypto/errors';
import { codeAt, openShareFragment, type OpenedShare } from '../src/core/share';

const dictionaries = {
  ko: {
    empty: '공유 링크가 없습니다.',
    broken: '공유 링크를 열 수 없습니다.',
    needsPassword: '링크를 열려면 비밀번호를 입력해 주세요.',
    password: '비밀번호',
    open: '열기',
    wrong: '비밀번호가 일치하지 않습니다.',
    left: '남은 시간',
    seconds: '초',
    until: '{time}까지 사용할 수 있습니다.',
    expired: '공유 링크가 만료되었습니다.',
    notStarted: '아직 사용 가능한 시간이 아닙니다.',
    tapToCopy: '코드를 누르면 복사합니다.',
    copying: '코드 복사 중…',
    copied: '코드를 복사했습니다.',
    copyFailed: '코드를 복사하지 못했습니다. 다시 시도해 주세요.',
  },
  en: {
    empty: 'No share link found.',
    broken: 'Unable to open this share link.',
    needsPassword: 'Enter the password to open this link.',
    password: 'Password',
    open: 'Open',
    wrong: 'Incorrect password.',
    left: 'Time left',
    seconds: 's',
    until: 'Valid until {time}',
    expired: 'This share link has expired.',
    notStarted: 'Not available yet.',
    tapToCopy: 'Select the code to copy it.',
    copying: 'Copying code…',
    copied: 'Code copied.',
    copyFailed: 'Unable to copy the code. Please try again.',
  },
};

const language = navigator.language.toLowerCase().startsWith('ko') ? 'ko' : 'en';
const text = dictionaries[language];
document.documentElement.lang = language;

const root = document.getElementById('app')!;
// 코드 다시 그리기 타이머는 하나만 둔다.
let timer: ReturnType<typeof setInterval> | undefined;

function stopTimer(): void {
  if (timer !== undefined) clearInterval(timer);
  timer = undefined;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  content = '',
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  if (content !== '') node.textContent = content;
  return node;
}

function show(state: string, ...children: HTMLElement[]): void {
  root.dataset.state = state;
  root.replaceChildren(...children);
}

function showMessage(state: string, message: string): void {
  show(state, el('p', { 'data-role': 'share-message' }, message));
}

function showPasswordForm(fragment: string, wrong: boolean): void {
  const form = el('form', { 'data-role': 'share-password-form' });
  const input = el('input', {
    type: 'password',
    'data-role': 'share-password',
    autocomplete: 'off',
    'aria-label': text.password,
    placeholder: text.password,
  });
  const submit = el('button', { type: 'submit', class: 'submit', 'data-role': 'share-open' }, text.open);
  form.append(el('p', {}, text.needsPassword), input, submit);
  if (wrong) form.append(el('p', { class: 'error', role: 'alert', 'data-role': 'share-error' }, text.wrong));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (input.value === '') return;
    void start(fragment, input.value);
  });
  show('password', form);
  input.focus();
}

function splitCode(code: string): string {
  const half = Math.ceil(code.length / 2);
  return `${code.slice(0, half)} ${code.slice(half)}`;
}

function showOpened(opened: OpenedShare): void {
  const name = [opened.issuer, opened.name].filter((part) => part !== '').join(' ');
  const code = el('button', { type: 'button', class: 'code', 'data-role': 'share-code' });
  const left = el('p', { class: 'muted' });
  const leftValue = el('span', { 'data-role': 'share-left' });
  left.append(`${text.left} `, leftValue);
  const endMs = (opened.firstCounter + opened.codes.length) * opened.period * 1000;
  const until = el(
    'p',
    { class: 'muted', 'data-role': 'share-until' },
    text.until.replace(
      '{time}',
      new Date(endMs).toLocaleTimeString(language, { hour: '2-digit', minute: '2-digit' }),
    ),
  );
  const copyStatus = el(
    'p',
    { class: 'muted', role: 'status', 'data-role': 'share-copy-status' },
    text.tapToCopy,
  );
  const children: HTMLElement[] = [];
  if (name !== '') children.push(el('h1', { 'data-role': 'share-name' }, name));
  children.push(code, left, until, copyStatus);
  show('open', ...children);

  let copySeq = 0;
  const viewSeq = startSeq;
  code.addEventListener('click', async () => {
    // 누른 순간의 코드를 다시 고른다(다음 그리기 전에 바뀌었거나 끝났을 수 있음).
    const now = codeAt(opened, Date.now());
    if (now === null) return;
    const seq = ++copySeq;
    copyStatus.className = 'muted';
    copyStatus.textContent = text.copying;
    try {
      await navigator.clipboard.writeText(now);
      if (seq !== copySeq || viewSeq !== startSeq || !copyStatus.isConnected) return;
      copyStatus.className = 'muted';
      copyStatus.textContent = text.copied;
    } catch {
      if (seq !== copySeq || viewSeq !== startSeq || !copyStatus.isConnected) return;
      copyStatus.className = 'error';
      copyStatus.textContent = text.copyFailed;
    }
  });

  const draw = (): void => {
    const now = Date.now();
    const value = codeAt(opened, now);
    if (value === null) {
      const index = Math.floor(now / 1000 / opened.period) - opened.firstCounter;
      if (index < 0) {
        // 시계가 뒤처진 경우: 시작을 기다리며 타이머는 계속 돈다.
        root.dataset.state = 'pending';
        code.textContent = '';
        code.removeAttribute('data-code');
        leftValue.textContent = text.notStarted;
        return;
      }
      stopTimer();
      showMessage('expired', text.expired);
      return;
    }
    root.dataset.state = 'open';
    code.textContent = splitCode(value);
    code.setAttribute('data-code', value);
    const remaining = opened.period - (Math.floor(now / 1000) % opened.period);
    leftValue.textContent = `${remaining}${text.seconds}`;
  };
  draw();
  if (root.dataset.state !== 'expired') timer = setInterval(draw, 1000);
}

// 열기를 겹쳐 누르거나 주소가 바뀌면 오래된 결과는 버린다.
let startSeq = 0;

async function start(fragment: string, password?: string): Promise<void> {
  const seq = ++startSeq;
  stopTimer();
  try {
    const opened = await openShareFragment(fragment, password);
    if (seq !== startSeq) return;
    showOpened(opened);
  } catch (error) {
    if (seq !== startSeq) return;
    if (error instanceof WrongSecretError) showPasswordForm(fragment, true);
    else if (error instanceof Error && error.message === 'needs password') showPasswordForm(fragment, false);
    else showMessage('broken', text.broken);
  }
}

function load(): void {
  startSeq++;
  stopTimer();
  const fragment = location.hash.replace(/^#/, '');
  if (fragment === '') {
    showMessage('empty', text.empty);
    return;
  }
  void start(fragment);
}

// 하단 소개 줄: 확장의 기존 번역에서 짧은 이름(appShortName)만 번들에 넣는다. appName 은 스토어 제목이라 설명 꼬리가 붙는다.
type Localized = { message: string };
const appNames = import.meta.glob<Localized>('../public/_locales/*/messages.json', {
  eager: true,
  import: 'appShortName',
});

function aboutLocale(): string {
  const folders = Object.keys(appNames).map((path) => path.split('/').slice(-2)[0]);
  const tag = navigator.language.toLowerCase().replace('-', '_');
  const base = tag.split('_')[0];
  const exact = folders.find((f) => f.toLowerCase() === tag);
  if (exact) return exact;
  const byBase = folders.find((f) => f.toLowerCase() === base || f.toLowerCase().startsWith(`${base}_`));
  return byBase ?? 'en';
}

function showAbout(): void {
  const locale = aboutLocale();
  const pick = (all: Record<string, Localized>): string =>
    all[`../public/_locales/${locale}/messages.json`]?.message ?? '';
  const home = locale === 'ko' ? '../ko/' : '../';
  const link = el(
    'a',
    {
      href: `${home}?utm_source=share&utm_medium=product&utm_campaign=pa-share`,
      target: '_blank',
      rel: 'noopener noreferrer',
    },
    pick(appNames),
  );
  document.getElementById('about')!.append(link);
}

showAbout();
window.addEventListener('hashchange', load);
load();
