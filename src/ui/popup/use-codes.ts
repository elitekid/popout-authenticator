import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { generateCode, secondsRemaining, totpCounter } from '../../core/otp';
import type { Account } from '../../core/types';

// at: 이 코드를 계산한 시각. '다음 코드' 복사는 이 시각 기준 한 주기 뒤를 쓴다(화면에 보인 값 그대로).
export type CodePair = { code: string; next: string; at: number };

// steam·battle 은 30초 고정
export function effectivePeriod(account: Pick<Account, 'type' | 'period'>): number {
  return account.type === 'totp' ? account.period : 30;
}

export function remainingSeconds(account: Pick<Account, 'type' | 'period'>, nowMs: number): number {
  try {
    return secondsRemaining(nowMs, effectivePeriod(account));
  } catch {
    return 0; // 잘못된 주기 값: 그리기를 깨지 않는다.
  }
}

// 주기(또는 HOTP 카운터·계정 내용)가 바뀔 때만 코드를 새로 계산한다.
function cacheKey(a: Account, nowMs: number): string {
  const step = a.type === 'hotp' ? (a.counter ?? 0) : totpCounter(nowMs, effectivePeriod(a));
  return `${a.type}:${a.algorithm}:${a.digits}:${a.period}:${a.updatedAt}:${step}`;
}

export function useCodes(accounts: Account[], nowMs: number, enabled = true): Map<string, CodePair> {
  const cache = useRef(new Map<string, { key: string; pair: CodePair }>());
  const [codes, setCodes] = useState<Map<string, CodePair>>(() => new Map());
  const live = useMemo(() => new Set(accounts.map((account) => account.id)), [accounts]);
  const second = Math.floor(nowMs / 1000);

  // 계산이 진행 중이면 새 계산을 시작하지 않고 입력만 갱신한다. 끝난 뒤 최신 입력으로 한 번 더 돈다.
  const latest = useRef({ accounts, live, second, enabled });
  const running = useRef(false);
  const dirty = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    latest.current = { accounts, live, second, enabled };
    if (!enabled) return;
    dirty.current = true;
    if (running.current) return;
    running.current = true;
    void (async () => {
      try {
        while (dirty.current && alive.current) {
          dirty.current = false;
          await compute();
        }
      } finally {
        running.current = false;
      }
    })();

    async function compute(): Promise<void> {
      const { accounts, live, second } = latest.current;
      const now = second * 1000;
      // 이번 실행의 결과는 임시 사본에 모으고, 끝까지 돈 뒤에 캐시와 화면에 함께 반영한다.
      const previous = cache.current;
      let draft = previous;
      // 대부분의 초에는 코드가 그대로다. 내용이 바뀔 때만 목록 크기의 사본을 만든다.
      const writable = () => {
        if (draft === previous) draft = new Map(previous);
        return draft;
      };
      let changed = false;
      for (const a of accounts) {
        try {
          const key = cacheKey(a, now);
          if (draft.get(a.id)?.key === key) continue;
          const code = await generateCode(a, now);
          const next = a.type === 'hotp' ? code : await generateCode(a, now, 0, 1);
          writable().set(a.id, { key, pair: { code, next, at: now } });
          changed = true;
        } catch {
          if (draft.has(a.id)) { writable().delete(a.id); changed = true; }
        }
      }
      for (const id of previous.keys()) {
        if (!live.has(id)) {
          writable().delete(id);
          changed = true;
        }
      }
      if (!alive.current || !latest.current.enabled) return;
      cache.current = draft;
      if (changed) setCodes(new Map([...draft].map(([id, v]) => [id, v.pair] as const)));
    }
  },[accounts, live, second, enabled]);

  return codes;
}
