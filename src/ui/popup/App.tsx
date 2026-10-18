import { Fragment } from 'preact';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { WrongSecretError } from '../../core/crypto/errors';
import { supportsPasskeys } from '../../core/browser';
import { generateCode } from '../../core/otp';
import { buildOtpauth } from '../../core/uri';
import { fillCandidate, hostOf, matchesSite, suggestAccountIds } from '../../core/suggest';
import { DEFAULT_SETTINGS, type Account, type Settings } from '../../core/types';
import { readSiteUsage, recordSiteUse } from '../../store/site-usage';
import { moveToTrash } from '../../store/trash';
import { lastNormalWindow } from '../../store/browser-window';
import { LockedError } from '../../store/errors';
import {
  confirmRecoveryCode,
  isLocked,
  issueOneTimeKey,
  lockNow,
  unlockWithPassword,
  unlockWithRecoveryCode,
} from '../../store/lock';
import { checkEmptyRecovery } from '../../store/recover';
import { checkClock } from '../../store/clock';
import type { ClockState } from '../../core/clock';
import { NO_POLICY, readPolicy, type Policy } from '../../store/policy';
import { loadSettings, onSettingsChanged, saveSettings } from '../../store/settings';
import { syncRecoverySources } from '../../store/sync';
import {
  addDrafts,
  createVault,
  loadAccounts,
  onVaultChanged,
  readVaultFile,
  updateAccounts,
} from '../../store/vault';
import { onCodesHiddenChanged, readCodesHidden, toggleCodesHidden } from '../shared/codes-hidden';
import { CameraScanner } from '../shared/CameraScanner';
import { QrSvg } from '../shared/QrSvg';
import { reauthenticate } from '../shared/reauth';
import { passkeyErrorKey } from '../shared/passkey';
import { currentLang } from '../../i18n';
import { useT } from '../shared/use-t';
import { useClockCorrection } from '../shared/use-clock';
import { connectUiPort, type UiPort } from '../shared/ui-port';
import {
  SNOOZE_MS,
  avatarInitial,
  backupSignature,
  canSnoozeReview,
  filterAccounts,
  formatCode,
  groupSections,
  moveActive,
  normalizeGroupName,
  pruneFolded,
  REVIEW_LATER_OPENS,
  STORE_REVIEW_URL,
  shouldShowBackupReminder,
  shouldShowReview,
  siteUrl,
  UNGROUPED_KEY,
  visibleRows,
  WHATS_NEW,
  type BackupInfo,
} from './logic';
import { openDetachedWindow, openPasskeyUnlock } from './open-actions';
import { currentOpenName, type OpenName } from './open-name';
import { remainingSeconds, effectivePeriod, useCodes, type CodePair } from './use-codes';
import { ShareDialog } from './ShareDialog';
import type { PopupRoute } from './PopupScreen';
import { lazy, Suspense } from 'preact/compat';
const PopupScreen = lazy(() => import('./PopupScreen'));
import { openTaskWindow } from '../shared/screen-context';
import type { SectionId } from '../manage/sections';

type T = ReturnType<typeof useT>;
type Phase = 'loading' | 'recover' | 'locked' | 'list' | 'error';
type FillPermission = { origin: string; tabId: number; pageUrl: string; accountId: string };
type FillFeedback = {
  kind: 'pending' | 'success' | 'error';
  message: string;
  // onceHost: '이번만 넣기'에서 권한을 받은 뒤 다시 넣을 때도 같은 확인을 이어 간다.
  permission?: FillPermission & { host: string; onceHost?: string };
};

const MASKED = '••• •••';
const WARN_SECONDS = 5;
const COPIED_MS = 1500;
const NO_CODE_ACCOUNTS: Account[] = [];

// 24×24 선 아이콘.
const ICONS = {
  collapseHeader: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 9h18M9 6h6M9 16l3-3 3 3"/>',
  expandHeader: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 9h18M9 6h6M9 13l3 3 3-3"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  popout: '<rect x="3" y="7" width="13" height="13" rx="2.5"/><path d="M13 3h8v8M21 3l-9 9"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2.5"/><path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3"/>',
  gear: '<path d="M10.4 2h3.2l.5 2.5 1.9.8 2.1-1.4 2 2-1.4 2.1.8 1.9 2.5.5v3.2l-2.5.5-.8 1.9 1.4 2.1-2 2-2.1-1.4-1.9.8-.5 2.5h-3.2l-.5-2.5-1.9-.8-2.1 1.4-2-2 1.4-2.1-.8-1.9-2.5-.5v-3.2l2.5-.5.8-1.9-1.4-2.1 2-2 2.1 1.4 1.9-.8Z"/><circle cx="12" cy="12" r="3.2"/>',
  fill: '<path d="M3 12h11"/><path d="m10 7 5 5-5 5"/><path d="M20 5v14"/>',
  more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  next: '<path d="M5 12h12"/><path d="m13 7 5 5-5 5"/>',
  history: '<path d="M3 11a9 9 0 1 1 2.6 7M3 4v7h7M12 7v5l3 2"/>',
  backup: '<path d="M12 14.5V5M8 8.5l4-3.5 4 3.5M4.5 14v4a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-4"/>',
  qr: '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><path d="M14 14h2v2h-2zM18 18h2v2h-2zM18 14h2M14 18v2"/>',
  share: '<path d="M12 4v11"/><path d="m8 8 4-4 4 4"/><path d="M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 8-8M16 7l2 2M14 9l2 2"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  star: '<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9Z"/>',
} as const;

function Icon({ name }: { name: keyof typeof ICONS }) {
  return (
    <svg
      class="i"
      viewBox="0 0 24 24"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: ICONS[name] }}
    />
  );
}

// 남은 초 → 색 섞음. 11초 이상은 청록, 마지막 10초는 청록→주황→빨강. 줄의 --p1·--p2 로 쓴다.
function warnStyle(s: number): string {
  const u = s >= 11 ? 0 : Math.min(1, (10 - s) / 9);
  const p1 = u <= 0.5 ? u * 200 : 100;
  const p2 = u <= 0.5 ? 0 : (u - 0.5) * 200;
  return `--p1:${Math.round(p1)}%;--p2:${Math.round(p2)}%`;
}

// 브라우저의 애니메이션 시계로 연속 진행한다. 매 프레임 목록을 다시 그리지 않는다.
function Ring({ period, correction, nowMs }: { period: number; correction: number; nowMs: number }) {
  const progress = useRef<SVGCircleElement>(null);
  const animation = useRef<Animation | null>(null);
  const duration = (Number.isFinite(period) && period > 0 ? period : 30) * 1000;
  useLayoutEffect(() => {
    if (!progress.current) return;
    const running = progress.current.animate(
      [{ strokeDashoffset: '0' }, { strokeDashoffset: '100' }],
      { duration, iterations: Infinity, easing: 'linear' },
    );
    running.currentTime = ((Date.now() + correction) % duration + duration) % duration;
    animation.current = running;
    return () => { running.cancel(); animation.current = null; };
  }, [duration, correction]);
  // 절전 복귀나 시스템 시계 변경만 보정한다. 평소에는 애니메이션을 다시 시작하지 않는다.
  useLayoutEffect(() => {
    const running = animation.current;
    if (!running || typeof running.currentTime !== 'number') return;
    const elapsed = ((Date.now() + correction) % duration + duration) % duration;
    const position = running.currentTime % duration;
    const difference = Math.abs(elapsed - position);
    if (Math.min(difference, duration - difference) > 120) running.currentTime = elapsed;
  }, [nowMs, duration, correction]);
  return (
    <svg class="ring" viewBox="0 0 22 22" aria-hidden="true">
      <circle class="track" cx="11" cy="11" r="9.25" />
      <circle ref={progress} class="progress" cx="11" cy="11" r="9.25" pathLength="100"
        stroke-dasharray="100 100" />
    </svg>
  );
}

// 발급자 이름 → 색상환 각도(가벼운 FNV-1a).
function tileHue(issuer: string): number {
  const s = issuer.toLowerCase();
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 360;
}

// '123 456' → 세 자리씩 span. 사이 공백 글자는 남겨 두되(복사·읽기용) flex 안이라 그려지지 않는다.
function CodeGroups({ text }: { text: string }) {
  const parts = text.split(' ');
  return (
    <>
      {parts.map((part, i) => (
        <Fragment key={i}>
          {i > 0 && ' '}
          <span>{part}</span>
        </Fragment>
      ))}
    </>
  );
}

async function activeTabUrl(): Promise<string | undefined> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab?.url;
  } catch {
    return undefined;
  }
}

// 처음 추천 기준 주소: 창은 연 순간의 탭, 사이드 패널은 지금 탭, 팝업은 지금 탭.
async function initialTabUrl(name: OpenName): Promise<string | undefined> {
  if (name !== 'window') return activeTabUrl();
  try {
    const got = await chrome.storage.session.get('openerUrl');
    return typeof got.openerUrl === 'string' ? got.openerUrl : undefined;
  } catch {
    return undefined;
  }
}

// 탭 따라가기: 마지막으로 포커스된 일반 창의 활성 탭 주소
async function followedTabUrl(): Promise<string | undefined> {
  try {
    const win = await lastNormalWindow();
    if (win?.id === undefined) return undefined;
    const [tab] = await chrome.tabs.query({ active: true, windowId: win.id });
    return tab?.url;
  } catch {
    return undefined;
  }
}

// 복사·기억에 쓰는 '지금 탭' 주소: 팝업은 지금 탭, 창·사이드 패널은 따라간 탭 또는 연 순간의 탭.
async function currentSiteUrl(name: OpenName): Promise<string | undefined> {
  if (name === 'popup') return activeTabUrl();
  return (await followedTabUrl()) ?? initialTabUrl(name);
}

// 동기화 저장소를 못 읽으면 복구 자료가 있을 수 있으니 새 금고를 만들지 않고 복구 안내로 간다.
let syncUnreadable = false;
async function safeRecoverySources() {
  try {
    syncUnreadable = false;
    return await syncRecoverySources();
  } catch {
    syncUnreadable = true;
    return [];
  }
}

function asBackupInfo(raw: unknown): BackupInfo | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { at, sig } = raw as Partial<BackupInfo>;
  return typeof at === 'number' && typeof sig === 'string' ? { at, sig } : null;
}

function asNumber(raw: unknown): number | null {
  return typeof raw === 'number' ? raw : null;
}

// 잠금 권유: 최대 3회, '나중에' 는 14일 쉰다.
type LockNudge = { count: number; until: number };
const LOCK_NUDGE_MAX = 3;
const LOCK_NUDGE_LATER_MS = 14 * 24 * 60 * 60 * 1000;

function asLockNudge(raw: unknown): LockNudge {
  if (typeof raw !== 'object' || raw === null) return { count: 0, until: 0 };
  const { count, until } = raw as Partial<LockNudge>;
  return {
    count: typeof count === 'number' ? count : 0,
    until: typeof until === 'number' ? until : 0,
  };
}

// 평가 요청 기록: 연 횟수, 평가하기로 닫았는지, 나중에로 미룬 횟수.
type ReviewState = { openCount: number; dismissed: boolean; snoozedUntilOpen: number };

type DragGesture = {
  id: string;
  pointerId: number;
  x: number;
  y: number;
  lastY: number;
  started: boolean;
  target: HTMLElement;
  row: HTMLElement;
  rows: { id: string; top: number; height: number }[];
  from: number;
  scrollTop: number;
  scale: number;
  offset: number;
  // 묶음 보기에서 놓을 수 있는 자리 범위(옮기는 줄을 뺀 목록 기준). 없으면 제한 없음.
  min?: number;
  max?: number;
};

// 접힌 그룹 기록(popupFoldedGroups)을 문자열 배열로 읽는다.
function asFolded(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [];
}

// 복구 코드는 공백·하이픈을 빼고 대문자로 넘긴다.
function normalizeRecoveryCode(input: string): string {
  return input.replace(/[\s-]/g, '').toUpperCase();
}

// 새 복구 코드는 4글자마다 띄어 보인다.
function spacedCode(code: string): string {
  return code.replace(/(.{4})(?=.)/g, '$1 ');
}

