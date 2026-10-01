import { getDb } from '@/db';
import { mapGoal, type GoalRow } from '@/repositories/mappers';
import type { Goal } from '@/types/models';

export async function getGoal(year: number): Promise<Goal | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<GoalRow>('SELECT * FROM goals WHERE year = ?', [year]);
  return row ? mapGoal(row) : null;
}

export async function setGoal(year: number, targetCount: number): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO goals (year, target_count) VALUES (?, ?)
     ON CONFLICT(year) DO UPDATE SET target_count = excluded.target_count`,
    [year, Math.max(0, Math.floor(targetCount))],
  );
}

export async function clearGoal(year: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM goals WHERE year = ?', [year]);
}

export async function listGoals(): Promise<Goal[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<GoalRow>('SELECT * FROM goals ORDER BY year DESC');
  return rows.map(mapGoal);
}

/** 年份選擇器往前翻的下限：goals 或已讀完書籍中最早出現的年份，沒資料就回傳今年。 */
export async function getEarliestActivityYear(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ year: number | null }>(
    `SELECT MIN(y) AS year FROM (
       SELECT year AS y FROM goals
       UNION ALL
       SELECT CAST(substr(finished_at, 1, 4) AS INTEGER) AS y
       FROM books WHERE finished_at IS NOT NULL
     )`,
  );
  return row?.year ?? new Date().getFullYear();
}
