import { getDb } from '@/db';
import { mapCategory, type CategoryRow } from '@/repositories/mappers';
import type { Category } from '@/types/models';

export async function listCategories(): Promise<Category[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<CategoryRow>(
    'SELECT * FROM categories ORDER BY sort_order ASC, id ASC',
  );
  return rows.map(mapCategory);
}

/** 名稱重複時回傳既有類別的 id，不新增。 */
export async function addCategory(name: string): Promise<number> {
  const db = await getDb();
  const trimmed = name.trim();
  const existing = await db.getFirstAsync<CategoryRow>(
    'SELECT * FROM categories WHERE name = ?',
    [trimmed],
  );
  if (existing) return existing.id;

  const max = await db.getFirstAsync<{ n: number | null }>(
    'SELECT MAX(sort_order) AS n FROM categories',
  );
  const result = await db.runAsync('INSERT INTO categories (name, sort_order) VALUES (?, ?)', [
    trimmed,
    (max?.n ?? -1) + 1,
  ]);
  return result.lastInsertRowId;
}

export async function renameCategory(id: number, name: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE categories SET name = ? WHERE id = ?', [name.trim(), id]);
}

/** 長按拖移排序後呼叫：依傳入順序（第一個排最前面）重新編號 sort_order。 */
export async function reorderCategories(orderedIds: number[]): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (let i = 0; i < orderedIds.length; i++) {
      await db.runAsync('UPDATE categories SET sort_order = ? WHERE id = ?', [i, orderedIds[i]]);
    }
  });
}

export async function deleteCategory(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM book_categories WHERE category_id = ?', [id]);
  await db.runAsync('DELETE FROM categories WHERE id = ?', [id]);
}

/** 書庫篩選列用：每個類別目前有幾本書。 */
export async function categoryCounts(): Promise<Record<number, number>> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ category_id: number; n: number }>(
    'SELECT category_id, COUNT(*) AS n FROM book_categories GROUP BY category_id',
  );
  const counts: Record<number, number> = {};
  for (const row of rows) counts[row.category_id] = row.n;
  return counts;
}
