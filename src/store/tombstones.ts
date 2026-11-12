// 휴지통에서 실제로 지운 계정의 삭제 표시. 동기화가 다른 기기로 삭제를 전파할 때 쓴다.
const KEY = 'syncTomb';
export const MAX_TOMBSTONES = 500;

export type Tombstones = Record<string, number>;

// 같은 id 면 큰 값, 최신 MAX_TOMBSTONES 개만 남긴다.
export function mergeTombstones(a: Tombstones, b: Tombstones): Tombstones {
  const merged = new Map<string, number>();
  for (const source of [a, b]) {
    for (const [id, at] of Object.entries(source)) {
      if (typeof at !== 'number' || !Number.isFinite(at)) continue;
      const prev = merged.get(id);
      if (prev === undefined || at > prev) merged.set(id, at);
    }
  }
  const newest = [...merged.entries()].sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1));
  return Object.fromEntries(newest.slice(0, MAX_TOMBSTONES));
}

export async function readTombstones(): Promise<Tombstones> {
  const got = await chrome.storage.local.get(KEY);
  const value: unknown = got[KEY];
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  return mergeTombstones(value as Tombstones, {});
}

export async function saveTombstones(tombs: Tombstones): Promise<void> {
  await chrome.storage.local.set({ [KEY]: mergeTombstones(tombs, {}) });
}

export async function recordTombstones(ids: string[], at: number = Date.now()): Promise<void> {
  if (ids.length === 0) return;
  const add: Tombstones = {};
  for (const id of ids) add[id] = at;
  await saveTombstones(mergeTombstones(await readTombstones(), add));
}