export function App() {
  const openName = currentOpenName();
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  // 목록만 보기는 분리 창에서만 적용하고, 저장한 선택은 그대로 둔다.
  const listOnly = openName === 'window' && settings.listOnly;
  const t = useT(settings.language);
  const lang = currentLang(settings.language);
  const [phase, setPhase] = useState<Phase>('loading');
  const [screens, setScreens] = useState<PopupRoute[]>([]);
  const [screenForward, setScreenForward] = useState(true);
  const navigate = useCallback((route: PopupRoute) => {
    passkeyAbort.current?.abort();
    if (listRef.current) savedListScroll.current = listRef.current.scrollTop;
    setMenu(null);
    setDrag(null);
    setScreenForward(true);
    setScreens((stack) => {
      const current = stack[stack.length - 1];
      return current?.section === route.section && current.editId === route.editId && current.historyId === route.historyId && current.tab === route.tab
        ? stack : [...stack, route];
    });
  }, []);
  const openManage = (section: SectionId) => navigate({ section });
  const screenBack = useCallback(() => {
    setScreenForward(false);
    setScreens((stack) => stack.slice(0, -1));
  }, []);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [lockEnabled, setLockEnabled] = useState(false);
  const [suggested, setSuggested] = useState<string[]>([]);
  // 복사 이력 추천과 분리한다. 바로 넣기는 지금 사이트에서 하나로 정해진 계정만.
  const [inlineFillId, setInlineFillId] = useState<string | null>(null);
  // 열린 작은 메뉴: 'add' · 'row:<계정 id>'
  const [menu, setMenu] = useState<string | null>(null);
  const [backupInfo, setBackupInfo] = useState<BackupInfo | null>(null);
  const [snoozeUntil, setSnoozeUntil] = useState<number | null>(null);
  const [codesHidden, setCodesHidden] = useState(false);
  const [codeAccessError, setCodeAccessError] = useState<string | null>(null);
  const [fillFeedback, setFillFeedback] = useState<FillFeedback | null>(null);
  const filling = useRef(false);
  const [query, setQuery] = useState('');
  // 접힌 그룹 이름. 열 때 한 번 읽고 그 키가 바뀔 때만 다시 읽는다.
  const [foldedGroups, setFoldedGroups] = useState<string[]>([]);
  const foldedRef = useRef<string[]>([]);
  const [selected, setSelected] = useState(0);
  // 마우스로 훑는 동안 계정 ID만 기억한다. hover는 목록 전체를 다시 그리지 않는다.
  const hoveredId = useRef<string | null>(null);
  const [deleteAsk, setDeleteAsk] = useState<{ id: string; name: string } | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState(false);
  const deleting = useRef(false);
  const deleteReturnId = useRef<string | null>(null);
  const deleteDialog = useRef<HTMLFormElement>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  // 아래 가운데 작은 알림에 보일 이름(발급자, 없으면 계정 이름).
  const [toastName, setToastName] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  // 시계 확인: 열 때 한 번. 띠는 이 팝업에서만 닫는다(저장 안 함).
  const correction = useClockCorrection();
  const [clock, setClock] = useState<{ state: ClockState; offsetMs: number } | null>(null);
  const [clockDismissed, setClockDismissed] = useState(false);
  const clockAskedRef = useRef(false);
  const [password, setPassword] = useState('');
  const [wrong, setWrong] = useState<'none' | 'wrong' | 'failed'>('none');
  // 잠금 화면: 복구 코드로 풀기, 패스키 감싸기 여부, 풀고 난 뒤 보여 줄 새 복구 코드.
  const [unlockMode, setUnlockMode] = useState<'password' | 'recovery'>('password');
  const [recoveryInput, setRecoveryInput] = useState('');
  const [hasPrf, setHasPrf] = useState(false);
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const [passkeyError, setPasskeyError] = useState<string | null>(null);
  const passkeyAbort = useRef<AbortController | null>(null);
  const [newRecovery, setNewRecovery] = useState<string | null>(null);
  const [recoveryCopied, setRecoveryCopied] = useState(false);
  // 복구 코드로 푸는 동안은 세션 키·금고 변화가 목록으로 넘기지 않게 한다.
  const recoveryBusyRef = useRef(false);
  // 다른 창·자동 잠금으로 잠길 때마다 오른다.
  const lockSeq = useRef(0);
  // 잠금 권유: 열 때 한 번 읽는다(null 이면 아직 못 읽음).
  const [lockNudge, setLockNudge] = useState<LockNudge | null>(null);
  // 관리자 정책: 첫 그리기는 정책 없음으로 두고 읽으면 바꾼다.
  const [policy, setPolicy] = useState<Policy>(NO_POLICY);
  // 평가 요청·새 기능 소개: 열 때 한 번 읽는다(null 이면 아직 못 읽음).
  const [review, setReview] = useState<ReviewState | null>(null);
  // 평가 요청은 이번에 연 창에서 코드 복사·넣기가 한 번 된 뒤에만 보인다(저장하지 않음).
  const [usedCode, setUsedCode] = useState(false);
  const [whatsNew, setWhatsNew] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [scanned, setScanned] = useState({ added: 0, duplicates: 0, failed: 0 });
  const [qrError, setQrError] = useState<'capture' | 'save' | null>(null);
  const [drag, setDrag] = useState<{ id: string; to: number } | null>(null);
  const gesture = useRef<DragGesture | null>(null);
  const dragClick = useRef<string | null>(null);
  const [remember, setRemember] = useState<{ id: string; host: string } | null>(null);
  // 지정 사이트가 아닌 곳에 넣으려 할 때 계정 줄에 띄우는 확인.
  const [mismatch, setMismatch] = useState<{ id: string; host: string; close: boolean } | null>(null);
  // QR 보기·코드 공유: 잠금이 켜져 있으면 비밀번호를 다시 확인한 뒤 연다.
  const [qrAsk, setQrAsk] = useState<{ id: string; kind: 'qr' | 'share' } | null>(null);
  const [qrView, setQrView] = useState<{ text: string; name: string } | null>(null);
  const [shareAccount, setShareAccount] = useState<Account | null>(null);
  const [qrPassword, setQrPassword] = useState('');
  const [qrWrong, setQrWrong] = useState<'none' | 'wrong' | 'failed'>('none');
  // 재확인 도중 닫거나 잠그면 번호를 올려, 뒤늦게 끝난 확인이 QR·공유 창을 열지 못하게 한다.
  const qrSeq = useRef(0);
  const closeQrAsk = () => {
    qrSeq.current++;
    setQrAsk(null);
    setQrPassword('');
  };
  // 이 팝업에서 '아니요' 한 사이트는 다시 묻지 않는다.
  const declinedRef = useRef(new Set<string>());

  const portRef = useRef<UiPort | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const savedListScroll = useRef(0);
  useLayoutEffect(() => {
    if (screens.length === 0 && phase === 'list' && listRef.current) {
      listRef.current.scrollTop = savedListScroll.current;
    }
  }, [screens.length, phase]);
  const clearDrag = useCallback(() => {
    const current = gesture.current;
    gesture.current = null;
    if (current) {
      current.row.style.removeProperty('--drag-y');
      if (current.pointerId >= 0 && current.target.hasPointerCapture(current.pointerId)) current.target.releasePointerCapture(current.pointerId);
    }
    setDrag(null);
  }, []);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const loadSeq = useRef(0);
  const hiddenSeq = useRef(0);
  const followRef = useRef(false);
  const activeRef = useRef<Account[]>([]);
  const visibleRef = useRef<Account[]>([]);
  // 묶음 보기 중인지(드래그·키보드 순서 변경이 같은 묶음 안으로 제한된다).
  const groupedRef = useRef(false);
  const [tabsGranted, setTabsGranted] = useState<boolean | null>(null);
  const [tabsDismissed, setTabsDismissed] = useState(false);

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    const stale = () => seq !== loadSeq.current;
    const hiddenAtStart = hiddenSeq.current;
    try {
      const [loadedSettings, local, hidden, loadedPolicy] = await Promise.all([
        loadSettings(),
        chrome.storage.local.get(['backupInfo', 'backupSnoozeUntil']),
        readCodesHidden(),
        readPolicy(),
      ]);
      if (stale()) return;
      setSettings(loadedSettings);
      setPolicy(loadedPolicy);
      setBackupInfo(asBackupInfo(local.backupInfo));
      setSnoozeUntil(asNumber(local.backupSnoozeUntil));
      // 화면 그리기를 기다리게 하지 않는다.
      if (loadedSettings.clockCheck && !clockAskedRef.current) {
        clockAskedRef.current = true;
        void checkClock().then(
          (result) => setClock(result ? { state: result.state, offsetMs: result.offsetMs } : null),
          () => undefined,
        );
      }
      // 읽는 사이 구독이 새 값을 받았으면 오래된 읽기 값으로 덮지 않는다.
      if (hiddenSeq.current === hiddenAtStart) setCodesHidden(hidden);

      let file = await readVaultFile();
      if (!file) {
        const found = await checkEmptyRecovery(safeRecoverySources);
        if (stale()) return;
        if (found.length > 0 || syncUnreadable) {
          setAccounts([]);
          setPhase('recover');
          return;
        }
        try {
          await createVault();
        } catch {
          // 다른 창이 먼저 만들었을 수 있다. 아래에서 다시 읽는다.
        }
        file = await readVaultFile();
        if (stale()) return;
      }
      setLockEnabled(file !== null && file.lock !== 'none');
      setHasPrf(supportsPasskeys() && file !== null && file.wrappedKeys.some((k) => k.kind === 'prf'));
      if (await isLocked()) {
        if (stale()) return;
        setAccounts([]);
        setPhase('locked');
        return;
      }
      const loaded = await loadAccounts();
      if (stale()) return;
      const active = loaded.filter((a) => a.deletedAt === undefined);
      const url = followRef.current ? await followedTabUrl() : await initialTabUrl(openName);
      if (stale()) return;
      const siteUsage = loadedSettings.suggestionsEnabled ? await readSiteUsage() : {};
      if (stale()) return;
      setSuggested(
        loadedSettings.suggestionsEnabled ? suggestAccountIds(active, { url, usage: siteUsage }) : [],
      );
      setInlineFillId(
        loadedSettings.suggestionsEnabled && (openName === 'popup' || followRef.current)
          ? fillCandidate(active, { url, usage: siteUsage })
          : null,
      );
      setAccounts(loaded);
      setPhase('list');
    } catch (error) {
      if (stale()) return;
      if (error instanceof LockedError) {
        setAccounts([]);
        setPhase('locked');
      } else {
        setPhase('error');
      }
    }
  }, [openName]);

  // 시작 + 포트 + 다른 창의 변화 구독
  useEffect(() => {
    const port = connectUiPort();
    portRef.current = port;
    void load();
    const offVault = onVaultChanged(() => {
      if (!recoveryBusyRef.current) void load();
    });
    const offSettings = onSettingsChanged((s) => setSettings(s));
    const offHidden = onCodesHiddenChanged((hidden) => {
      hiddenSeq.current++;
      setCodesHidden(hidden);
    });
    const onLocal = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'session' && 'vaultKey' in changes) {
        // 다른 창·자동 잠금으로 잠기면 바로 지우고, 풀리면 다시 읽는다.
        if (changes.vaultKey.newValue === undefined) {
          passkeyAbort.current?.abort();
          loadSeq.current++;
          lockSeq.current++;
          // 복구 코드로 푼 뒤 보이던 새 코드·입력도 걷는다.
          setScreens([]);
          setNewRecovery(null);
          setRecoveryInput('');
          closeQrAsk();
          setQrView(null);
          setShareAccount(null);
          setDeleteAsk(null);
          setDeleteError(false);
          setFillFeedback(null);
          setMismatch(null);
          setMenu(null);
          setAccounts([]);
          setPhase((prev) => (prev === 'list' ? 'locked' : prev));
        }
        if (!recoveryBusyRef.current) void load();
        return;
      }
      if (area !== 'local') return;
      if ('lockNudge' in changes) setLockNudge(asLockNudge(changes.lockNudge.newValue));
      if ('popupFoldedGroups' in changes) {
        const next = asFolded(changes.popupFoldedGroups.newValue);
        foldedRef.current = next;
        setFoldedGroups(next);
      }
      if ('backupInfo' in changes) setBackupInfo(asBackupInfo(changes.backupInfo.newValue));
      if ('backupSnoozeUntil' in changes) setSnoozeUntil(asNumber(changes.backupSnoozeUntil.newValue));
      // 다른 창(설정의 '지금 확인' 등)에서 다시 잰 결과로 경고 띠를 맞춘다.
      if ('clock' in changes) {
        const next = changes.clock.newValue as { state?: unknown; offsetMs?: unknown } | undefined;
        setClock(
          next && (next.state === 'ok' || next.state === 'off' || next.state === 'unknown') &&
            typeof next.offsetMs === 'number'
            ? { state: next.state, offsetMs: next.offsetMs }
            : null,
        );
      }
    };
    chrome.storage.onChanged.addListener(onLocal);
    return () => {
      chrome.storage.onChanged.removeListener(onLocal);
      offVault();
      offSettings();
      offHidden();
      port.close();
      portRef.current = null;
    };
  }, [load]);

  useEffect(() => {
    const cancel = () => passkeyAbort.current?.abort();
    window.addEventListener('pagehide', cancel);
    return () => {
      window.removeEventListener('pagehide', cancel);
      cancel();
    };
  }, []);

  // 잠금 권유 기록은 열 때 한 번만 읽는다.
  useEffect(() => {
    void chrome.storage.local.get('lockNudge').then(
      (got) => setLockNudge((prev) => prev ?? asLockNudge(got.lockNudge)),
      () => setLockNudge((prev) => prev ?? { count: LOCK_NUDGE_MAX, until: 0 }),
    );
  }, []);

  // 접힌 그룹은 열 때 한 번 읽는다.
  useEffect(() => {
    void chrome.storage.local.get('popupFoldedGroups').then(
      (got) => {
        const next = asFolded(got.popupFoldedGroups);
        foldedRef.current = next;
        setFoldedGroups(next);
      },
      () => undefined,
    );
  }, []);

  // 열 때 한 번: 연 횟수를 올리고(평가를 닫았으면 올리지 않음) 새 기능 소개 대기 값을 읽는다.
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const got = await chrome.storage.local.get([
          'openCount',
          'reviewDismissed',
          'reviewSnoozedUntilOpen',
          'pendingWhatsNew',
        ]);
        const dismissed = got.reviewDismissed === true;
        const stored = asNumber(got.openCount) ?? 0;
        const openCount = dismissed || !STORE_REVIEW_URL ? stored : stored + 1;
        if (!dismissed && STORE_REVIEW_URL) await chrome.storage.local.set({ openCount });
        if (alive) {
          setReview({ openCount, dismissed, snoozedUntilOpen: asNumber(got.reviewSnoozedUntilOpen) ?? 0 });
        }
        const pending = typeof got.pendingWhatsNew === 'string' ? got.pendingWhatsNew : null;
        if (pending === null) return;
        if ((WHATS_NEW[pending]?.length ?? 0) > 0) {
          if (alive) setWhatsNew(pending);
        } else {
          // 소개할 항목이 없는 버전은 보이지 않고 본 것으로 친다.
          await chrome.storage.local.set({ lastSeenWhatsNewVersion: pending });
          await chrome.storage.local.remove('pendingWhatsNew');
        }
      } catch {
        // 평가 요청·새 기능 소개는 없어도 되니 읽기·저장 실패는 넘어간다.
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // 창·사이드 패널: tabs 권한이 있는지, 안내를 이미 닫았는지 읽는다.
  useEffect(() => {
    if (openName === 'popup') return;
    const check = () =>
      void chrome.permissions
        .contains({ permissions: ['tabs'] })
        .then(setTabsGranted, () => setTabsGranted(false));
    check();
    void chrome.storage.local.get('tabsFollowDismissed').then((got) => {
      setTabsDismissed(got.tabsFollowDismissed === true);
    }, () => undefined);
    // 다른 창에서 허락·회수해도 따라간다.
    chrome.permissions.onAdded.addListener(check);
    chrome.permissions.onRemoved.addListener(check);
    // @types/chrome 에 removeListener 가 빠져 있어 일반 이벤트로 본다.
    type Ev = { removeListener: (fn: () => void) => void };
    return () => {
      (chrome.permissions.onAdded as unknown as Ev).removeListener(check);
      (chrome.permissions.onRemoved as unknown as Ev).removeListener(check);
    };
  }, [openName]);

  const follow =
    openName !== 'popup' && tabsGranted === true && settings.suggestionsEnabled && phase === 'list';
  useEffect(() => {
    followRef.current = follow;
    if (!follow) {
      if (openName !== 'popup') setInlineFillId(null);
      return;
    }
    let alive = true;
    let seq = 0;
    // 계정 목록은 다시 읽지 않고 추천만 다시 계산한다.
    const refresh = async () => {
      const mine = ++seq;
      // 새 탭을 읽는 동안 이전 사이트의 넣기 단추·확인 안내는 남겨 두지 않는다.
      setInlineFillId(null);
      setMismatch(null);
      const [url, siteUsage] = await Promise.all([followedTabUrl(), readSiteUsage()]);
      if (!alive || mine !== seq) return;
      const next = suggestAccountIds(activeRef.current, { url, usage: siteUsage });
      setInlineFillId(fillCandidate(activeRef.current, { url, usage: siteUsage }));
      // 결과가 같으면 다시 그리지 않는다.
      setSuggested((prev) => (prev.join('|') === next.join('|') ? prev : next));
    };
    const refreshFromBrowserWindow = async (windowId: number) => {
      if (windowId === chrome.windows.WINDOW_ID_NONE) return;
      try {
        const changedWindow = await chrome.windows.get(windowId);
        // 분리 창을 누르는 순간에는 기존 넣기 단추를 유지한다.
        if (alive && changedWindow.type === 'normal') await refresh();
      } catch {
        // 이벤트 뒤 닫힌 창은 무시한다.
      }
    };
    const onUpdated = (_id: number, info: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) => {
      if (info.url !== undefined && tab.active) void refreshFromBrowserWindow(tab.windowId);
    };
    const onActivated = (info: chrome.tabs.TabActiveInfo) => void refreshFromBrowserWindow(info.windowId);
    const onFocus = (windowId: number) => void refreshFromBrowserWindow(windowId);
    chrome.tabs.onActivated.addListener(onActivated);
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.windows.onFocusChanged.addListener(onFocus);
    void refresh();
    return () => {
      alive = false;
      followRef.current = false;
      chrome.tabs.onActivated.removeListener(onActivated);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      chrome.windows.onFocusChanged.removeListener(onFocus);
    };
  }, [follow]);

  const allowTabs = async () => {
    try {
      if (await chrome.permissions.request({ permissions: ['tabs'] })) setTabsGranted(true);
    } catch {
      // 거절·실패면 창을 연 순간 기준을 유지한다.
    }
  };

  const dismissTabs = () => {
    setTabsDismissed(true);
    void chrome.storage.local.set({ tabsFollowDismissed: true });
  };

  // 테마
  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
  }, [settings.theme]);

  const listShown = phase === 'list' && screens.length === 0 && newRecovery === null &&
    qrAsk === null && qrView === null && shareAccount === null && !cameraOpen && deleteAsk === null;
  // 보이는 목록만 초 경계에 맞춰 갱신한다. 설정·잠금·다른 화면 뒤에서는 계산을 멈춘다.
  useEffect(() => {
    if (!listShown) return;
    let id: ReturnType<typeof setTimeout> | undefined;
    const tick = () => {
      const now = Date.now();
      setNowMs(now);
      id = setTimeout(tick, 1000 - (((now + correction) % 1000 + 1000) % 1000) + 5);
    };
    const syncVisibility = () => {
      clearTimeout(id);
      if (!document.hidden) tick();
    };
    syncVisibility();
    document.addEventListener('visibilitychange', syncVisibility);
    return () => { clearTimeout(id); document.removeEventListener('visibilitychange', syncVisibility); };
  }, [correction, listShown]);

  useEffect(
    () => () => {
      clearTimeout(copiedTimer.current);
      clearTimeout(toastTimer.current);
    },
    [],
  );

  // 작은 메뉴: 바깥을 누르면 닫는다(여는 단추를 누르는 것은 그 단추가 맡는다).
  useEffect(() => {
    if (menu === null) return;
    const onDown = (e: PointerEvent) => {
      if ((e.target as HTMLElement | null)?.closest('.menu, [data-menu-toggle]')) return;
      setMenu(null);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [menu]);

  useLayoutEffect(() => {
    const dialog = deleteDialog.current;
    if (!deleteAsk || !dialog) return;
    const backdrop = dialog.parentElement!;
    const background = [...backdrop.parentElement!.children]
      .filter((element): element is HTMLElement => element instanceof HTMLElement && element !== backdrop)
      .map((element) => ({ element, inert: element.inert }));
    for (const { element } of background) element.inert = true;
    const focusCancel = () => {
      const target = dialog.querySelector<HTMLElement>('[data-role="popup-delete-cancel"]:not(:disabled)') ?? dialog;
      target.focus({ preventScroll: true });
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        if (!deleting.current) setDeleteAsk(null);
      } else if (event.key === 'Tab') {
        event.preventDefault();
        event.stopPropagation();
        const buttons = [...dialog.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
        if (buttons.length === 0) { dialog.focus({ preventScroll: true }); return; }
        const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next = current < 0 ? (event.shiftKey ? buttons.length - 1 : 0)
          : (current + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length;
        buttons[next]?.focus({ preventScroll: true });
      }
    };
    const focus = (event: FocusEvent) => { if (!dialog.contains(event.target as Node)) focusCancel(); };
    document.addEventListener('keydown', key, true);
    document.addEventListener('focusin', focus);
    focusCancel();
    return () => {
      document.removeEventListener('keydown', key, true);
      document.removeEventListener('focusin', focus);
      for (const { element, inert } of background) element.inert = inert;
      if (listRef.current?.isConnected && deleteReturnId.current) {
        const id = deleteReturnId.current;
        deleteReturnId.current = null;
        const target = listRef.current?.querySelector<HTMLElement>(`[data-account-id="${id}"] [data-role="more"]`) ?? searchRef.current;
        target?.focus({ preventScroll: true });
      }
    };
  }, [deleteAsk]);

  // 코드를 가리면 공유 창과 공유 재확인을 닫는다.
  useEffect(() => {
    if (!codesHidden) return;
    setShareAccount(null);
    if (qrAsk?.kind === 'share') closeQrAsk();
  }, [codesHidden]);

  useEffect(() => {
    if (!listOnly) return;
    setQuery('');
    setSelected(0);
  }, [listOnly]);

  const setListOnly = async (listOnly: boolean) => {
    try { setSettings(await saveSettings({ listOnly })); }
    catch { setCodeAccessError('common.loadError'); }
  };

  const active = useMemo(() => accounts.filter((a) => a.deletedAt === undefined), [accounts]);
  activeRef.current = active;
  // 계정 목록·접힘이 바뀔 때만 다시 나눈다(매초 시계에는 움직이지 않는다).
  const allSections = useMemo(() => groupSections(active, foldedGroups), [active, foldedGroups]);
  const groupNames = useMemo(
    () => allSections.flatMap((s) => (s.name === null ? [] : [s.name])),
    [allSections],
  );
  // 그룹이 하나라도 있고 검색 중이 아니면 그룹별 묶음으로 보여 준다. 목록만 보기는 전체를 그대로.
  const grouped = !listOnly && query.trim() === '' && groupNames.length > 0;
  const sections = grouped ? allSections : null;
  // 금고에 저장한 순서를 유지한다. 묶음 보기에서는 접힌 묶음의 줄을 뺀다.
  const visible = useMemo(
    () => (sections ? visibleRows(sections) : listOnly ? active : filterAccounts(active, query)),
    [sections, listOnly, active, query],
  );
  visibleRef.current = visible;
  groupedRef.current = grouped;
  // 검색·잠금·다른 창의 계정 변경 때도 떠 있는 줄을 남기지 않는다.
  useLayoutEffect(() => { clearDrag(); hoveredId.current = null; }, [visible, phase, screens.length, settings.view, clearDrag]);
  useLayoutEffect(() => {
    if (phase !== 'list' || screens.length > 0) {
      setDeleteAsk(null);
      setDeleteError(false);
      setMenu(null);
    }
  }, [phase, screens.length]);
  const selectedIndex = Math.min(selected, Math.max(0, visible.length - 1));
  // 코드 계산·남은 초에는 보정한 시각을 쓴다.
  const codeNowMs = nowMs + correction;
  const codes = useCodes(phase === 'list' ? visible : NO_CODE_ACCOUNTS, codeNowMs, listShown || phase !== 'list');
  const signature = useMemo(() => backupSignature(active), [active]);

  const showBackup =
    phase === 'list' &&
    shouldShowBackupReminder({
      activeCount: active.length,
      sig: signature,
      backupInfo,
      snoozeUntil,
      now: nowMs,
    });

  // 비밀번호를 강제하는데 잠금이 꺼져 있으면 추가·캡처·카메라를 잠금 설정으로 돌린다.
  const needPassword = phase === 'list' && policy.enforcePassword && !lockEnabled;
  const whatsNewItems = whatsNew !== null ? (WHATS_NEW[whatsNew] ?? []) : [];

  const showLockNudge =
    phase === 'list' &&
    !needPassword &&
    !lockEnabled &&
    active.length >= 2 &&
    !showBackup &&
    lockNudge !== null &&
    lockNudge.count < LOCK_NUDGE_MAX &&
    nowMs >= lockNudge.until;

  // 다른 띠가 보이거나 검색 중이면 평가 요청 카드는 숨긴다.
  const showReview =
    STORE_REVIEW_URL !== '' &&
    phase === 'list' &&
    review !== null &&
    usedCode &&
    query.trim() === '' &&
    !showBackup &&
    !showLockNudge &&
    !needPassword &&
    whatsNew === null &&
    shouldShowReview({ ...review, accounts: active.length });

  // 팝업 배율: 100 이면 넣지 않는다. 매초 다시 그려도 같은 객체를 쓴다.
  const rootStyle = useMemo(
    () => (settings.zoom !== 100 ? { zoom: settings.zoom / 100, '--popup-zoom': settings.zoom / 100 } : undefined),
    [settings.zoom],
  );

  // 열리면 검색칸에 커서. 그린 직후 바로(다음 프레임을 기다리면 첫 타자가 검색칸 밖으로 샌다).
  useLayoutEffect(() => {
    if (phase === 'list') searchRef.current?.focus();
  }, [phase]);

  // 권한 허용은 누른 순간 요청하고, 승인 뒤에도 처음 지정한 탭·주소에만 다시 넣는다.
  // close: 직접 넣기에만 자동 제출을 허용하고, 입력 성공 뒤 툴바 팝업을 닫는다.
  // onceHost: 사용자가 확인한 그 호스트에만 이번만 넣는다(백그라운드가 자동 제출하지 않는다).
  const fill = useCallback(
    async (id: string, close = true, permission?: FillPermission, onceHost?: string) => {
      if (filling.current) return;
      filling.current = true;
      const lockedAt = lockSeq.current;
      setMenu(null);
      setMismatch(null);
      setFillFeedback({ kind: 'pending', message: 'popup.fillPending' });
      try {
        if (permission) {
          // 권한 창이 툴바 팝업을 닫을 수 있어, 승인 뒤 넣기를 백그라운드에 먼저 맡긴다(기다리지 않아 요청이 제스처 안에 남는다).
          void chrome.runtime.sendMessage({
            type: 'fill-pending', accountId: id, submit: close, origin: permission.origin,
            target: { tabId: permission.tabId, pageUrl: permission.pageUrl },
            ...(onceHost ? { allowSiteMismatch: onceHost } : {}),
          }).catch(() => undefined);
          let granted = false;
          try { granted = await chrome.permissions.request({ origins: [permission.origin] }); } catch { /* 거절과 같이 본다 */ }
          if (!granted) {
            void chrome.runtime.sendMessage({ type: 'fill-pending', clear: true }).catch(() => undefined);
            if (lockedAt === lockSeq.current) setFillFeedback({ kind: 'error', message: 'popup.fillError.denied' });
            return;
          }
        }
        const reply = await chrome.runtime.sendMessage({
          type: 'fill-code', accountId: id, submit: close,
          ...(onceHost ? { allowSiteMismatch: onceHost } : {}),
          ...(permission ? { target: { tabId: permission.tabId, pageUrl: permission.pageUrl } } : {}),
        }) as { ok?: boolean; outcome?: string; error?: string; permission?: FillPermission; mismatch?: { host: string } } | undefined;
        if (lockedAt !== lockSeq.current) return;
        if (reply?.mismatch) {
          // 복사할 때 넣기는 이미 복사했으니 조용히 넘어간다.
          setFillFeedback(null);
          if (close) setMismatch({ id, host: reply.mismatch.host, close });
          return;
        }
        if (reply?.ok !== true || reply.outcome === 'expired') {
          setFillFeedback({
            kind: 'error',
            message: reply?.error ?? (reply?.outcome === 'expired' ? 'popup.fillError.changed' : 'popup.fillError.failed'),
            ...(reply?.permission ? {
              permission: {
                ...reply.permission,
                host: new URL(reply.permission.pageUrl).hostname,
                ...(onceHost ? { onceHost } : {}),
              },
            } : {}),
          });
          return;
        }
        // 기기 인증은 현재 화면 안에서 이어지므로 창을 유지한다.
        if (reply.outcome === 'handed-over') {
          setFillFeedback(null);
          return;
        }
        const message = reply.outcome === 'filled' ? 'popup.fillSuccess'
          : reply.outcome === 'copied' ? 'popup.fillCopied'
          : reply.outcome === 'shown' ? 'popup.fillShown' : null;
        setFillFeedback({ kind: message ? 'success' : 'error', message: message ?? 'popup.fillError.failed' });
        if (reply.outcome === 'filled' || reply.outcome === 'copied') setUsedCode(true);
        if (reply.outcome === 'filled' && close && openName === 'popup') window.close();
      } catch {
        if (lockedAt === lockSeq.current) setFillFeedback({ kind: 'error', message: 'popup.fillError.failed' });
      } finally {
        filling.current = false;
      }
    },
    [openName],
  );

  const copy = useCallback(async (account: Account, step: number, codeAt?: number) => {
    let code: string;
    try {
      code = await generateCode(account, codeAt ?? Date.now() + correction, 0, step);
      await navigator.clipboard.writeText(code);
    } catch {
      setCodeAccessError('common.actionError');
      return;
    }
    // 팝업이 곧 닫혀도 지우기가 예약되도록 다른 await 보다 먼저 보낸다.
    if (settings.clipboardClearAfterCopy) {
      void chrome.runtime.sendMessage({ type: 'clipboard-copied', code }).catch(() => undefined);
    }
    const host = hostOf(await currentSiteUrl(openName));
    if (host !== undefined) {
      try {
        await recordSiteUse(host, account.id, 'copy');
      } catch {
        // 사용 기록은 추천에만 쓰이니 실패해도 넘어간다.
      }
      const base = host;
      if (
        settings.suggestionsEnabled &&
        !matchesSite(account.matchHosts, host) &&
        suggested[0] !== account.id &&
        !declinedRef.current.has(base)
      ) {
        setRemember({ id: account.id, host: base });
      }
    }
    if (settings.autofillOnCopy && step === 0) void fill(account.id, false);
    setUsedCode(true);
    setCopiedId(account.id);
    clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopiedId(null), COPIED_MS);
    setToastName(account.issuer !== '' ? account.issuer : account.label);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastName(null), COPIED_MS);
  }, [openName, settings.suggestionsEnabled, settings.clipboardClearAfterCopy, settings.autofillOnCopy, suggested, fill, correction]);

  const answerRemember = async (yes: boolean) => {
    const current = remember;
    setRemember(null);
    if (!current) return;
    if (!yes) {
      declinedRef.current.add(current.host);
      return;
    }
    try {
      const at = Date.now();
      setAccounts(
        await updateAccounts((list) =>
          list.map((a) =>
            a.id === current.id && !a.matchHosts.includes(current.host)
              ? { ...a, matchHosts: [...a.matchHosts, current.host], updatedAt: at }
              : a,
          ),
        ),
      );
    } catch {
      // 금고 변화 구독이 상태를 맞춘다.
    }
  };

  // 지정 사이트로 기억한 뒤 다시 넣는다(이제 일치하므로 평소처럼 자동 제출까지).
  const answerMismatch = async (choice: 'remember' | 'once' | 'cancel') => {
    const current = mismatch;
    setMismatch(null);
    if (!current || choice === 'cancel') return;
    if (choice === 'once') {
      await fill(current.id, current.close, undefined, current.host);
      return;
    }
    try {
      const at = Date.now();
      setAccounts(
        await updateAccounts((list) =>
          list.map((a) =>
            a.id === current.id && !a.matchHosts.includes(current.host)
              ? { ...a, matchHosts: [...a.matchHosts, current.host], updatedAt: at }
              : a,
          ),
        ),
      );
    } catch {
      setFillFeedback({ kind: 'error', message: 'popup.fillError.failed' });
      return;
    }
    await fill(current.id, current.close);
  };

  const refreshHotp = useCallback(async (id: string) => {
    try {
      const next = await updateAccounts((list) =>
        list.map((a) =>
          a.id === id ? { ...a, counter: (a.counter ?? 0) + 1, updatedAt: Date.now() } : a,
        ),
      );
      setAccounts(next);
    } catch {
      setCodeAccessError('common.actionError');
    }
  }, []);

  // 그룹 묶음 접기·펼치기. 저장할 때 지금 없는 그룹 이름은 지운다.
  const toggleFold = useCallback((key: string) => {
    const current = foldedRef.current;
    const toggled = current.includes(key) ? current.filter((x) => x !== key) : [...current, key];
    const next = pruneFolded(toggled, groupSections(activeRef.current));
    foldedRef.current = next;
    setFoldedGroups(next);
    setMenu(null);
    void chrome.storage.local.set({ popupFoldedGroups: next }).catch(() => undefined);
  }, []);

  // 계정 하나의 그룹만 바꾼다. null 이면 그룹을 뺀다. 최신 계정을 쓰기 잠금 안에서 읽는다.
  const setAccountGroup = useCallback(async (id: string, next: string | null) => {
    try {
      const at = Date.now();
      setAccounts(
        await updateAccounts((list) =>
          list.map((a) => {
            if (a.id !== id) return a;
            const { group: _group, ...rest } = a;
            return next === null ? { ...rest, updatedAt: at } : { ...rest, group: next, updatedAt: at };
          }),
        ),
      );
    } catch (error) {
      if (error instanceof LockedError) {
        setAccounts([]);
        setPhase('locked');
      } else {
        setCodeAccessError('common.actionError');
      }
    }
  }, []);

  // to 는 지금 화면(옮길 계정을 뺀 목록)의 자리. 저장 때 다른 창이 목록을 바꿔도 맞게 이웃 id 로 바꿔 넘긴다.
  const reorder = useCallback(async (id: string, to: number) => {
    const others = visibleRef.current.filter((a) => a.id !== id);
    let after = others[others.length - 1];
    let slot = to;
    let sectionEnd = false;
    if (groupedRef.current) {
      // 묶음 보기: 같은 그룹 묶음 안으로 자리를 맞추고, 묶음 맨 끝은 그 묶음 마지막 줄 바로 뒤로 본다.
      const key = activeRef.current.find((a) => a.id === id)?.group || null;
      const same = (a: Account) => (a.group || null) === key;
      const first = others.findIndex(same);
      if (first < 0) return;
      const size = others.filter(same).length;
      slot = Math.min(Math.max(to, first), first + size);
      sectionEnd = slot === first + size;
      if (sectionEnd) after = others[first + size - 1];
    }
    const allOthers = activeRef.current.filter((a) => a.id !== id);
    // 검색 결과 맨 끝은 마지막 보이는 이웃 바로 뒤다. 가려진 계정은 버리거나 재정렬하지 않는다.
    const beforeId = (sectionEnd ? undefined : others[slot]?.id) ?? (after
      ? allOthers[allOthers.findIndex((a) => a.id === after!.id) + 1]?.id ?? null
      : null);
    try {
      setAccounts(await updateAccounts((list) => moveActive(list, id, beforeId)));
    } catch {
      // 금고 변화 구독이 상태를 맞춘다.
    }
  }, []);

  // 키보드: 활동 알림, 가리기 토글, 목록 조작, 아무 글자나 치면 검색칸으로.
  // 그린 직후 바로 다시 건다(옛 상태를 본 처리기가 키를 받지 않게).
  useLayoutEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      portRef.current?.activity();
      if (screens.length > 0) return;
      if (e.altKey && e.shiftKey && e.code === 'KeyH') {
        e.preventDefault();
        void toggleCodesHidden().catch(() => setCodeAccessError('common.actionError'));
        return;
      }
      if (phase !== 'list' || e.isComposing || deleteAsk !== null) return;
      // QR 보기·비밀번호 칸에서 친 글자를 검색칸이 가져가지 않게 한다.
      // 줄 메뉴의 새 그룹 이름 칸도 같다.
      if ((e.target as HTMLElement | null)?.closest('.popup-qr, .popup-delete, .menu input')) return;
      const hoveredIndex = visible.findIndex((a) => a.id === hoveredId.current);
      const currentIndex = hoveredIndex >= 0 ? hoveredIndex : selectedIndex;
      if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
        const account = visible[currentIndex];
        if (account) { e.preventDefault(); setMenu(`row:${account.id}`); }
        return;
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const delta = e.key === 'ArrowDown' ? 1 : -1;
        // 줄 안에 포커스가 있을 때 Alt+↑/↓ 로 한 칸 이동한다.
        const rowId = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-account-id]')
          ?.dataset.accountId;
        if (e.altKey && rowId) {
          const from = visible.findIndex((a) => a.id === rowId);
          const to = from + delta;
          // 묶음 보기에서는 같은 그룹 안에서만 옮긴다.
          const sameSection = !grouped || (visible[to]?.group || null) === (visible[from]?.group || null);
          if (from >= 0 && to >= 0 && to < visible.length && sameSection) {
            void reorder(rowId, to).then(() =>
              requestAnimationFrame(() =>
                listRef.current
                  ?.querySelector<HTMLElement>(`[data-account-id="${rowId}"]`)
                  ?.focus(),
              ),
            );
          }
          return;
        }
        if (visible.length === 0) return;
        const next = (currentIndex + delta + visible.length) % visible.length;
        hoveredId.current = null;
        if (listRef.current) listRef.current.dataset.input = 'keyboard';
        setSelected(next);
        // 키보드로 이동할 때만 따라간다. 호버·목록 갱신은 사용자가 정한 스크롤을 바꾸지 않는다.
        listRef.current?.querySelectorAll<HTMLElement>('[data-account-id]')[next]
          ?.scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter') {
        // 줄 자체가 아닌 단추(채우기·HOTP 새로고침·다음 코드·줄 밖 단추)는 Enter 로 그대로 누른다.
        const target = e.target as HTMLElement | null;
        const button = target?.closest('button');
        if (button && !button.matches('[data-account-id]')) return;
        // 작은 메뉴 항목은 Enter 로 그대로 누른다.
        if (target && target.closest('.menu, [data-menu-toggle]')) return;
        const account = visible[currentIndex];
        if (account) {
          e.preventDefault();
          void copy(account, 0);
        }
      } else if (e.key === 'Escape') {
        if (gesture.current) {
          e.preventDefault();
          dragClick.current = gesture.current.started ? gesture.current.id : null;
          clearDrag();
        } else if (menu !== null) {
          e.preventDefault();
          setMenu(null);
        } else if (query !== '') {
          e.preventDefault();
          setQuery('');
          setSelected(0);
        }
      } else if (!listOnly && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        // 단추 위 Space 는 그 단추를 누른다.
        if (e.key === ' ' && (e.target as HTMLElement | null)?.closest('button')) return;
        const search = searchRef.current;
        if (search && document.activeElement !== search) search.focus();
      }
    };
    const onPointer = () => portRef.current?.activity();
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [phase, visible, selectedIndex, query, copy, reorder, menu, screens.length, listOnly, clearDrag, deleteAsk, grouped]);

  const unlockPasskey = async () => {
    if (passkeyAbort.current) return;
    const controller = new AbortController();
    passkeyAbort.current = controller;
    setPasskeyBusy(true);
    setPasskeyError(null);
    try {
      await openPasskeyUnlock({ signal: controller.signal });
      if (!controller.signal.aborted) await load();
    } catch (error) {
      if (!controller.signal.aborted) setPasskeyError(passkeyErrorKey(error));
    } finally {
      if (passkeyAbort.current === controller) {
        passkeyAbort.current = null;
        setPasskeyBusy(false);
      }
    }
  };

  const submitPassword = async (e: Event) => {
    e.preventDefault();
    if (password === '' || passkeyAbort.current) return;
    setPasskeyError(null);
    try {
      await unlockWithPassword(password);
      setPassword('');
      setWrong('none');
      await load();
    } catch (error) {
      setPassword('');
      setWrong(error instanceof WrongSecretError ? 'wrong' : 'failed');
    }
  };

  const submitRecovery = async (e: Event) => {
    e.preventDefault();
    const code = normalizeRecoveryCode(recoveryInput);
    if (code === '' || recoveryBusyRef.current || passkeyAbort.current) return;
    setPasskeyError(null);
    recoveryBusyRef.current = true;
    setRecoveryInput('');
    const lockedAt = lockSeq.current;
    try {
      const { recoveryCode } = await unlockWithRecoveryCode(code);
      setWrong('none');
      setRecoveryCopied(false);
      // 푸는 사이 다른 창에서 잠갔으면 새 코드를 보이지 않는다(관리 페이지에서 새로 만들 수 있다).
      if (lockedAt === lockSeq.current) setNewRecovery(recoveryCode);
      recoveryBusyRef.current = false;
      // 새 코드 화면이 덮고 있는 동안 뒤에서 목록을 읽어 둔다.
      await load();
    } catch (error) {
      recoveryBusyRef.current = false;
      setWrong(error instanceof WrongSecretError ? 'wrong' : 'failed');
      void load();
    }
  };

  const copyNewRecovery = async () => {
    if (newRecovery === null) return;
    try {
      await navigator.clipboard.writeText(newRecovery);
      setRecoveryCopied(true);
    } catch {
      // 복사에 실패해도 화면의 코드를 적어 둘 수 있다.
    }
  };

  const finishNewRecovery = () => {
    // 새 코드를 받았다고 확인한 뒤에야 옛 코드를 없앤다. 실패해도 옛 코드가 남아 있어 잠기지 않는다.
    if (newRecovery !== null) void confirmRecoveryCode(newRecovery).catch(() => undefined);
    setNewRecovery(null);
    setRecoveryCopied(false);
    setUnlockMode('password');
    void load();
  };

  const switchUnlockMode = (mode: 'password' | 'recovery') => {
    setUnlockMode(mode);
    setPassword('');
    setRecoveryInput('');
    setWrong('none');
    setPasskeyError(null);
  };

  const saveLockNudge = (next: LockNudge) => {
    setLockNudge(next);
    void chrome.storage.local.set({ lockNudge: next });
  };

  const openQr = (id: string) => {
    const account = active.find((a) => a.id === id);
    const text = account ? buildOtpauth(account) : null;
    setQrAsk(null);
    if (account && text) {
      setQrView({ text, name: account.issuer !== '' ? `${account.issuer} ${account.label}` : account.label });
    }
  };

  const openShare = (id: string) => {
    setQrAsk(null);
    const account = active.find((a) => a.id === id);
    if (account && account.type === 'totp') setShareAccount(account);
  };

  const showQr = async (id: string, kind: 'qr' | 'share' = 'qr') => {
    qrSeq.current++;
    setQrPassword('');
    setQrWrong('none');
    if (lockEnabled) setQrAsk({ id, kind });
    else if (kind === 'share') openShare(id);
    else openQr(id);
  };

  const submitQr = async (e: Event) => {
    e.preventDefault();
    if (qrAsk === null || qrPassword === '') return;
    const value = qrPassword;
    const seq = qrSeq.current;
    setQrPassword('');
    try {
      await reauthenticate(value);
      if (seq !== qrSeq.current) return;
      // 겹쳐 낸 다른 재확인이 뒤늦게 창을 다시 열지 못하게 한다.
      qrSeq.current++;
      setQrWrong('none');
      if (qrAsk.kind === 'share') openShare(qrAsk.id);
      else openQr(qrAsk.id);
    } catch (error) {
      if (seq !== qrSeq.current) return;
      setQrWrong(error instanceof WrongSecretError ? 'wrong' : 'failed');
    }
  };

  const lock = async () => {
    await lockNow();
    closeQrAsk();
    setQrView(null);
    setShareAccount(null);
    setAccounts([]);
    setPhase('locked');
  };

  const snooze = () => {
    const until = Date.now() + SNOOZE_MS;
    setSnoozeUntil(until);
    void chrome.storage.local.set({ backupSnoozeUntil: until });
  };

  const rateReview = () => {
    if (!STORE_REVIEW_URL) return;
    void chrome.tabs.create({ url: STORE_REVIEW_URL });
    setReview((prev) => prev && { ...prev, dismissed: true });
    void chrome.storage.local.set({ reviewDismissed: true });
  };

  const laterReview = () => {
    if (review === null) return;
    const until = review.openCount + REVIEW_LATER_OPENS;
    setReview({ ...review, snoozedUntilOpen: until });
    void chrome.storage.local.set({ reviewSnoozedUntilOpen: until });
  };

  const neverReview = () => {
    setReview((prev) => prev && { ...prev, dismissed: true });
    void chrome.storage.local.set({ reviewDismissed: true });
  };

  const finishWhatsNew = () => {
    const version = whatsNew;
    setWhatsNew(null);
    if (version === null) return;
    void chrome.storage.local.set({ lastSeenWhatsNewVersion: version });
    void chrome.storage.local.remove('pendingWhatsNew');
  };

  // 지금 탭을 캡처해 캡처 화면에서 QR 을 찾는다. 잠금이 켜져 있으면 1회용 키를 함께 보낸다.
  const captureTab = async () => {
    if (needPassword) {
      void openManage('lock');
      return;
    }
    setQrError(null);
    try {
      const otk = lockEnabled ? await issueOneTimeKey() : undefined;
      // 분리 창·사이드 패널은 자기 창이 아니라 마지막으로 포커스된 일반 창을 찍는다.
      const win =
        openName === 'popup'
          ? await chrome.windows.getCurrent()
          : await lastNormalWindow();
      if (win?.id === undefined) throw new Error('No browser window to capture');
      const reply = (await chrome.runtime.sendMessage({
        type: 'capture-tab',
        windowId: win.id,
        otk,
      })) as { ok?: boolean } | undefined;
      if (reply?.ok === true) {
        if (openName === 'popup') window.close();
      } else {
        setQrError('capture');
      }
    } catch {
      setQrError('capture');
    }
  };

  // 카메라 권한이 이미 있으면 팝업 안에서, 아니면 관리 탭에서 먼저 허락을 받는다.
  const openCamera = async () => {
    if (needPassword) {
      void openManage('lock');
      return;
    }
    let granted = false;
    try {
      const status = await navigator.permissions.query({ name: 'camera' as PermissionName });
      granted = status.state === 'granted';
    } catch {
      granted = false;
    }
    if (granted) {
      setScanned({ added: 0, duplicates: 0, failed: 0 });
      setQrError(null);
      setCameraOpen(true);
    } else {
      try { await openTaskWindow('add', { tab: 'qr' }); }
      catch { setQrError('capture'); }
    }
  };

  const saveScanned = async (
    drafts: Parameters<typeof addDrafts>[0],
    failed: { source: string; reason: string }[],
  ): Promise<boolean> => {
    let added = 0;
    let ok = true;
    let duplicates = 0;
    try {
      if (drafts.length > 0) {
        const out = await addDrafts(drafts);
        added = out.added.length;
        duplicates = out.duplicates;
      }
    } catch {
      setQrError('save');
      ok = false;
    }
    setScanned((prev) => ({
      added: prev.added + added,
      duplicates: prev.duplicates + duplicates,
      failed: prev.failed + failed.length,
    }));
    return ok;
  };

  const openEdit = (id: string) => navigate({ section: 'accounts', editId: id });

  const askDelete = (account: Account) => {
    savedListScroll.current = listRef.current?.scrollTop ?? 0;
    deleteReturnId.current = account.id;
    setDeleteError(false);
    setDeleteAsk({ id: account.id, name: [account.issuer, account.label].filter(Boolean).join(' · ') });
  };
  const confirmDelete = async (event: Event) => {
    event.preventDefault();
    if (!deleteAsk || deleting.current) return;
    const id = deleteAsk.id;
    const lockedAt = lockSeq.current;
    deleting.current = true;
    setDeleteBusy(true);
    setDeleteError(false);
    try {
      const next = await moveToTrash([id]);
      if (lockedAt !== lockSeq.current) return;
      setAccounts(next);
      setDeleteAsk(null);
    } catch {
      if (lockedAt === lockSeq.current) setDeleteError(true);
    } finally {
      deleting.current = false;
      setDeleteBusy(false);
    }
  };

  // 시작 때 잰 위치를 쓴다. 움직일 때는 모든 줄의 레이아웃을 다시 읽지 않는다.
  const dropIndex = (y: number, current: DragGesture): number => {
    const scroll = ((listRef.current?.scrollTop ?? current.scrollTop) - current.scrollTop) * current.scale;
    let n = 0;
    for (const row of current.rows) {
      if (row.id === current.id) continue;
      if (row.top + row.height / 2 - scroll < y) n++;
    }
    // 묶음 보기에서는 같은 묶음 범위 안으로만 놓는다.
    return Math.min(Math.max(n, current.min ?? 0), current.max ?? n);
  };

  const placeDrag = (current: DragGesture, y: number) => {
    current.lastY = y;
    current.offset = (y - current.y) / current.scale + (listRef.current?.scrollTop ?? current.scrollTop) - current.scrollTop;
    current.row.style.setProperty('--drag-y', `${current.offset}px`);
    const to = dropIndex(y, current);
    // 마우스 좌표는 DOM 에만 적용하고, 이웃 줄이 비킬 때만 다시 그린다.
    setDrag((prev) => prev?.id === current.id && prev.to === to ? prev : { id: current.id, to });
  };

  const dragStart = (e: PointerEvent, id: string) => {
    dragClick.current = null;
    if (gesture.current) return;
    if (e.button !== 0 || e.pointerType !== 'mouse') return;
    // 코드·이름 단추는 행의 복사 영역이다. 다른 동작 단추와 메뉴는 끌지 않는다.
    if ((e.target as Element).closest('button:not(.code):not(.row-main), .menu, a, input')) return;
    const list = listRef.current;
    const target = e.currentTarget as HTMLElement;
    const row = target.closest<HTMLElement>('[data-account-id]');
    if (!list || !row) return;
    const rows = [...list.querySelectorAll<HTMLElement>('[data-account-id]')].map((element) => {
      const rect = element.getBoundingClientRect();
      return { id: element.dataset.accountId!, top: rect.top, height: rect.height };
    });
    const from = rows.findIndex((item) => item.id === id);
    if (from < 0) return;
    target.setPointerCapture(e.pointerId);
    const current: DragGesture = {
      id, pointerId: e.pointerId, x: e.clientX, y: e.clientY, lastY: e.clientY,
      started: false, target, row, rows, from, scrollTop: list.scrollTop,
      scale: rows[from]!.height / row.offsetHeight || 1, offset: 0,
    };
    if (groupedRef.current) {
      // 줄 순서는 보이는 목록 순서와 같다. 같은 그룹 줄의 처음~끝이 놓을 수 있는 범위다.
      const key = visibleRef.current[from]?.group || null;
      const same = (a: Account) => (a.group || null) === key;
      const mine = visibleRef.current.flatMap((a, i) => (same(a) ? [i] : []));
      current.min = mine[0]!;
      current.max = mine[mine.length - 1]!;
    }
    gesture.current = current;
  };

  const dragMove = (e: PointerEvent) => {
    const current = gesture.current;
    if (!current || current.pointerId !== e.pointerId) return;
    if (!current.started) {
      if (Math.hypot(e.clientX - current.x, e.clientY - current.y) < 6) return;
      current.started = true;
      setMenu(null);
    }
    e.preventDefault();
    placeDrag(current, e.clientY);
  };

  const dragEnd = (e: PointerEvent, commit: boolean) => {
    const current = gesture.current;
    if (!current || current.pointerId !== e.pointerId) return;
    const el = e.currentTarget as HTMLElement;
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    if (!current.started) { clearDrag(); return; }
    // pointerup 바로 뒤의 click만 막는다. 다음 실제 누름(pointerdown)에서는 다시 복사된다.
    dragClick.current = current.id;
    if (!commit) { clearDrag(); return; }
    const to = dropIndex(e.clientY, current);
    if (to === current.from) { clearDrag(); return; }
    // 저장이 끝날 때까지 목적지에 둔다. 이전 자리로 잠깐 튀었다가 다시 옮겨지지 않는다.
    const destination = current.rows[to]!;
    const origin = current.rows[current.from]!;
    current.offset = (destination.top - origin.top + (to > current.from ? destination.height - origin.height : 0)) / current.scale;
    current.row.style.setProperty('--drag-y', `${current.offset}px`);
    current.pointerId = -1;
    void reorder(current.id, to).finally(() => {
      if (gesture.current === current) clearDrag();
    });
  };

  const preventDragClick = (e: MouseEvent, id: string) => {
    if (e.detail === 0 || dragClick.current !== id) return;
    dragClick.current = null;
    e.preventDefault();
    e.stopPropagation();
  };

  const dragOffset = (id: string, index: number): number => {
    const current = gesture.current;
    if (!drag || !current) return 0;
    if (id === drag.id) return current.offset;
    const height = current.rows[current.from]!.height / current.scale;
    if (current.from < drag.to && index > current.from && index <= drag.to) return -height;
    if (current.from > drag.to && index >= drag.to && index < current.from) return height;
    return 0;
  };

  const toggleMenu = (name: string) => setMenu((prev) => (prev === name ? null : name));

  // 줄 하나. index 는 visible 안의 자리.
  const renderRow = (account: Account, index: number) => (
    <Fragment key={account.id}>
      <Row
        account={account}
        view={settings.view}
        avatars={settings.avatars}
        hidden={codesHidden}
        pair={codes.get(account.id)}
        nowMs={codeNowMs}
        correction={correction}
        selected={index === selectedIndex}
        suggest={
          settings.suggestionsEnabled &&
          (openName === 'popup' || follow) && inlineFillId === account.id
        }
        copied={copiedId === account.id}
        menuOpen={menu === `row:${account.id}`}
        t={t}
        onHover={() => {
          hoveredId.current = account.id;
          const list = listRef.current;
          if (list && list.dataset.input !== 'pointer') list.dataset.input = 'pointer';
        }}
        onLeave={() => { if (hoveredId.current === account.id) hoveredId.current = null; }}
        onFocus={() => { hoveredId.current = null; setSelected(index); }}
        onOpenMenu={() => { clearDrag(); setMenu(`row:${account.id}`); }}
        onToggleMenu={() => toggleMenu(`row:${account.id}`)}
        onCloseMenu={() => setMenu(null)}
        onCopy={(step) => void copy(account, step, step === 1 ? codes.get(account.id)?.at : undefined)}
        onFill={() => void fill(account.id)}
        groupNames={groupNames}
        onSetGroup={(next) => void setAccountGroup(account.id, next)}
        onOpenEdit={() => openEdit(account.id)}
        onHistory={() => navigate({ section: 'accounts', historyId: account.id })}
        onDelete={() => askDelete(account)}
        onQr={
          !codesHidden && !policy.disableExport && (account.type === 'totp' || account.type === 'hotp')
            ? () => void showQr(account.id)
            : undefined
        }
        onShare={
          !codesHidden && account.type === 'totp' ? () => void showQr(account.id, 'share') : undefined
        }
        onRefresh={() => void refreshHotp(account.id)}
        reorder={{
          dragging: drag?.id === account.id,
          offset: dragOffset(account.id, index),
          onDragStart: (e) => dragStart(e, account.id),
          onDragMove: dragMove,
          onDragEnd: dragEnd,
          onClickCapture: (e) => preventDragClick(e, account.id),
        }}
      />
      {remember?.id === account.id && (
        <div class="note" data-role="remember">
          <span>{t('popup.remember.text', { host: remember.host })}</span>
          <button type="button" data-role="remember-yes" onClick={() => void answerRemember(true)}>
            {t('popup.remember.yes')}
          </button>
          <button type="button" data-role="remember-no" onClick={() => void answerRemember(false)}>
            {t('popup.remember.no')}
          </button>
        </div>
      )}
      {mismatch?.id === account.id && (
        <div class="note" data-role="mismatch">
          <span>{t('popup.mismatch.text', { host: mismatch.host })}</span>
          <button type="button" data-role="mismatch-remember" onClick={() => void answerMismatch('remember')}>
            {t('popup.mismatch.remember')}
          </button>
          <button type="button" data-role="mismatch-once" onClick={() => void answerMismatch('once')}>
            {t('popup.mismatch.once')}
          </button>
          <button type="button" data-role="mismatch-cancel" onClick={() => void answerMismatch('cancel')}>
            {t('popup.edit.cancel')}
          </button>
        </div>
      )}
    </Fragment>
  );

  const root = {
    class: 'popup',
    'data-app': 'popup',
    'data-open-name': openName,
    'data-size': settings.popupSize,
    'data-view': settings.view,
    ...(rootStyle ? { style: rootStyle } : {}),
    ...(codesHidden ? { 'data-codes-hidden': 'true' } : {}),
  };

  // 작은 메뉴의 항목 하나.
  const menuItem = (
    dataRole: string,
    icon: keyof typeof ICONS,
    label: string,
    onClick: () => void,
  ) => (
    <button
      type="button"
      class="mi"
      role="menuitem"
      data-role={dataRole}
      onClick={() => {
        setMenu(null);
        onClick();
      }}
    >
      <Icon name={icon} />
      {label}
    </button>
  );

  // 보기 전환은 전체 보기와 목록 보기의 같은 자리에서 바로 누를 수 있다.
  const listPhase = phase === 'list';
  const viewToggle = openName === 'window' ? (
    <button
      type="button"
      class="tb view-toggle"
      data-role="list-view-toggle"
      aria-label={t(listOnly ? 'popup.fullView' : 'popup.listOnly')}
      title={t(listOnly ? 'popup.fullView' : 'popup.listOnly')}
      aria-pressed={listOnly}
      onClick={() => { setMenu(null); void setListOnly(!listOnly); }}
    >
      <Icon name={listOnly ? 'expandHeader' : 'collapseHeader'} />
    </button>
  ) : null;
  const head = (
    <div class="head">
      <div class="brand">
        <img src={chrome.runtime.getURL('icons/icon.svg')} width="18" height="18" alt="" />
        <b>Popout</b>
      </div>
      <button
        type="button"
        class="tb"
        data-role="add-menu"
        data-menu-toggle
        aria-haspopup="menu"
        aria-expanded={menu === 'add'}
        aria-label={t('popup.add')}
        title={t('popup.add')}
        disabled={!listPhase}
        onClick={() => toggleMenu('add')}
      >
        <Icon name="plus" />
      </button>
      {openName !== 'window' && <button
        type="button"
        class="tb"
        data-role="detach"
        aria-label={t('popup.detach')}
        title={t('popup.detach')}
        onClick={() => void activeTabUrl().then(openDetachedWindow)}
      >
        <Icon name="popout" />
      </button>}
      <button
        type="button"
        class="tb"
        data-role="lock"
        aria-label={t(lockEnabled ? 'popup.lockNow' : 'popup.lockNudge.open')}
        title={t(lockEnabled ? 'popup.lockNow' : 'popup.lockNudge.open')}
        disabled={!listPhase}
        onClick={() => {
          setMenu(null);
          if (lockEnabled) void lock();
          else void openManage('lock');
        }}
      >
        <Icon name="lock" />
      </button>
      <button
        type="button"
        class="tb"
        data-role="settings-menu"
        aria-label={t('popup.settings')}
        title={t('popup.settings')}
        onClick={() => openManage('settings')}
      >
        <Icon name="gear" />
      </button>
      {listPhase && viewToggle}
      {listPhase && menu === 'add' && (
        <div class="menu" role="menu">
          {menuItem('add-account', 'plus', t('popup.first.add'), () =>
            void openManage(needPassword ? 'lock' : 'add'),
          )}
          {menuItem('capture-tab', 'search', t('popup.menu.capture'), () => void captureTab())}
          {menuItem('camera-popup', 'qr', t('popup.menu.camera'), () => void openCamera())}
        </div>
      )}
    </div>
  );

  // 복구 코드로 푼 직후: 목록으로 넘기지 않고 새 코드를 먼저 보인다.
  if (newRecovery !== null) {
    return (
      <div {...root}>
        {head}
        <div class="lockscreen" data-role="new-recovery">
          <div class="badge">
            <Icon name="key" />
          </div>
          <p>{t('popup.recovery.new')}</p>
          <div class="rcode" data-role="new-recovery-code" data-code={newRecovery}>
            {spacedCode(newRecovery)}
          </div>
          <button type="button" class="btn" data-role="new-recovery-copy" onClick={() => void copyNewRecovery()}>
            {recoveryCopied ? t('popup.copied') : t('popup.recovery.copy')}
          </button>
          <button
            type="button"
            class="btn primary"
            data-role="new-recovery-done"
            onClick={finishNewRecovery}
          >
            {t('popup.recovery.done')}
          </button>
        </div>
      </div>
    );
  }

  const currentScreen = screens[screens.length - 1];
  if (currentScreen) {
    return (
      <div {...root}>
        <Suspense fallback={<div class="popup-screen screen-loading" role="status">{t('popup.loading')}</div>}>
          {screens.map((route, index) => {
            const active = index === screens.length - 1;
            // 비밀번호·QR·편집 초안이 있는 화면은 다른 화면 뒤에 보관하지 않는다.
            const keep = route.section === 'settings' || route.section === 'display'
              || (route.section === 'accounts' && !route.editId && !route.historyId);
            return active || keep ? <PopupScreen key={`${index}:${route.section}:${route.editId ?? ''}:${route.historyId ?? ''}:${route.tab ?? ''}`}
              route={route} active={active} animate={screenForward} toolbarPopup={openName === 'popup'}
              onNavigate={navigate} onBack={screenBack} /> : null;
          })}
        </Suspense>
      </div>
    );
  }

  if (phase === 'loading') {
    return (
      <div {...root}>
        <p class="empty">{t('popup.loading')}</p>
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div {...root}>
        <p class="empty">{t('popup.error')}</p>
      </div>
    );
  }

  if (phase === 'recover') {
    return (
      <div {...root}>
        <div class="first">
          <span>{t('popup.recover.text')}</span>
          <button type="button" class="primary" onClick={() => void openManage('backup')}>
            {t('popup.recover.open')}
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'locked') {
    // 풀기 방법 순서: 패스키 → 비밀번호 → 복구 코드.
    return (
      <div {...root}>
        {head}
        <div class="lockscreen">
          <div class="badge">
            <Icon name="lock" />
          </div>
          <h1>{t('popup.unlock.title')}</h1>
          <p>{t('popup.unlock.hint')}</p>
          {hasPrf && (
            <button
              type="button"
              class="btn primary"
              data-role="unlock-passkey"
              disabled={passkeyBusy}
              aria-busy={passkeyBusy}
              onClick={() => void unlockPasskey()}
            >
              <Icon name="key" />
              {t('popup.unlock.passkey')}
            </button>
          )}
          {passkeyError && <p class="error" role="alert">{t(passkeyError)}</p>}
          {unlockMode === 'password' ? (
            <form class="unlock" onSubmit={(e) => void submitPassword(e)}>
              <input
                type="password"
                class="field"
                autoFocus
                aria-label={t('popup.unlock.password')}
                placeholder={t('popup.unlock.password')}
                value={password}
                onInput={(e) => {
                  setPassword(e.currentTarget.value);
                  setWrong('none');
                }}
              />
              {wrong !== 'none' && (
                <p class="error" role="alert">
                  {t(wrong === 'wrong' ? 'popup.unlock.wrong' : 'popup.unlock.failed')}
                </p>
              )}
              <button type="submit" class={hasPrf ? 'btn' : 'btn primary'} disabled={passkeyBusy}>
                {t('popup.unlock.submit')}
              </button>
            </form>
          ) : (
            <form class="unlock" onSubmit={(e) => void submitRecovery(e)}>
              <input
                type="text"
                class="field"
                data-role="unlock-recovery"
                autoComplete="off"
                autoFocus
                aria-label={t('popup.unlock.recovery')}
                placeholder={t('popup.unlock.recovery')}
                value={recoveryInput}
                onInput={(e) => {
                  setRecoveryInput(e.currentTarget.value);
                  setWrong('none');
                }}
              />
              {wrong !== 'none' && (
                <p class="error" role="alert">
                  {t(wrong === 'wrong' ? 'popup.unlock.recoveryWrong' : 'popup.unlock.failed')}
                </p>
              )}
              <button
                type="submit"
                class={hasPrf ? 'btn' : 'btn primary'}
                data-role="unlock-recovery-submit"
                disabled={passkeyBusy}
              >
                {t('popup.unlock.submit')}
              </button>
            </form>
          )}
          <button
            type="button"
            class="link"
            data-role="unlock-recovery-toggle"
            disabled={passkeyBusy}
            onClick={() => switchUnlockMode(unlockMode === 'password' ? 'recovery' : 'password')}
          >
            {t(unlockMode === 'password' ? 'popup.unlock.recoveryToggle' : 'popup.unlock.passwordToggle')}
          </button>
        </div>
      </div>
    );
  }

  const searching = !listOnly && query.trim() !== '';
  const overlayOpen =
    ((qrAsk !== null || qrView !== null || shareAccount !== null) && !codesHidden) || cameraOpen;

  return (
    <div {...root}>
      {listOnly ? (
        <div class="list-only-tools">{viewToggle}</div>
      ) : head}
      {!listOnly && <div class="search">
        <Icon name="search" />
        <input
          ref={searchRef}
          type="search"
          class="field"
          data-role="search"
          aria-label={t('popup.search')}
          placeholder={t('popup.search')}
          value={query}
          autoComplete="off"
          onInput={(e) => {
            setQuery(e.currentTarget.value);
            setSelected(0);
          }}
        />
      </div>}
      {codeAccessError && <p class="flag error" role="alert" data-role="code-access-error">{t(codeAccessError)}</p>}
      {fillFeedback && (
        <div class="note" role={fillFeedback.kind === 'error' ? 'alert' : 'status'} data-role="fill-feedback" data-state={fillFeedback.kind}>
          <span>{t(fillFeedback.message)}</span>
          {fillFeedback.permission && (
            <button type="button" data-role="fill-permission-allow"
              style={{ maxWidth: '100%', height: 'auto', minHeight: '28px', overflowWrap: 'anywhere' }}
              onClick={() => void fill(fillFeedback.permission!.accountId, true, fillFeedback.permission, fillFeedback.permission!.onceHost)}>
              {t('popup.fillPermission.allow', { host: fillFeedback.permission.host })}
            </button>
          )}
          {fillFeedback.kind !== 'pending' && (
            <button type="button" class="x" data-role="fill-feedback-dismiss" aria-label={t('popup.qr.close')}
              onClick={() => setFillFeedback(null)}><Icon name="x" /></button>
          )}
        </div>
      )}
      {searching && !overlayOpen && <div class="kbd">{t('popup.kbdHint')}</div>}
      {codesHidden && (
        <div class="flag hidden-flag">
          <Icon name="lock" />
          {t('popup.hiddenOn')}
        </div>
      )}
      {!listOnly && whatsNew !== null && whatsNewItems.length > 0 && (
        <div class="note" data-role="whats-new">
          <span>{t('popup.whatsNew.title', { version: whatsNew })}</span>
          <ul>
            {whatsNewItems.map((key) => (
              <li key={key}>{t(key)}</li>
            ))}
          </ul>
          <button type="button" data-role="whats-new-done" onClick={finishWhatsNew}>
            {t('popup.whatsNew.done')}
          </button>
        </div>
      )}
      {needPassword && (
        <div class="note" data-role="policy-need-password">
          <span>{t('popup.policy.needPassword')}</span>
        </div>
      )}
      {!listOnly && showBackup && (
        <div class="note line" data-role="backup-reminder">
          <Icon name="backup" />
          <span>{t('popup.backup.text')}</span>
          <button type="button" onClick={() => void openManage('backup')}>
            {t('popup.backup.now')}
          </button>
          <button
            type="button"
            class="x"
            aria-label={t('popup.backup.later')}
            title={t('popup.backup.later')}
            onClick={snooze}
          >
            <Icon name="x" />
          </button>
        </div>
      )}
      {!listOnly && showLockNudge && lockNudge && (
        <div class="note" data-role="lock-nudge">
          <span>{t('popup.lockNudge.text')}</span>
          <button
            type="button"
            data-role="lock-nudge-open"
            onClick={() => {
              saveLockNudge({ count: lockNudge.count + 1, until: lockNudge.until });
              void openManage('lock');
            }}
          >
            {t('popup.lockNudge.open')}
          </button>
          <button
            type="button"
            data-role="lock-nudge-later"
            onClick={() =>
              saveLockNudge({ count: lockNudge.count + 1, until: Date.now() + LOCK_NUDGE_LATER_MS })
            }
          >
            {t('popup.lockNudge.later')}
          </button>
        </div>
      )}
      {settings.clockCheck && clock?.state === 'off' && !clockDismissed && (
        <div class="note" data-role="clock-warning">
          <span>
            {t('popup.clock.off', {
              minutes: Math.max(1, Math.round(Math.abs(clock.offsetMs) / 60000)),
            })}
            {correction !== 0 && ` ${t('popup.clock.corrected')}`}
          </span>
          <button type="button" data-role="clock-dismiss" onClick={() => setClockDismissed(true)}>
            {t('popup.clock.dismiss')}
          </button>
        </div>
      )}
      {!listOnly && openName !== 'popup' && settings.suggestionsEnabled && tabsGranted === false && !tabsDismissed && (
        <div class="note" data-role="tabs-follow">
          <span>{t('popup.tabs.text')}</span>
          <button type="button" onClick={() => void allowTabs()}>
            {t('popup.tabs.allow')}
          </button>
          <button type="button" onClick={dismissTabs}>
            {t('popup.tabs.dismiss')}
          </button>
        </div>
      )}
      {qrAsk !== null && !codesHidden ? (
        <form class="ovl popup-qr" data-role="qr-ask" onSubmit={(e) => void submitQr(e)}>
          <p>{t('popup.qr.reauth')}</p>
          <input
            type="password"
            class="field"
            data-role="qr-password"
            autoFocus
            aria-label={t('popup.unlock.password')}
            placeholder={t('popup.unlock.password')}
            value={qrPassword}
            onInput={(e) => {
              setQrPassword(e.currentTarget.value);
              setQrWrong('none');
            }}
          />
          {qrWrong !== 'none' && (
            <p class="error" role="alert">
              {t(qrWrong === 'wrong' ? 'popup.unlock.wrong' : 'popup.unlock.failed')}
            </p>
          )}
          <button type="submit" class="primary">
            {t('popup.qr.confirm')}
          </button>
          <button type="button" onClick={closeQrAsk}>
            {t('popup.qr.close')}
          </button>
        </form>
      ) : qrView !== null && !codesHidden ? (
        <div class="ovl popup-qr" data-role="qr-view">
          <div class="top">
            <h2>{t('popup.menu.qr')}</h2>
            <button type="button" data-role="qr-close" onClick={() => setQrView(null)}>
              {t('popup.qr.close')}
            </button>
          </div>
          <div class="qr-box">
            <QrSvg text={qrView.text} size={196} />
          </div>
          <p class="center">{qrView.name}</p>
          <p class="muted center">{t('popup.qr.hint')}</p>
        </div>
      ) : shareAccount !== null && !codesHidden ? (
        <ShareDialog
          key={shareAccount.id}
          account={shareAccount}
          t={t}
          correction={correction}
          onClose={() => setShareAccount(null)}
        />
      ) : cameraOpen ? (
        <div class="popup-camera">
          <CameraScanner onFound={saveScanned} onClose={() => setCameraOpen(false)} />
          <p class="muted" data-role="camera-result" data-added={scanned.added}>
            {t('add.result', scanned)}
          </p>
        </div>
      ) : active.length === 0 ? (
        <div class="first">
          <span>{t('popup.first.text')}</span>
          <button
            type="button"
            class="primary"
            onClick={() => void openManage(needPassword ? 'lock' : 'add')}
          >
            {t('popup.first.add')}
          </button>
          <button
            type="button"
            class="link"
            data-role="first-guide"
            onClick={() => void chrome.tabs.create({ url: siteUrl(lang, 'guides') })}
          >
            {t('popup.first.guide')}
          </button>
        </div>
      ) : visible.length === 0 && !sections ? (
        <p class="empty">{t('popup.noMatch')}</p>
      ) : (
        <div class={`popup-list${drag ? ' is-dragging' : ''}`} role="listbox" ref={listRef}
          onScroll={() => {
            if (menu?.startsWith('row:')) setMenu(null);
            const current = gesture.current;
            if (current?.started && current.pointerId >= 0) placeDrag(current, current.lastY);
          }}>
          {searching && (
            <div class="sec" role="presentation">
              {t('popup.sec.results')} <span class="site">{visible.length}</span>
            </div>
          )}
          {sections ? (() => {
            let index = 0;
            return sections.map((section) => {
              const key = section.name ?? UNGROUPED_KEY;
              const name = section.name ?? t('popup.group.none');
              return (
                <Fragment key={key}>
                  <div role="presentation">
                    <button
                      type="button"
                      class="sec sec-fold"
                      data-role="group-fold"
                      aria-expanded={!section.folded}
                      aria-label={t(section.folded ? 'popup.group.unfold' : 'popup.group.fold', { name })}
                      onClick={() => toggleFold(key)}
                    >
                      <Icon name="chevron" />
                      <span class="sec-name">{name}</span>
                      <span class="sec-count">{section.items.length}</span>
                    </button>
                  </div>
                  {!section.folded && (
                    <div class="card" role="presentation">
                      {section.items.map((account) => renderRow(account, index++))}
                    </div>
                  )}
                </Fragment>
              );
            });
          })() : (
            <>
              {!listOnly && !searching && (
                <div class="sec" role="presentation">{t('popup.sec.all')}</div>
              )}
              <div class="card" role="presentation">
                {visible.map((account, index) => renderRow(account, index))}
              </div>
            </>
          )}
        </div>
      )}
      {!listOnly && showReview && (
        <div class="note review" data-role="review-prompt">
          <Icon name="star" />
          <span>{t('popup.review.text')}</span>
          <button type="button" class="primary" data-role="review-rate" onClick={rateReview}>
            {t('popup.review.rate')}
          </button>
          {review !== null && canSnoozeReview(review.snoozedUntilOpen) && (
            <button type="button" data-role="review-later" onClick={laterReview}>
              {t('popup.review.later')}
            </button>
          )}
          <button type="button" data-role="review-never" onClick={neverReview}>
            {t('popup.review.never')}
          </button>
        </div>
      )}
      {qrError !== null && (
        <p class="error" role="alert">
          {t(qrError === 'capture' ? 'popup.capture.failed' : 'add.error.save')}
        </p>
      )}
      {toastName !== null && (
        <div class="toast" role="status">
          {toastName} {t('popup.copied')}
        </div>
      )}
      {deleteAsk !== null && (
        <div class="popup-delete-backdrop" onPointerDown={(event) => {
          if (event.target === event.currentTarget && !deleting.current) setDeleteAsk(null);
        }}>
          <form ref={deleteDialog} class="ovl popup-delete" data-role="popup-delete" role="dialog" aria-modal="true"
            aria-labelledby="popup-delete-name" aria-describedby="popup-delete-description" tabIndex={-1}
            onSubmit={(event) => void confirmDelete(event)}>
            <p class="popup-delete-name" id="popup-delete-name">{deleteAsk.name}</p>
            <p id="popup-delete-description">{t('accounts.delete.confirm')}</p>
            {deleteError && <p class="error" role="alert" data-role="popup-delete-error">{t('common.actionError')}</p>}
            <div class="popup-delete-actions">
              <button type="submit" class="danger" data-role="popup-delete-confirm" disabled={deleteBusy}>{t('accounts.delete.yes')}</button>
              <button type="button" data-role="popup-delete-cancel" disabled={deleteBusy} onClick={() => setDeleteAsk(null)}>{t('accounts.cancel')}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

type RowProps = {
  account: Account;
  view: Settings['view'];
  avatars: boolean;
  hidden: boolean;
  pair: CodePair | undefined;
  nowMs: number;
  correction: number;
  selected: boolean;
  // 지금 사이트에 맞는 첫 계정: 넣기 단추를 꽉 찬 색으로 둔다.
  suggest: boolean;
  copied: boolean;
  menuOpen: boolean;
  t: T;
  onHover: () => void;
  onLeave: () => void;
  onFocus: () => void;
  onOpenMenu: () => void;
  onToggleMenu: () => void;
  onCloseMenu: () => void;
  onCopy: (step: number) => void;
  onFill: () => void;
  groupNames: string[];
  // null 이면 그룹에서 뺀다.
  onSetGroup: (group: string | null) => void;
  onOpenEdit: () => void;
  onHistory: () => void;
  onDelete: () => void;
  onQr?: (() => void) | undefined;
  onShare?: (() => void) | undefined;
  onRefresh: () => void;
  reorder: {
    dragging: boolean;
    onDragStart: (e: PointerEvent) => void;
    onDragMove: (e: PointerEvent) => void;
    onDragEnd: (e: PointerEvent, commit: boolean) => void;
    offset: number;
    onClickCapture: (e: MouseEvent) => void;
  };
};

function Row(p: RowProps) {
  const { account, view, hidden, pair, t } = p;
  const timed = account.type !== 'hotp';
  const rowRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  // 메뉴 안 그룹 패널: null 이면 평소 메뉴, 'list' 는 그룹 고르기, 'new' 는 새 그룹 이름 입력.
  const [groupPanel, setGroupPanel] = useState<'list' | 'new' | null>(null);
  const [groupDraft, setGroupDraft] = useState('');
  const [groupInvalid, setGroupInvalid] = useState(false);
  useEffect(() => {
    if (!p.menuOpen) {
      setGroupPanel(null);
      setGroupDraft('');
      setGroupInvalid(false);
    }
  }, [p.menuOpen]);
  // 열린 메뉴만 측정한다. 목록의 절대 순서가 아니라 지금 보이는 칸 안에 놓는다.
  useLayoutEffect(() => {
    const row = rowRef.current;
    const menu = menuRef.current;
    const list = row?.closest<HTMLElement>('.popup-list');
    if (!p.menuOpen || !row || !menu || !list) return;
    const rowBox = row.getBoundingClientRect();
    const listBox = list.getBoundingClientRect();
    const anchor = row.querySelector('.more')?.getBoundingClientRect() ?? rowBox;
    const scale = row.offsetWidth > 0 ? rowBox.width / row.offsetWidth : 1;
    const top = Math.max(0, listBox.top) + 4 * scale;
    const bottom = Math.min(window.innerHeight, listBox.bottom) - 4 * scale;
    menu.style.maxHeight = `${Math.max(0, bottom - top) / scale}px`;
    const height = menu.getBoundingClientRect().height;
    const below = anchor.bottom + 4 * scale;
    const above = anchor.top - 4 * scale - height;
    const wanted = below + height <= bottom ? below : above >= top ? above : below;
    const placed = Math.max(top, Math.min(wanted, bottom - height));
    menu.style.top = `${(placed - rowBox.top) / scale}px`;
    menu.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
  }, [p.menuOpen, view, timed, !!p.onQr, !!p.onShare, t, groupPanel, p.groupNames.length, !!account.group]);
  // 새 그룹 이름 칸은 열리면 바로 입력할 수 있게 한다(위 효과가 첫 단추에 둔 포커스를 넘겨받는다).
  useLayoutEffect(() => {
    if (p.menuOpen && groupPanel === 'new') menuRef.current?.querySelector('input')?.focus({ preventScroll: true });
  }, [p.menuOpen, groupPanel]);
  // 그룹 패널을 닫고 평소 메뉴의 '그룹' 항목으로 돌아간다.
  const closeGroupPanel = () => {
    setGroupPanel(null);
    setGroupDraft('');
    setGroupInvalid(false);
    requestAnimationFrame(() =>
      menuRef.current?.querySelector<HTMLElement>('[data-role="menu-group"]')?.focus({ preventScroll: true }),
    );
  };
  const saveGroup = (next: string | null) => {
    p.onCloseMenu();
    if (next !== (account.group || null)) p.onSetGroup(next);
  };
  const submitDraft = () => {
    const name = normalizeGroupName(groupDraft);
    if (name === null) { setGroupInvalid(true); return; }
    saveGroup(name);
  };
  const remaining = timed ? remainingSeconds(account, p.nowMs) : null;
  const period = effectivePeriod(account);
  const urgent = remaining !== null && remaining <= WARN_SECONDS;
  // 남은 초가 커졌다 = 새 주기. 그 한 번만 빨강→회색 전환을 끈다(초가 바뀔 때만 갱신).
  const seen = useRef<{ s: number | null; wrap: boolean }>({ s: remaining, wrap: false });
  if (seen.current.s !== remaining) {
    seen.current = {
      s: remaining,
      wrap: seen.current.s !== null && remaining !== null && remaining > seen.current.s,
    };
  }
  const codeText = hidden ? MASKED : pair ? formatCode(pair.code) : '';
  const nextText = hidden ? MASKED : pair ? formatCode(pair.next) : '';
  const params = { issuer: account.issuer, label: account.label };
  const rowClass = [
    'row',
    view === 'compact' && 'row-compact',
    view === 'hidden' && 'row-hidden',
    !p.avatars && 'no-tile',
    urgent && 'urgent',
    (pair ? pair.code.length > 6 : account.digits > 6) && 'long-code',
    seen.current.wrap && 'reset',
    p.suggest && 'suggest',
    p.copied && 'copied',
    'reorderable',
    p.reorder.dragging && 'dragging',
    !p.reorder.dragging && p.reorder.offset !== 0 && 'drag-shifted',
  ]
    .filter(Boolean)
    .join(' ');
  // 줄 안 단추는 줄 전체의 '복사' 누름으로 번지지 않게 한다.
  const only = (fn: () => void) => (e: Event) => {
    e.stopPropagation();
    fn();
  };
  // 5초 이하: 줄 오른쪽 끝의 작은 '다음 코드'. 누르면 다음 코드를 복사한다.
  const nextButton = urgent && pair && view !== 'hidden' && (
    <button
      type="button"
      class="next"
      aria-label={t('popup.copyNextLabel', params)}
      data-next-code={!hidden ? pair.next : undefined}
      onClick={only(() => p.onCopy(1))}
    >
      {t('popup.next')} <span dir="ltr">{nextText}</span>
    </button>
  );
  const nameLine = (
    <div class="nm">
      {account.pinned && (
        <span class="pin" title={t('popup.pinned')} aria-label={t('popup.pinned')}>
          ★
        </span>
      )}
      {account.issuer !== '' ? (
        <>
          <b>{account.issuer}</b>
          <span class="ac">{account.label}</span>
        </>
      ) : (
        <b>{account.label}</b>
      )}
      {nextButton}
    </div>
  );
  const menuItem = (role: string, icon: keyof typeof ICONS, label: string, fn: () => void) => (
    <button
      type="button"
      class={role === 'menu-delete' ? 'mi danger' : 'mi'}
      role="menuitem"
      data-role={role}
      onClick={() => {
        p.onCloseMenu();
        fn();
      }}
    >
      <Icon name={icon} />
      {label}
    </button>
  );

  // 줄 전체에서 복사하므로 코드 단추는 누름을 줄로 전달한다.
  const codeButton = (
    <button
      type="button"
      class="code"
      aria-label={t('popup.copyLabel', params)}
      data-code={!hidden && pair ? pair.code : undefined}
    >
      <CodeGroups text={codeText} />
    </button>
  );

  return (
    <div
      ref={rowRef}
      class={rowClass}
      role="option"
      aria-selected={p.selected}
      data-account-id={account.id}
      tabIndex={-1}
      style={`${remaining !== null ? warnStyle(remaining) : ''};--drag-y:${p.reorder.offset}px`}
      onMouseEnter={p.onHover}
      onMouseLeave={p.onLeave}
      onFocus={p.onFocus}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); p.onOpenMenu(); }}
      onKeyDown={(e) => {
        // 새 그룹 이름 칸: Enter 저장, Esc 는 입력만 접고 그룹 목록으로 돌아간다. 나머지 키는 입력 칸이 받는다.
        if (p.menuOpen && (e.target as HTMLElement).tagName === 'INPUT') {
          if (e.key === 'Escape') {
            e.preventDefault(); e.stopPropagation();
            setGroupPanel('list'); setGroupDraft(''); setGroupInvalid(false);
          } else if (e.key === 'Enter' && !e.isComposing) {
            e.preventDefault(); e.stopPropagation(); submitDraft();
          }
          return;
        }
        if (e.key === 'Escape' && p.menuOpen && groupPanel !== null) {
          e.preventDefault(); e.stopPropagation(); closeGroupPanel();
          return;
        }
        if (p.menuOpen && (e.target as HTMLElement).closest('.menu') &&
            ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
          e.preventDefault();
          e.stopPropagation();
          const items = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]') ?? [])];
          const current = items.indexOf(document.activeElement as HTMLButtonElement);
          const next = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1
            : (current + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
          items[next]?.focus({ preventScroll: true });
          return;
        }
        if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
          e.preventDefault(); e.stopPropagation(); p.onOpenMenu();
        } else if (e.key === 'Escape' && p.menuOpen) {
          e.preventDefault(); e.stopPropagation(); p.onCloseMenu();
          rowRef.current?.querySelector<HTMLButtonElement>('[data-menu-toggle]')?.focus({ preventScroll: true });
        }
      }}
      onClick={() => p.onCopy(0)}
      onClickCapture={p.reorder.onClickCapture}
      onPointerDown={p.reorder.onDragStart}
      onPointerMove={p.reorder.onDragMove}
      onPointerUp={(e) => p.reorder.onDragEnd(e, true)}
      onPointerCancel={(e) => p.reorder.onDragEnd(e, false)}
    >
      {p.avatars && (
        <div class="tile" style={`--h:${tileHue(account.issuer)}`} aria-hidden="true">
          {avatarInitial(account.issuer)}
        </div>
      )}
      <div class="who">
        {view === 'hidden' ? (
          <button type="button" class="row-main" aria-label={t('popup.copyLabel', params)}>
            {nameLine}
          </button>
        ) : (
          nameLine
        )}
        {/* 복사 직후에는 같은 자리에 '✓ 복사됨'. 코드 단추는 DOM 에 두고 CSS 로만 감춘다. */}
        {p.copied && (
          <div class="copied-mark">
            <Icon name="check" />
            {t('popup.copied')}
          </div>
        )}
        {view !== 'hidden' && codeButton}
      </div>
      {timed ? (
        view === 'hidden' || remaining === null ? null : (
          <div class="timer" title={t('popup.seconds', { n: remaining })}>
            <span class="secn">{remaining}</span>
            <Ring period={period} correction={p.correction} nowMs={p.nowMs} />
          </div>
        )
      ) : (
        <button
          type="button"
          class="refresh"
          aria-label={t('popup.refresh')}
          title={t('popup.refresh')}
          onClick={only(p.onRefresh)}
        >
          <Icon name="next" />
        </button>
      )}
      {p.suggest ? (
        <button
          type="button"
          class="fill"
          data-role="fill"
          aria-label={t('popup.fillLabel', params)}
          title={t('popup.fillLabel', params)}
          onClick={only(p.onFill)}
        >
          <Icon name="fill" />
          <span class="fill-text">{t('popup.fill')}</span>
        </button>
      ) : null}
      <button
        type="button"
        class="more"
        data-role="more"
        data-menu-toggle
        aria-haspopup="menu"
        aria-expanded={p.menuOpen}
        aria-label={t('popup.moreLabel', params)}
        title={t('popup.moreLabel', params)}
        onClick={only(p.onToggleMenu)}
      >
        <Icon name="more" />
      </button>
      {p.menuOpen && (
        <div
          ref={menuRef}
          class="menu row-menu"
          role="menu"
          onClick={(e) => e.stopPropagation()}
        >
          {groupPanel === null ? (
            <>
              {menuItem('menu-fill', 'fill', t('popup.menu.fill'), p.onFill)}
              {timed && menuItem('menu-next', 'next', t('popup.menu.next'), () => p.onCopy(1))}
              {p.onQr && menuItem('qr', 'qr', t('popup.menu.qr'), p.onQr)}
              {p.onShare && menuItem('share', 'share', t('share.title'), p.onShare)}
              <hr />
              <button
                type="button"
                class="mi"
                role="menuitem"
                aria-haspopup="true"
                data-role="menu-group"
                onClick={() => setGroupPanel('list')}
              >
                <Icon name="next" />
                <span class="mi-text">
                  {t('popup.menu.group')}{account.group ? ` · ${account.group}` : ''}
                </span>
              </button>
              {menuItem('menu-edit', 'edit', t('popup.edit.open'), p.onOpenEdit)}
              {menuItem('menu-history', 'history', t('history.title'), p.onHistory)}
              <hr />
              {menuItem('menu-delete', 'trash', t('accounts.delete'), p.onDelete)}
            </>
          ) : groupPanel === 'list' ? (
            <>
              {p.groupNames.map((name) => (
                <button
                  key={name}
                  type="button"
                  class="mi"
                  role="menuitemradio"
                  aria-checked={name === account.group}
                  data-role="group-pick"
                  onClick={() => saveGroup(name)}
                >
                  {name === account.group ? <Icon name="check" /> : <span class="mi-blank" aria-hidden="true" />}
                  <span class="mi-text">{name}</span>
                </button>
              ))}
              {p.groupNames.length > 0 && <hr />}
              <button
                type="button"
                class="mi"
                role="menuitem"
                data-role="group-new"
                onClick={() => setGroupPanel('new')}
              >
                <Icon name="plus" />
                <span class="mi-text">{t('popup.group.new')}</span>
              </button>
              {account.group && (
                <button
                  type="button"
                  class="mi"
                  role="menuitem"
                  data-role="group-remove"
                  onClick={() => saveGroup(null)}
                >
                  <Icon name="x" />
                  <span class="mi-text">{t('popup.group.remove')}</span>
                </button>
              )}
            </>
          ) : (
            <input
              type="text"
              class="field group-input"
              data-role="group-input"
              aria-label={t('popup.group.name')}
              placeholder={t('popup.group.name')}
              aria-invalid={groupInvalid}
              autoComplete="off"
              value={groupDraft}
              onInput={(e) => { setGroupDraft(e.currentTarget.value); setGroupInvalid(false); }}
            />
          )}
        </div>
      )}
    </div>
  );
}
