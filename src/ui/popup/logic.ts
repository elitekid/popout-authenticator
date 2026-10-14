// 팝업 목록의 순수 함수. 브라우저 API 를 쓰지 않는다(node 시험에서 import 된다).
import type { Account } from '../../core/types';

const DAY = 24 * 60 * 60 * 1000;
export const SNOOZE_MS = 7 * DAY;
const BACKUP_AGE_MS = 30 * DAY;

// 3자리씩 끊어 보여 준다. 예: '996554' → '996 554'
export function formatCode(code: string): string {
  return code.match(/.{1,3}/g)?.join(' ') ?? code;
}

type Searchable = Pick<Account, 'issuer' | 'label' | 'group' | 'note' | 'deletedAt'>;

// 휴지통은 빼고, 이름·서비스·그룹·메모에서 대소문자 무시 부분 일치. group 이 null 이면 전체.
export function filterAccounts<T extends Searchable>(
  accounts: T[],
  query: string,
  group: string | null = null,
): T[] {
  const q = query.trim().toLowerCase();
  return accounts.filter((a) => {
    if (a.deletedAt !== undefined) return false;
    if (group !== null && a.group !== group) return false;
    if (q === '') return true;
    return [a.issuer, a.label, a.group ?? '', a.note].some((s) => s.toLowerCase().includes(q));
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
// 스토어 등록이 끝나고 실제 공개 평가 주소가 정해질 때만 넣는다.
export const STORE_REVIEW_URL: string = '';

// 평가 요청: 팝업을 15번 이상 열었고 계정이 있으며, 닫지 않았고 미룬 횟수가 지났을 때.
export function shouldShowReview(s: {
  openCount: number;
  accounts: number;
  dismissed: boolean;
  snoozedUntilOpen: number;
}): boolean {
  return (
    s.openCount >= REVIEW_MIN_OPENS &&
    s.accounts >= 1 &&
    !s.dismissed &&
    s.openCount >= s.snoozedUntilOpen
  );
}

// 새 기능 소개: 버전 → 문구 키 배열. 다음 버전부터 항목을 더한다.
export const WHATS_NEW: Record<string, string[]> = {};
