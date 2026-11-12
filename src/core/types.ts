// 계정·금고 파일·설정 형식. 브라우저 API 를 쓰지 않는다.

export type AccountType = 'totp' | 'hotp' | 'steam' | 'battle';
export type Algorithm = 'SHA-1' | 'SHA-256' | 'SHA-512';

export type Account = {
  id: string; // uuid
  type: AccountType;
  issuer: string;
  label: string;
  secret: Uint8Array; // 금고 안에서만 평문
  algorithm: Algorithm;
  digits: number; // 6~10 정수
  period: number; // 1~3600초
  counter?: number; // hotp
  group?: string; // 그룹 하나, 64자 이하
  note: string;
  pinned: boolean;
  matchHosts: string[];
  iconId?: string; // 내장 아이콘 id(ACCOUNT_ICONS). 없거나 모르는 값이면 이니셜 타일
  lastUsedAt?: number;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number; // 휴지통(30일 뒤 실제 삭제)
};

// svg 는 viewBox 0 0 24 24 안쪽 마크업(상수). hue 는 타일 색상.
export const ACCOUNT_ICONS: readonly { id: string; hue: number; svg: string }[] = [
  {
    id: 'key',
    hue: 38,
    svg: '<circle cx="7.5" cy="16.5" r="3.8"/><path d="M10.3 13.7 20 4M16.8 7.2l2.6 2.6M14.2 9.8l2 2"/>',
  },
  {
    id: 'mail',
    hue: 215,
    svg: '<rect x="3" y="5.5" width="18" height="13" rx="2.5"/><path d="m3.8 7.5 8.2 6 8.2-6"/>',
  },
  {
    id: 'work',
    hue: 28,
    svg: '<rect x="3" y="7.5" width="18" height="12" rx="2.5"/><path d="M8.5 7.5V6a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v1.5M3 13h18"/>',
  },
  {
    id: 'bank',
    hue: 152,
    svg: '<path d="M3 9.5 12 4l9 5.5M5.5 11v6.5M10 11v6.5M14 11v6.5M18.5 11v6.5M3 20h18"/>',
  },
  {
    id: 'cloud',
    hue: 198,
    svg: '<path d="M7.2 18.5h9.6a4.2 4.2 0 0 0 .4-8.38A5.6 5.6 0 0 0 6.6 9.4a4.6 4.6 0 0 0 .6 9.1Z"/>',
  },
  {
    id: 'code',
    hue: 262,
    svg: '<rect x="3" y="4.5" width="18" height="15" rx="2.5"/><path d="m9.5 9.5-2.5 2.5 2.5 2.5M14.5 9.5l2.5 2.5-2.5 2.5"/>',
  },
  {
    id: 'game',
    hue: 328,
    svg: '<path d="M7.5 7.5h9a4.5 4.5 0 0 1 4.4 5.4l-.9 4.3a2 2 0 0 1-3.5.9l-1.8-2.1h-5.4l-1.8 2.1a2 2 0 0 1-3.5-.9l-.9-4.3a4.5 4.5 0 0 1 4.4-5.4Z"/><path d="M8.5 10.5v3.5M6.75 12.25h3.5"/><circle cx="15.5" cy="11" r=".9" class="dot"/><circle cx="17.2" cy="13.4" r=".9" class="dot"/>',
  },
  {
    id: 'shop',
    hue: 14,
    svg: '<path d="M3 4h2.3l2.2 10.3a1.6 1.6 0 0 0 1.6 1.3h8.2a1.6 1.6 0 0 0 1.6-1.2L20.6 8H6.1"/><circle cx="9.6" cy="19.4" r="1.3"/><circle cx="17" cy="19.4" r="1.3"/>',
  },
  {
    id: 'social',
    hue: 300,
    svg: '<path d="M5 5.5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-7.5L7 21v-3.5H5a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2Z"/>',
  },
  {
    id: 'person',
    hue: 235,
    svg: '<circle cx="12" cy="8.5" r="3.6"/><path d="M5 20a7 7 0 0 1 14 0"/>',
  },
  {
    id: 'card',
    hue: 172,
    svg: '<rect x="3" y="5.5" width="18" height="13" rx="2.5"/><path d="M3 10h18M7 15h3.5"/>',
  },
  {
    id: 'crypto',
    hue: 48,
    svg: '<circle cx="12" cy="12" r="8.5"/><path d="M10 8v8M10 8h2.8a2 2 0 0 1 0 4H10M10 12h3.2a2 2 0 0 1 0 4H10M11 6.5V8M11 16v1.5"/>',
  },
  {
    id: 'server',
    hue: 245,
    svg: '<rect x="4" y="4" width="16" height="7" rx="2"/><rect x="4" y="13" width="16" height="7" rx="2"/><circle cx="8" cy="7.5" r=".9" class="dot"/><circle cx="8" cy="16.5" r=".9" class="dot"/>',
  },
  {
    id: 'shield',
    hue: 125,
    svg: '<path d="M12 3.2 19.5 6v5.6c0 4.5-3.1 8.1-7.5 9.4-4.4-1.3-7.5-4.9-7.5-9.4V6ZM9 12l2.1 2.1L15.2 10"/>',
  },
  {
    id: 'school',
    hue: 205,
    svg: '<path d="M2.5 9.2 12 4.7l9.5 4.5-9.5 4.5ZM6.5 11.2v4.3c0 1.5 2.5 3 5.5 3s5.5-1.5 5.5-3v-4.3M21.5 9.2v5"/>',
  },
  {
    id: 'home',
    hue: 18,
    svg: '<path d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5H15v-6H9v6H5.5A1.5 1.5 0 0 1 4 19Z"/>',
  },
  {
    id: 'globe',
    hue: 186,
    svg: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.4 2.6 3.5 5.5 3.5 8.5s-1.1 5.9-3.5 8.5c-2.4-2.6-3.5-5.5-3.5-8.5s1.1-5.9 3.5-8.5Z"/>',
  },
  {
    id: 'health',
    hue: 352,
    svg: '<path d="M12 20s-7.5-4.4-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.6-7.5 10-7.5 10Z"/>',
  },
];

