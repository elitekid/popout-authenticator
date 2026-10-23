// 팝업 목록의 순수 함수. 브라우저 API 를 쓰지 않는다(node 시험에서 import 된다).
import { BROWSER_TARGET, type BrowserTarget } from '../../core/browser';
import type { Account } from '../../core/types';

const DAY = 24 * 60 * 60 * 1000;
export const SNOOZE_MS = 7 * DAY;
const BACKUP_AGE_MS = 30 * DAY;

// 3자리씩 끊어 보여 준다. 예: '996554' → '996 554'
export function formatCode(code: string): string {
  return code.match(/.{1,3}/g)?.join(' ') ?? code;
}

type Searchable = Pick<Account, 'issuer' | 'label' | 'group' | 'note' | 'deletedAt'>;

export type SearchScope = 'all' | 'issuer' | 'label' | 'group' | 'note';

// 휴지통은 빼고, 공백으로 나눈 단어가 모두(AND) 대소문자 무시 부분 일치. group 이 null 이면 전체.
// 범위 'all' 은 서비스·계정·그룹·메모 어디든, 그 밖은 그 필드만. 비밀키·matchHosts 는 보지 않는다.
export function filterAccounts<T extends Searchable>(
  accounts: T[],
  query: string,
  group: string | null = null,
  scope: SearchScope = 'all',
): T[] {
  const words = query.toLowerCase().split(/\s+/).filter((w) => w !== '');
  return accounts.filter((a) => {
    if (a.deletedAt !== undefined) return false;
    if (group !== null && a.group !== group) return false;
    if (words.length === 0) return true;
    const fields = scope === 'all' ? [a.issuer, a.label, a.group ?? '', a.note] : [a[scope] ?? ''];
    const texts = fields.map((s) => s.toLowerCase());
    return words.every((w) => texts.some((s) => s.includes(w)));
  });
}

// 활성 계정 id 를 beforeId 이웃 앞에 옮긴다. 화면에서 가려진 계정도 모두 보존한다.
// 휴지통 계정은 원래 인덱스에 그대로 남는다.
export function moveActive<T extends Pick<Account, 'id' | 'deletedAt'>>(
  accounts: T[],
  id: string,
  beforeId: string | null, // 이 계정 앞에 놓는다. null 이면 맨 뒤
): T[] {
  const slots: number[] = [];
  const active: T[] = [];
  accounts.forEach((a, i) => {
    if (a.deletedAt === undefined) {
      slots.push(i);
      active.push(a);
    }
  });
  const from = active.findIndex((a) => a.id === id);
  if (from < 0) return accounts;
  const [moved] = active.splice(from, 1);
  const to = beforeId === null ? active.length : active.findIndex((a) => a.id === beforeId);
  // 놓을 이웃이 그새 사라졌으면 순서를 바꾸지 않는다.
  if (to < 0) return accounts;
  active.splice(to, 0, moved!);
  const out = accounts.slice();
  slots.forEach((slot, i) => {
    out[slot] = active[i]!;
  });
  return out;
}

export type GroupCount = { name: string; count: number };

// 휴지통이 아닌 계정의 그룹과 개수. 처음 나온 순서.
export function groupCounts(accounts: Pick<Account, 'group' | 'deletedAt'>[]): GroupCount[] {
  const counts = new Map<string, number>();
  for (const a of accounts) {
    if (a.deletedAt !== undefined || !a.group) continue;
    counts.set(a.group, (counts.get(a.group) ?? 0) + 1);
  }
  return [...counts].map(([name, count]) => ({ name, count }));
}

// 관리 편집기(AccountsSection)의 그룹 글자 수 한도와 같은 값.
export const GROUP_MAX = 64;

// 그룹 이름 입력을 다듬는다. 앞뒤 공백을 떼고 1..64 글자(코드 포인트)가 아니면 null.
export function normalizeGroupName(input: string): string | null {
  const name = input.trim();
  const length = [...name].length;
  return length >= 1 && length <= GROUP_MAX ? name : null;
}

export type GroupSection<T> = {
  // 그룹 이름. 그룹 없는 계정 묶음은 null.
  name: string | null;
  items: T[];
  folded: boolean;
};

// 접힘 기록에서 그룹 없는 묶음을 가리키는 이름(실제 그룹은 빈 이름이 될 수 없다).
export const UNGROUPED_KEY = '';

// 휴지통이 아닌 계정을 그룹별 묶음으로 나눈다. 묶음 순서는 각 그룹 첫 계정이 목록에서 나온 순서,
// 묶음 안은 목록 순서 그대로, 그룹 없는 계정은 맨 끝. folded 는 접힌 그룹 이름(그룹 없음은 UNGROUPED_KEY).
export function groupSections<T extends Pick<Account, 'group' | 'deletedAt'>>(
  accounts: T[],
  folded: ReadonlySet<string> | readonly string[] = [],
): GroupSection<T>[] {
  const foldedSet = folded instanceof Set ? folded : new Set(folded);
  const named = new Map<string, T[]>();
  const rest: T[] = [];
  for (const a of accounts) {
    if (a.deletedAt !== undefined) continue;
    if (!a.group) {
      rest.push(a);
      continue;
    }
    const list = named.get(a.group);
    if (list) list.push(a);
    else named.set(a.group, [a]);
  }
  const out: GroupSection<T>[] = [...named].map(([name, items]) => ({
    name,
    items,
    folded: foldedSet.has(name),
  }));
  if (rest.length > 0) out.push({ name: null, items: rest, folded: foldedSet.has(UNGROUPED_KEY) });
  return out;
}

// 화면에 그려지는(접히지 않은) 줄을 위에서부터 이어 붙인다. 키보드 이동·선택 자리의 기준.
export function visibleRows<T>(sections: GroupSection<T>[]): T[] {
  return sections.flatMap((s) => (s.folded ? [] : s.items));
}

