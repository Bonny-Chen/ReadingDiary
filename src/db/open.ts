import initSqlJs, { type Database, type SqlValue } from 'sql.js';

import type { SqlDatabase, SqlParam } from '@/db';
import { BASE_URL } from '@/utils/base-url';

/**
 * Web 版資料庫：sql.js（SQLite 編譯成 WASM）在記憶體執行，
 * 每次寫入後把整個資料庫以 Uint8Array 存進 IndexedDB。
 * 刻意不用 OPFS／SharedArrayBuffer，因為 GitHub Pages 無法設定 COOP/COEP 標頭。
 */

const IDB_NAME = 'reading-diary';
const IDB_STORE = 'kv';
const SAVE_DEBOUNCE_MS = 300;

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(IDB_STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function idbGet(key: string): Promise<Uint8Array | null> {
  const idb = await openIdb();
  return new Promise((resolve, reject) => {
    const request = idb.transaction(IDB_STORE).objectStore(IDB_STORE).get(key);
    request.onsuccess = () => resolve((request.result as Uint8Array | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
}

async function idbPut(key: string, value: Uint8Array): Promise<void> {
  const idb = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function openDatabase(name: string): Promise<SqlDatabase> {
  const SQL = await initSqlJs({ locateFile: (file) => `${BASE_URL}/${file}` });
  const saved = await idbGet(name).catch(() => null);
  const db: Database = saved ? new SQL.Database(saved) : new SQL.Database();

  // 要求瀏覽器不要在儲存空間吃緊時清掉資料
  void navigator.storage?.persist?.().catch(() => undefined);

  let timer: ReturnType<typeof setTimeout> | null = null;
  let dirty = false;

  const flush = async () => {
    if (!dirty) return;
    dirty = false;
    try {
      await idbPut(name, db.export());
    } catch {
      dirty = true;
    }
  };
  const scheduleSave = () => {
    dirty = true;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void flush(), SAVE_DEBOUNCE_MS);
  };
  // 使用者切走或關閉 App 時立刻存檔，避免 debounce 還沒觸發就丟資料
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flush();
  });
  window.addEventListener('pagehide', () => void flush());

  const toValues = (params?: SqlParam[]): SqlValue[] => (params ?? []) as SqlValue[];

  const query = <T>(sql: string, params?: SqlParam[]): T[] => {
    const stmt = db.prepare(sql);
    try {
      stmt.bind(toValues(params));
      const rows: T[] = [];
      while (stmt.step()) rows.push(stmt.getAsObject() as T);
      return rows;
    } finally {
      stmt.free();
    }
  };

  return {
    async execAsync(sql) {
      db.exec(sql);
      scheduleSave();
    },
    async runAsync(sql, params) {
      db.run(sql, toValues(params));
      const changes = db.getRowsModified();
      const id = db.exec('SELECT last_insert_rowid()')[0]?.values[0]?.[0];
      scheduleSave();
      return { lastInsertRowId: Number(id ?? 0), changes };
    },
    async getAllAsync<T>(sql: string, params?: SqlParam[]) {
      return query<T>(sql, params);
    },
    async getFirstAsync<T>(sql: string, params?: SqlParam[]) {
      return query<T>(sql, params)[0] ?? null;
    },
    async withTransactionAsync(fn) {
      db.exec('BEGIN');
      try {
        await fn();
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      } finally {
        scheduleSave();
      }
    },
  };
}