export function accountIcon(iconId: string | undefined): (typeof ACCOUNT_ICONS)[number] | undefined {
  return ACCOUNT_ICONS.find((i) => i.id === iconId);
}

export type WrappedKey = {
  kind: 'none' | 'password' | 'prf' | 'recovery';
  kdf?: {
    name: 'argon2id' | 'hkdf' | 'pbkdf2';
    salt: string;
    iterations?: number;
    memoryKiB?: number;
    parallelism?: number;
  };
  credId?: string;
  iv: string;
  data: string;
};

export type VaultFile = {
  format: 'otpx-vault';
  version: 1;
  lock: 'none' | 'password' | 'password+prf';
  wrappedKeys: WrappedKey[];
  iv: string;
  data: string; // AES-GCM(금고 키, JSON(Account[]))
  count: number;
  checksum: string;
  savedAt: number;
  lockChangedAt?: number; // lock·wrappedKeys 를 마지막으로 바꾼 때. 동기화가 기기 사이 잠금 설정을 맞출 때 쓴다
};

export type ImportResult = {
  added: Account[];
  duplicates: number;
  failed: { source: string; reason: string }[];
};

export type LockTiming = 'every' | 5 | 15 | 60 | 'browser-close' | { minutes: number };

export type Settings = {
  openMode: 'popup' | 'window' | 'sidepanel';
  view: 'normal' | 'compact' | 'hidden';
  popupSize: 'small' | 'medium' | 'large';
  theme: 'light' | 'dark' | 'system';
  avatars: boolean;
  listOnly: boolean;
  sortByName: boolean; // 목록을 이름순으로 보기(저장된 순서는 그대로)
  zoom: number; // 20~125
  language: string; // 'auto' 또는 언어 코드
  syncEnabled: boolean;
  syncPlaintextAllowed: boolean;
  clipboardClearAfterCopy: boolean;
  clipboardClearSeconds: 30 | 60 | 120 | 300;
  autofillOnCopy: boolean;
  autoSubmit: boolean;
  suggestionsEnabled: boolean;
  clockCheck: boolean;
  lockTiming: LockTiming;
};

export function normalizeClipboardSeconds(value: unknown): Settings['clipboardClearSeconds'] {
  return value === 60 || value === 120 || value === 300 ? value : 30;
}

export const DEFAULT_SETTINGS: Settings = {
  openMode: 'popup',
  view: 'normal',
  popupSize: 'medium',
  theme: 'system',
  avatars: false,
  listOnly: false,
  sortByName: false,
  zoom: 100,
  language: 'auto',
  syncEnabled: true, // 잠금이 켜졌거나 평문 동기화를 허락했을 때만 실제로 동기화한다
  syncPlaintextAllowed: false,
  clipboardClearAfterCopy: false, // 켜면 선택 권한 clipboardRead 를 받는다
  clipboardClearSeconds: 30,
  autofillOnCopy: false,
  autoSubmit: true,
  suggestionsEnabled: true,
  clockCheck: true,
  lockTiming: 15,
};
