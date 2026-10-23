import { toggleCodesHidden } from '../ui/shared/codes-hidden';
import { generateCode } from '../core/otp';
import type { Account } from '../core/types';
import { readClockCorrection } from '../store/clock';
import { isLocked } from '../store/lock';
import { withSessionLock } from '../store/session';
import { loadSettings } from '../store/settings';
import { loadAccounts } from '../store/vault';
import { fillActiveTab } from './fill';
import { scheduleClipboardClear, writeClipboardViaOffscreen } from './clipboard';

const PINNED_COMMAND = /^copy-pinned-([1-3])$/;

export type PinnedPick = { kind: 'ok'; account: Account } | { kind: 'missing' } | { kind: 'hotp' };

// 휴지통이 아닌 중요 표시 계정을 저장된 순서대로 골라 n번째(1부터). HOTP 는 카운터를 올리지 않으려 복사하지 않는다.
export function pickPinnedAccount(accounts: Account[], n: number): PinnedPick {
  const account = accounts.filter((a) => a.pinned && a.deletedAt === undefined)[n - 1];
  if (!account) return { kind: 'missing' };
  return account.type === 'hotp' ? { kind: 'hotp' } : { kind: 'ok', account };
}

type Outcome = 'shortcutCopied' | 'shortcutLocked' | 'shortcutMissing' | 'shortcutFailed';

let restoreTimer: ReturnType<typeof setTimeout> | undefined;
let saved: { text: string; title: string } | undefined;

// 배지(✓ 또는 !)와 action 제목으로 알리고 2초 뒤 원래대로 돌린다. 코드·계정명은 싣지 않는다.
async function notify(outcome: Outcome): Promise<void> {
  try {
    if (!saved) saved = { text: await chrome.action.getBadgeText({}), title: await chrome.action.getTitle({}) };
    await chrome.action.setBadgeText({ text: outcome === 'shortcutCopied' ? '✓' : '!' });
    await chrome.action.setTitle({ title: chrome.i18n.getMessage(outcome) });
    clearTimeout(restoreTimer);
    restoreTimer = setTimeout(() => {
      const original = saved;
      saved = undefined;
      if (!original) return;
      void chrome.action.setBadgeText({ text: original.text }).catch(() => undefined);
      void chrome.action.setTitle({ title: original.title }).catch(() => undefined);
    }, 2000);
  } catch (error) {
    console.warn('shortcut-notify', error);
  }
}

async function copyPinned(n: number): Promise<Outcome> {
  if (await isLocked()) return 'shortcutLocked';
  const pick = pickPinnedAccount(await loadAccounts(), n);
  if (pick.kind === 'missing') return 'shortcutMissing';
  if (pick.kind === 'hotp') return 'shortcutFailed';
  const code = await generateCode(pick.account, Date.now() + (await readClockCorrection()));
  // 코드를 만드는 사이 잠겼으면 쓰지 않는다. 확인부터 쓰기 끝까지 lockNow 와 줄을 세워 그 사이 잠기지 않게 한다.
  const written = await withSessionLock(async (): Promise<Outcome | null> => {
    if (await isLocked()) return 'shortcutLocked';
    return (await writeClipboardViaOffscreen(code)) ? null : 'shortcutFailed';
  });
  if (written) return written;
  const settings = await loadSettings();
  if (settings.clipboardClearAfterCopy) await scheduleClipboardClear(code).catch((e) => console.warn('clipboard-clear', e));
  return 'shortcutCopied';
}

export function register(): void {
  chrome.commands.onCommand.addListener((command) => {
    const pinned = PINNED_COMMAND.exec(command);
    if (pinned) {
      void copyPinned(Number(pinned[1]))
        .catch((error): Outcome => {
          console.warn(command, error);
          return 'shortcutFailed';
        })
        .then(notify);
    } else if (command === 'hide-codes') {
      void toggleCodesHidden().catch((error) => console.warn('hide-codes', error));
    } else if (command === 'quick-fill' || command === 'autofill') {
      void fillActiveTab().catch((error) => console.warn(command, error));
    }
  });
}
