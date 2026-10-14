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
  lastUsedAt?: number;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number; // 휴지통(30일 뒤 실제 삭제)
};

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
  zoom: number; // 20~125
  language: string; // 'auto' 또는 언어 코드
  syncEnabled: boolean;
  syncPlaintextAllowed: boolean;
  clipboardClearAfterCopy: boolean;
  autofillOnCopy: boolean;
  autoSubmit: boolean;
  suggestionsEnabled: boolean;
  clockCheck: boolean;
  lockTiming: LockTiming;
};

export const DEFAULT_SETTINGS: Settings = {
  openMode: 'popup',
  view: 'normal',
  popupSize: 'medium',
  theme: 'system',
  avatars: false,
  listOnly: false,
  zoom: 100,
  language: 'auto',
  syncEnabled: true, // 잠금이 켜졌거나 평문 동기화를 허락했을 때만 실제로 동기화한다
  syncPlaintextAllowed: false,
  clipboardClearAfterCopy: false, // 켜면 선택 권한 clipboardRead 를 받는다
  autofillOnCopy: false,
  autoSubmit: true,
  suggestionsEnabled: true,
  clockCheck: true,
  lockTiming: 15,
};