// 접힘 기록에서 지금 없는 묶음 이름을 지운다.
export function pruneFolded(folded: readonly string[], sections: GroupSection<unknown>[]): string[] {
  const names = new Set(sections.map((s) => s.name ?? UNGROUPED_KEY));
  return folded.filter((name) => names.has(name));
}

// 서비스 이름 해시로 아바타 색(HSL)을 정한다.
export function avatarColor(issuer: string): string {
  let h = 0;
  for (const ch of issuer) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return `hsl(${h % 360} 55% 42%)`;
}

export function avatarInitial(issuer: string): string {
  const first = [...issuer.trim()][0];
  return first ? first.toUpperCase() : '?';
}

// 14단위 백업 화면도 백업 때 local 'backupInfo' 에 이 값을 저장한다.
export function backupSignature(accounts: Pick<Account, 'id' | 'updatedAt' | 'deletedAt'>[]): string {
  return accounts
    .filter((a) => a.deletedAt === undefined)
    .map((a) => `${a.id}:${a.updatedAt}`)
    .sort()
    .join('|');
}

export type BackupInfo = { at: number; sig: string };

export function shouldShowBackupReminder(input: {
  activeCount: number;
  sig: string;
  backupInfo: BackupInfo | null | undefined;
  snoozeUntil: number | null | undefined;
  now: number;
}): boolean {
  const { activeCount, sig, backupInfo, snoozeUntil, now } = input;
  if (activeCount < 3) return false;
  // 7일보다 먼 미래 값은 시계가 틀린 것이라 무시한다.
  if (typeof snoozeUntil === 'number' && now < snoozeUntil && snoozeUntil - now <= SNOOZE_MS) {
    return false;
  }
  if (!backupInfo) return true;
  return now - backupInfo.at > BACKUP_AGE_MS && backupInfo.sig !== sig;
}

const REVIEW_MIN_OPENS = 15;
export const REVIEW_LATER_OPENS = 50;
// 빌드 대상별 스토어 평가 주소. 웨일은 chrome 빌드를 쓰므로 userAgent 로 가른다.
// 서비스 워커 등 navigator 가 없는 곳에서도 import 가 깨지지 않게 확인한다.
const STORE_REVIEW_URLS: Record<BrowserTarget | 'whale', string> = {
  chrome: 'https://chromewebstore.google.com/detail/nakgmloofpboegibcjhainbpjjokmbgj/reviews',
  edge: 'https://microsoftedge.microsoft.com/addons/detail/edipphpgdmfabonchodjfnejlbjoknhh',
  firefox: 'https://addons.mozilla.org/firefox/addon/popout-authenticator/reviews/',
  whale: 'https://store.whale.naver.com/detail/bcfobdldplagmohdgaiocjddlokiolgc',
  safari: 'https://apps.apple.com/app/id6823010294?action=write-review',
};
const IS_WHALE =
  BROWSER_TARGET === 'chrome' && typeof navigator !== 'undefined' && /Whale/.test(navigator.userAgent ?? '');
export const STORE_REVIEW_URL: string = STORE_REVIEW_URLS[IS_WHALE ? 'whale' : BROWSER_TARGET];

// 응답 없이 띠가 보인 횟수가 이만큼 쌓이면 더 이상 띠를 보이지 않는다.
export const REVIEW_MAX_SHOWN = 3;

// 평가 요청: 팝업을 15번 이상 열었고 계정이 있으며, 닫지 않았고 미룬 횟수가 지났을 때.
// 노출이 3회 쌓였거나 safari 빌드(애플 지침 5.6.1)면 자동 띠는 보이지 않는다.
export function shouldShowReview(
  s: {
    openCount: number;
    accounts: number;
    dismissed: boolean;
    snoozedUntilOpen: number;
    shown?: number;
  },
  target: BrowserTarget = BROWSER_TARGET,
): boolean {
  return (
    target !== 'safari' &&
    (s.shown ?? 0) < REVIEW_MAX_SHOWN &&
    s.openCount >= REVIEW_MIN_OPENS &&
    s.accounts >= 1 &&
    !s.dismissed &&
    s.openCount >= s.snoozedUntilOpen
  );
}

// "나중에" 는 한 번만 미룬다. 이미 미뤘으면(값이 0보다 크면) "다시 묻지 않기"만 남긴다.
export function canSnoozeReview(snoozedUntilOpen: number): boolean {
  return snoozedUntilOpen === 0;
}

const SITE_URL = 'https://elitekid.github.io/popout-authenticator/';
const SITE_UTM = '?utm_source=extension&utm_medium=product&utm_campaign=pa-help';
// 사이트는 영어·한국어만 있다. 한국어 화면이면 /ko/ 쪽을 연다.
export function siteUrl(lang: string, page: 'home' | 'guides'): string {
  return SITE_URL + (lang === 'ko' ? 'ko/' : '') + (page === 'guides' ? 'guides/' : '') + SITE_UTM;
}

// 새 기능 소개: 버전 → 문구 키 배열. 다음 버전부터 항목을 더한다.
export function whatsNewFor(target: BrowserTarget = BROWSER_TARGET): Record<string, string[]> {
  // 전역 단축키는 크롬 계열 전용이라 firefox·safari 에서는 copy 줄을 뺀다.
  const copy = target === 'firefox' || target === 'safari' ? [] : ['popup.whatsNew.v102.copy'];
  return {
    '1.0.2': ['popup.whatsNew.v102.organize', 'popup.whatsNew.v102.capture', ...copy],
  };
}
export const WHATS_NEW: Record<string, string[]> = whatsNewFor();
