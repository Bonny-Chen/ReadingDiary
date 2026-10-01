import { DatabaseSync } from 'node:sqlite';

import { migrate, setDbForTesting, type SqlDatabase, type SqlParam } from '@/db';

/**
 * 測試用的 in-memory 資料庫：把 Node 內建的 node:sqlite 包成與 expo-sqlite 相同的介面，
 * 讓 repository 在 jest 裡跑的是真的 SQL，而不是被 mock 掉的假物件。
 */
function wrap(db: DatabaseSync): SqlDatabase {
  return {
    async execAsync(sql: string) {
      db.exec(sql);
    },
    async runAsync(sql: string, params: SqlParam[] = []) {
      const result = db.prepare(sql).run(...params);
      return {
        lastInsertRowId: Number(result.lastInsertRowid),
        changes: Number(result.changes),
      };
    },
    async getAllAsync<T>(sql: string, params: SqlParam[] = []) {
      return db.prepare(sql).all(...params) as T[];
    },
    async getFirstAsync<T>(sql: string, params: SqlParam[] = []) {
      const row = db.prepare(sql).get(...params);
      return (row ?? null) as T | null;
    },
    async withTransactionAsync(fn: () => Promise<void>) {
      db.exec('BEGIN');
      try {
        await fn();
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
  };
}

/** 建立一個已套用 migration 的空資料庫，並註冊給 repository 使用。 */
export async function createTestDb(): Promise<SqlDatabase> {
  const raw = new DatabaseSync(':memory:');
  const db = wrap(raw);
  await migrate(db);
  setDbForTesting(db);
  return db;
}

export function clearTestDb(): void {
  setDbForTesting(null);
}
