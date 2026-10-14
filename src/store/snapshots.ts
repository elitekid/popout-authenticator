// 금고 이전 판 스냅샷. IndexedDB 'popout-authenticator' / 'snapshots'.
import type { VaultFile } from '../core/types';

const DB_NAME = 'popout-authenticator';
const STORE = 'snapshots';
const DAY_MS = 86_400_000;
const KEEP_LATEST = 30;
const KEEP_DAYS = 30;

type SnapshotRecord = {
  id: number;
  takenAt: number;
  count: number;
  lock: VaultFile['lock'];
  file: VaultFile;
};

export type SnapshotInfo = Pick<SnapshotRecord, 'id' | 'takenAt' | 'count' | 'lock'>;
export type SnapshotCursor = Pick<SnapshotInfo, 'id' | 'takenAt'>;

// 변경 기록은 큰 금고 파일을 getAll 로 모으지 않고 최신순으로 최대 한 페이지의 메타만 읽는다.
export async function listSnapshotPage(before?: SnapshotCursor, limit = 10): Promise<{
  items: SnapshotInfo[];
  next?: SnapshotCursor;
}> {
  const db = await openDb();
  const size = Math.max(1, Math.min(10, Math.floor(limit)));
  return new Promise((resolve, reject) => {
    const items: SnapshotInfo[] = [];
    const request = db.transaction(STORE, 'readonly').objectStore(STORE).index('takenAt')
      .openCursor(before ? IDBKeyRange.upperBound(before.takenAt) : null, 'prev');
    request.onerror = () => reject(request.error ?? new Error('snapshot page failed'));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return resolve({ items });
      const record = cursor.value as SnapshotRecord;
      if (before && record.takenAt === before.takenAt && record.id >= before.id) {
        cursor.continue();
        return;
      }
      if (items.length === size) {
        const last = items[items.length - 1]!;
        return resolve({ items, next: { id: last.id, takenAt: last.takenAt } });
      }
      const { id, takenAt, count, lock } = record;
      items.push({ id, takenAt, count, lock });
      cursor.continue();
    };
  });
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  const opened = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
      store.createIndex('takenAt', 'takenAt');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('indexedDB open failed'));
    request.onblocked = () => reject(new Error('indexedDB open blocked'));
  });
  dbPromise = opened;
  // 실패한 열기를 붙들고 있지 않는다.
  opened.catch(() => {
    if (dbPromise === opened) dbPromise = null;
  });
  return opened;
}

// 초기화: 스냅샷을 모두 지운다. DB 를 지우면 다른 탭의 열린 연결에 막히니 저장소를 비운다.
export async function clearSnapshots(): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('snapshot clear failed'));
    tx.onabort = () => reject(tx.error ?? new Error('snapshot clear aborted'));
  });
}

// 시험에서 indexedDB 를 바꿔 끼우기 전에 부른다.
export async function _resetSnapshotsForTest(): Promise<void> {
  const pending = dbPromise;
  dbPromise = null;
  if (!pending) return;
  try {
    (await pending).close();
  } catch {
    // 열기에 실패했으면 닫을 것이 없다.
  }
}

function done<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('indexedDB request failed'));
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('indexedDB transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('indexedDB transaction aborted'));
  });
}

async function allRecords(): Promise<SnapshotRecord[]> {
  const db = await openDb();
  const records = (await done(db.transaction(STORE, 'readonly').objectStore(STORE).getAll())) as SnapshotRecord[];
  return records.sort((a, b) => b.takenAt - a.takenAt || b.id - a.id);
}

export async function addSnapshot(file: VaultFile, now: number = Date.now()): Promise<void> {
  const db = await openDb();
  const latest = await done(
    db.transaction(STORE, 'readonly').objectStore(STORE).index('takenAt').openCursor(null, 'prev'),
  );
  const last = latest?.value as SnapshotRecord | undefined;
  if (last && last.file.checksum === file.checksum) return;
  const record: Omit<SnapshotRecord, 'id'> = { takenAt: now, count: file.count, lock: file.lock, file };
  const tx = db.transaction(STORE, 'readwrite');
  tx.objectStore(STORE).add(record);
  await txDone(tx);
  await pruneSnapshots(now);
}

export async function listSnapshots(): Promise<SnapshotInfo[]> {
  return (await allRecords()).map(({ id, takenAt, count, lock }) => ({ id, takenAt, count, lock }));
}

export async function getSnapshot(id: number): Promise<VaultFile | null> {
  const db = await openDb();
  const record = (await done(db.transaction(STORE, 'readonly').objectStore(STORE).get(id))) as
    | SnapshotRecord
    | undefined;
  return record ? record.file : null;
}

// 최신 30개 + 최근 30일 안의 UTC 날짜별 가장 최근 1개를 남긴다.
export async function pruneSnapshots(now: number = Date.now()): Promise<number> {
  const records = await allRecords(); // 최신순
  const keep = new Set<number>();
  records.slice(0, KEEP_LATEST).forEach((r) => keep.add(r.id));
  const cutoff = now - KEEP_DAYS * DAY_MS;
  const seenDays = new Set<number>();
  for (const r of records) {
    if (r.takenAt <= cutoff) continue;
    const day = Math.floor(r.takenAt / DAY_MS);
    if (seenDays.has(day)) continue;
    seenDays.add(day);
    keep.add(r.id);
  }
  const doomed = records.filter((r) => !keep.has(r.id));
  if (doomed.length === 0) return 0;
  const db = await openDb();
  const tx = db.transaction(STORE, 'readwrite');
  const store = tx.objectStore(STORE);
  for (const r of doomed) store.delete(r.id);
  await txDone(tx);
  return doomed.length;
}
