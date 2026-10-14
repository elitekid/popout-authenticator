// 시험용 chrome.* 최소 흉내. vitest setupFiles 로 전역에 설치된다.

type Items = Record<string, unknown>;
type Change = { oldValue?: unknown; newValue?: unknown };
type Listener<A extends unknown[]> = (...args: A) => void;

function createEvent<A extends unknown[]>() {
  const listeners = new Set<Listener<A>>();
  return {
    addListener: (fn: Listener<A>) => void listeners.add(fn),
    removeListener: (fn: Listener<A>) => void listeners.delete(fn),
    hasListener: (fn: Listener<A>) => listeners.has(fn),
    dispatch: (...args: A) => listeners.forEach((fn) => fn(...args)),
  };
}

export function createStorageArea(name: string) {
  let data: Items = {};
  const onChanged = createEvent<[Record<string, Change>, string]>();

  const emit = (changes: Record<string, Change>) => {
    if (Object.keys(changes).length > 0) onChanged.dispatch(changes, name);
  };
  const copy = <T,>(value: T): T => structuredClone(value);

  return {
    onChanged,
    async get(keys?: string | string[] | Items | null): Promise<Items> {
      if (keys == null) return copy(data);
      if (typeof keys === 'string') keys = [keys];
      if (Array.isArray(keys)) {
        const out: Items = {};
        for (const key of keys) if (key in data) out[key] = copy(data[key]);
        return out;
      }
      const out: Items = {};
      for (const [key, fallback] of Object.entries(keys)) {
        out[key] = key in data ? copy(data[key]) : copy(fallback);
      }
      return out;
    },
    async set(items: Items): Promise<void> {
      const changes: Record<string, Change> = {};
      for (const [key, value] of Object.entries(items)) {
        changes[key] = { oldValue: data[key], newValue: copy(value) };
        data[key] = copy(value);
      }
      emit(changes);
    },
    async remove(keys: string | string[]): Promise<void> {
      const changes: Record<string, Change> = {};
      for (const key of Array.isArray(keys) ? keys : [keys]) {
        if (!(key in data)) continue;
        changes[key] = { oldValue: data[key] };
        delete data[key];
      }
      emit(changes);
    },
    async clear(): Promise<void> {
      const changes: Record<string, Change> = {};
      for (const [key, value] of Object.entries(data)) changes[key] = { oldValue: value };
      data = {};
      emit(changes);
    },
  };
}

type Alarm = { name: string; scheduledTime: number; periodInMinutes?: number };

function createAlarms() {
  const alarms = new Map<string, Alarm>();
  const onAlarm = createEvent<[Alarm]>();
  return {
    onAlarm,
    async create(
      name: string,
      info: { when?: number; delayInMinutes?: number; periodInMinutes?: number },
    ) {
      const scheduledTime = info.when ?? Date.now() + (info.delayInMinutes ?? 0) * 60_000;
      alarms.set(name, { name, scheduledTime, periodInMinutes: info.periodInMinutes });
    },
    async get(name: string) {
      return alarms.get(name);
    },
    async getAll() {
      return [...alarms.values()];
    },
    async clear(name: string) {
      return alarms.delete(name);
    },
    async clearAll() {
      alarms.clear();
      return true;
    },
  };
}

export function createChromeMock() {
  const local = createStorageArea('local');
  const sync = createStorageArea('sync');
  const session = createStorageArea('session');
  const managed = createStorageArea('managed');
  const areas = { local, sync, session, managed };

  const onChanged = createEvent<[Record<string, Change>, string]>();
  for (const area of Object.values(areas)) {
    area.onChanged.addListener((changes, areaName) => onChanged.dispatch(changes, areaName));
  }

  return {
    storage: { ...areas, onChanged },
    runtime: {
      id: 'test-extension-id',
      getURL: (path: string) => `chrome-extension://test-extension-id/${path.replace(/^\//, '')}`,
      onInstalled: createEvent<[unknown]>(),
      onStartup: createEvent<[]>(),
      onConnect: createEvent<[unknown]>(),
      onMessage: createEvent<[unknown, unknown, (response?: unknown) => void]>(),
    },
    alarms: createAlarms(),
  };
}

(globalThis as unknown as { chrome: unknown }).chrome = createChromeMock();
