import { MIGRATIONS } from '@/db/migrations';
import { openDatabase } from '@/db/open';

/**
 * repository 只依賴這個介面，讓測試能換成 node:sqlite 的 in-memory 實作。
 * 形狀刻意對齊 expo-sqlite 的非同步 API。
 */
export interface SqlDatabase {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, params?: SqlParam[]): Promise<{ lastInsertRowId: number; changes: number }>;
  getAllAsync<T>(sql: string, params?: SqlParam[]): Promise<T[]>;
  getFirstAsync<T>(sql: string, params?: SqlParam[]): Promise<T | null>;
  withTransactionAsync(fn: () => Promise<void>): Promise<void>;
}

export type SqlParam = string | number | null;

export const DATABASE_NAME = 'reading.db';

let dbPromise: Promise<SqlDatabase> | null = null;

/** 依序套用尚未執行過的 migration，版本存在 PRAGMA user_version。 */
export async function migrate(db: SqlDatabase): Promise<void> {
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;

  for (let version = current; version < MIGRATIONS.length; version++) {
    await db.execAsync(MIGRATIONS[version]);
    // PRAGMA 不支援參數綁定，版本號來自迴圈索引，無注入風險
    await db.execAsync(`PRAGMA user_version = ${version + 1}`);
  }
}

export function getDb(): Promise<SqlDatabase> {
  if (!dbPromise) {
    dbPromise = openDatabase(DATABASE_NAME).then(async (db) => {
      await migrate(db);
      return db;
    });
  }
  return dbPromise;
}

/** 測試用：注入一個 in-memory 資料庫，或傳 null 還原。 */
export function setDbForTesting(db: SqlDatabase | null): void {
  dbPromise = db ? Promise.resolve(db) : null;
}

/** 把資料庫關閉並重新開啟（匯入備份後使用）。 */
export async function resetDbHandle(): Promise<void> {
  dbPromise = null;
}
