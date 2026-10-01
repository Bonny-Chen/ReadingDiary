import { getDb, type SqlParam } from '@/db';
import { mapBook, type BookRow } from '@/repositories/mappers';
import type { Book } from '@/types/models';

/** 統計範圍：某一年（依 finished_at）或不限年份。 */
export type StatsScope = { kind: 'year'; year: number } | { kind: 'all' };

export interface TrendPoint {
  /** 年度模式為 '1'..'12'，全部模式為 '2024' 這類年份 */
  label: string;
  count: number;
}

export interface CategoryShare {
  id: number;
  name: string;
  count: number;
}

export interface BookDays {
  book: Book;
  days: number;
}

export interface BookQuoteCount {
  bookId: number;
  title: string;
  count: number;
}

export interface ReadingStats {
  finishedCount: number;
  /** 年度：12 筆；全部：從最早讀完的年份到今年，每年一筆。沒書的月／年補 0。 */
  trend: TrendPoint[];
  /** 已讀且起訖日都有的書，含頭尾天數的平均；沒資料為 null */
  avgDays: number | null;
  /** 範圍內有閱讀紀錄的天數（reading_logs 去重） */
  totalReadingDays: number;
  /** 依本數降冪。一本書多個類別會分別計入。 */
  categories: CategoryShare[];
  uncategorizedCount: number;
  fastest: BookDays | null;
  slowest: BookDays | null;
  /** 範圍內的書各記了幾句金句，多的在前，最多 QUOTE_BOOK_LIMIT 本；沒金句的書不列 */
  quotesByBook: BookQuoteCount[];
  totalQuotes: number;
}

const QUOTE_BOOK_LIMIT = 10;

/** 所有統計的母體：已讀完的書，年度模式再限制 finished_at 落在該年。 */
function scopeClause(scope: StatsScope): { sql: string; params: SqlParam[] } {
  if (scope.kind === 'year') {
    return {
      sql: `b.status = 'read' AND b.finished_at BETWEEN ? AND ?`,
      params: [`${scope.year}-01-01`, `${scope.year}-12-31`],
    };
  }
  return { sql: `b.status = 'read' AND b.finished_at IS NOT NULL`, params: [] };
}

/** 閱讀天數含頭尾，跟詳情頁依 reading_logs 算出的天數一致。 */
const DAYS_SQL = 'CAST(julianday(b.finished_at) - julianday(b.started_at) + 1 AS INTEGER)';

export async function getReadingStats(scope: StatsScope): Promise<ReadingStats> {
  const db = await getDb();
  const { sql: where, params } = scopeClause(scope);

  const countRow = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM books b WHERE ${where}`,
    params,
  );
  const finishedCount = countRow?.n ?? 0;

  const trend = await loadTrend(scope, where, params);

  const avgRow = await db.getFirstAsync<{ avg: number | null }>(
    `SELECT AVG(${DAYS_SQL}) AS avg FROM books b
     WHERE ${where} AND b.started_at IS NOT NULL AND b.started_at <= b.finished_at`,
    params,
  );
  const avgDays = avgRow?.avg ?? null;

  const daysRow =
    scope.kind === 'year'
      ? await db.getFirstAsync<{ n: number }>(
          'SELECT COUNT(DISTINCT date) AS n FROM reading_logs WHERE date BETWEEN ? AND ?',
          [`${scope.year}-01-01`, `${scope.year}-12-31`],
        )
      : await db.getFirstAsync<{ n: number }>('SELECT COUNT(DISTINCT date) AS n FROM reading_logs');
  const totalReadingDays = daysRow?.n ?? 0;

  const categoryRows = await db.getAllAsync<{ id: number; name: string; n: number }>(
    `SELECT c.id, c.name, COUNT(*) AS n
     FROM books b
     JOIN book_categories bc ON bc.book_id = b.id
     JOIN categories c ON c.id = bc.category_id
     WHERE ${where}
     GROUP BY c.id
     ORDER BY n DESC, c.sort_order ASC, c.id ASC`,
    params,
  );
  const categories = categoryRows.map((row) => ({ id: row.id, name: row.name, count: row.n }));

  const uncategorizedRow = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM books b
     WHERE ${where} AND NOT EXISTS (SELECT 1 FROM book_categories bc WHERE bc.book_id = b.id)`,
    params,
  );
  const uncategorizedCount = uncategorizedRow?.n ?? 0;

  const fastest = await loadExtreme(where, params, 'ASC');
  const slowest = await loadExtreme(where, params, 'DESC');

  const quoteRows = await db.getAllAsync<{ book_id: number; title: string; n: number }>(
    `SELECT b.id AS book_id, b.title, COUNT(q.id) AS n
     FROM books b JOIN quotes q ON q.book_id = b.id
     WHERE ${where}
     GROUP BY b.id
     ORDER BY n DESC, b.title COLLATE NOCASE ASC
     LIMIT ?`,
    [...params, QUOTE_BOOK_LIMIT],
  );
  const quotesByBook = quoteRows.map((row) => ({ bookId: row.book_id, title: row.title, count: row.n }));
  const totalRow = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(q.id) AS n FROM books b JOIN quotes q ON q.book_id = b.id WHERE ${where}`,
    params,
  );
  const totalQuotes = totalRow?.n ?? 0;

  return {
    finishedCount,
    trend,
    avgDays,
    totalReadingDays,
    categories,
    uncategorizedCount,
    fastest,
    slowest,
    quotesByBook,
    totalQuotes,
  };
}

async function loadTrend(scope: StatsScope, where: string, params: SqlParam[]): Promise<TrendPoint[]> {
  const db = await getDb();

  if (scope.kind === 'year') {
    const rows = await db.getAllAsync<{ m: string; n: number }>(
      `SELECT substr(b.finished_at, 6, 2) AS m, COUNT(*) AS n
       FROM books b WHERE ${where} GROUP BY m`,
      params,
    );
    const byMonth = new Map(rows.map((row) => [Number(row.m), row.n]));
    return Array.from({ length: 12 }, (_, i) => ({
      label: String(i + 1),
      count: byMonth.get(i + 1) ?? 0,
    }));
  }

  const rows = await db.getAllAsync<{ y: string; n: number }>(
    `SELECT substr(b.finished_at, 1, 4) AS y, COUNT(*) AS n
     FROM books b WHERE ${where} GROUP BY y`,
    params,
  );
  const currentYear = new Date().getFullYear();
  if (rows.length === 0) return [{ label: String(currentYear), count: 0 }];

  const byYear = new Map(rows.map((row) => [Number(row.y), row.n]));
  const firstYear = Math.min(...byYear.keys());
  const lastYear = Math.max(currentYear, ...byYear.keys());
  const trend: TrendPoint[] = [];
  for (let year = firstYear; year <= lastYear; year++) {
    trend.push({ label: String(year), count: byYear.get(year) ?? 0 });
  }
  return trend;
}

/** 讀最快（ASC）／最久（DESC）的書；同天數時取最近讀完的那本。 */
async function loadExtreme(
  where: string,
  params: SqlParam[],
  direction: 'ASC' | 'DESC',
): Promise<BookDays | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<BookRow & { days: number }>(
    `SELECT b.*, ${DAYS_SQL} AS days FROM books b
     WHERE ${where} AND b.started_at IS NOT NULL AND b.started_at <= b.finished_at
     ORDER BY days ${direction}, b.finished_at DESC, b.id DESC
     LIMIT 1`,
    params,
  );
  if (!row) return null;
  const { days, ...bookRow } = row;
  return { book: mapBook(bookRow), days };
}
