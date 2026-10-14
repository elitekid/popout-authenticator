import { describe, expect, it } from 'vitest';
import {
  backupSignature,
  filterAccounts,
  formatCode,
  groupCounts,
  shouldShowBackupReminder,
  shouldShowReview,
  moveActive,
} from '../../src/ui/popup/logic';

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_800_000_000_000;

type Item = {
  id: string;
  issuer: string;
  label: string;
  group?: string;
  note: string;
  pinned: boolean;
  updatedAt: number;
  deletedAt?: number;
};

const item = (id: string, over: Partial<Item> = {}): Item => ({
  id,
  issuer: `Issuer-${id}`,
  label: `label-${id}`,
  note: '',
  pinned: false,
  updatedAt: 1,
  ...over,
});

describe('formatCode', () => {
  it('3자리씩 끊는다', () => {
    expect(formatCode('996554')).toBe('996 554');
    expect(formatCode('2041996554')).toBe('204 199 655 4');
    expect(formatCode('12345678')).toBe('123 456 78');
    expect(formatCode('CWDGV')).toBe('CWD GV');
  });
});

describe('filterAccounts', () => {
  const list = [
    item('a', { issuer: 'GitHub', label: 'alice@example.com', group: 'Work', note: 'main' }),
    item('b', { issuer: 'Bank', label: 'bob', group: 'Money', note: 'Savings card' }),
    item('c', { issuer: 'Mail', label: 'carol', note: '' }),
    item('d', { issuer: 'GitHub Old', label: 'dave', deletedAt: 5 }),
  ];
  const ids = (xs: Item[]) => xs.map((x) => x.id);

  it('이름·서비스·그룹·메모에서 부분 일치', () => {
    expect(ids(filterAccounts(list, 'hub', null))).toEqual(['a']);
    expect(ids(filterAccounts(list, 'bob', null))).toEqual(['b']);
    expect(ids(filterAccounts(list, 'money', null))).toEqual(['b']);
    expect(ids(filterAccounts(list, 'savings', null))).toEqual(['b']);
  });

  it('대소문자를 가리지 않는다', () => {
    expect(ids(filterAccounts(list, 'GITHUB', null))).toEqual(['a']);
    expect(ids(filterAccounts(list, 'CAROL', null))).toEqual(['c']);
  });

  it('그룹 필터', () => {
    expect(ids(filterAccounts(list, '', 'Work'))).toEqual(['a']);
    expect(ids(filterAccounts(list, 'o', 'Money'))).toEqual(['b']);
  });

  it('휴지통은 뺀다', () => {
    expect(ids(filterAccounts(list, '', null))).toEqual(['a', 'b', 'c']);
    expect(ids(filterAccounts(list, 'old', null))).toEqual([]);
  });
});

describe('수동 순서', () => {
  it('고정 표시와 검색은 저장 순서를 바꾸지 않는다', () => {
    const list = [item('a'), item('b', { pinned: true }), item('c')];
    expect(filterAccounts(list, '').map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });

  it('보이는 이웃 앞으로 옮겨도 숨은 계정과 휴지통을 보존한다', () => {
    const list = [item('a'), item('hidden'), item('trash', { deletedAt: 1 }), item('b'), item('c')];
    const moved = moveActive(list, 'c', 'b');
    expect(moved.map((x) => x.id)).toEqual(['a', 'hidden', 'trash', 'c', 'b']);
    expect(list.map((x) => x.id)).toEqual(['a', 'hidden', 'trash', 'b', 'c']);
  });

  it('저장 중 이웃이 사라졌으면 순서를 그대로 둔다', () => {
    const list = [item('a'), item('b')];
    expect(moveActive(list, 'a', 'missing')).toBe(list);
  });
});

describe('groupCounts', () => {
  it('그룹별 개수, 휴지통 제외', () => {
    const list = [
      item('a', { group: 'Work' }),
      item('b', { group: 'Work' }),
      item('c', { group: 'Home' }),
      item('d', { group: 'Home', deletedAt: 1 }),
      item('e'),
    ];
    expect(groupCounts(list)).toEqual([
      { name: 'Work', count: 2 },
      { name: 'Home', count: 1 },
    ]);
  });
});

describe('backupSignature', () => {
  it('휴지통을 빼고 정렬해 잇는다', () => {
    const sig = backupSignature([
      { id: 'b', updatedAt: 2 },
      { id: 'a', updatedAt: 1 },
      { id: 'x', updatedAt: 9, deletedAt: 3 },
    ]);
    expect(sig).toBe('a:1|b:2');
  });
});

describe('shouldShowBackupReminder', () => {
  const base = { activeCount: 3, sig: 's1', backupInfo: null, snoozeUntil: null, now: NOW };

  it('계정이 3개 미만이면 띠 없음', () => {
    expect(shouldShowBackupReminder({ ...base, activeCount: 2 })).toBe(false);
  });

  it('백업 기록이 없으면 보임', () => {
    expect(shouldShowBackupReminder(base)).toBe(true);
  });

  it('31일 전 백업 + 내용이 달라졌으면 보임', () => {
    const backupInfo = { at: NOW - 31 * DAY, sig: 'old' };
    expect(shouldShowBackupReminder({ ...base, backupInfo })).toBe(true);
  });

  it('31일 전 백업이어도 내용이 같으면 안 보임', () => {
    const backupInfo = { at: NOW - 31 * DAY, sig: 's1' };
    expect(shouldShowBackupReminder({ ...base, backupInfo })).toBe(false);
  });

  it('10일 전 백업이면 내용이 달라도 안 보임', () => {
    const backupInfo = { at: NOW - 10 * DAY, sig: 'old' };
    expect(shouldShowBackupReminder({ ...base, backupInfo })).toBe(false);
  });

  it('미룸이 남아 있으면 안 보임', () => {
    expect(shouldShowBackupReminder({ ...base, snoozeUntil: NOW + 3 * DAY })).toBe(false);
  });

  it('7일보다 먼 미룸 값은 시계 이상으로 보고 무시', () => {
    expect(shouldShowBackupReminder({ ...base, snoozeUntil: NOW + 30 * DAY })).toBe(true);
  });

  it('미룸이 지났으면 다시 보임', () => {
    expect(shouldShowBackupReminder({ ...base, snoozeUntil: NOW - 1 })).toBe(true);
  });
});

describe('shouldShowReview', () => {
  const ok = { openCount: 15, accounts: 1, dismissed: false, snoozedUntilOpen: 0 };

  it('15회 이상·계정 1개 이상·닫지 않음·미룸이 지났을 때만 보임', () => {
    expect(shouldShowReview({ ...ok, openCount: 14 })).toBe(false);
    expect(shouldShowReview(ok)).toBe(true);
    expect(shouldShowReview({ ...ok, accounts: 0 })).toBe(false);
    expect(shouldShowReview({ ...ok, dismissed: true })).toBe(false);
    expect(shouldShowReview({ ...ok, openCount: 30, snoozedUntilOpen: 65 })).toBe(false);
  });
});
