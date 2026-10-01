import { getDb, type SqlParam } from '@/db';
import { mapBook, type BookRow } from '@/repositories/mappers';
import { syncLogsFromRange, trimLogsOutsideRange } from '@/repositories/readingLogRepo';
import type { Book, BookInput, BookWithCategories, ReadingStatus } from '@/types/models';
import { todayIso } from '@/utils/date';

export type BookSort = 'createdDesc' | 'titleAsc' | 'authorAsc' | 'finishedDesc' | 'ratingDesc';

const SORT_SQL: Record<BookSort, string> = {
  createdDesc: 'b.created_at DESC, b.id DESC',
  titleAsc: 'b.title COLLATE NOCASE ASC',
  authorAsc: 'b.authors COLLATE NOCASE ASC, b.title COLLATE NOCASE ASC',
  finishedDesc: 'b.finished_at IS NULL, b.finished_at DESC',
  ratingDesc: 'b.rating IS NULL, b.rating DESC, b.title COLLATE NOCASE ASC',
};

export interface BookFilter {
  status?: ReadingStatus | null;
  /** 任一類別命中即納入（OR） */
  categoryIds?: number[];
  search?: string;
  /** 依狀態各自對應的年份篩選，見 yearClause */
  year?: number;
  sort?: BookSort;
  limit?: number;
}

/**
 * 「某一年的書」依狀態各有不同依據：已讀看完成日期、在讀看開始日期、
 * 未讀沒有閱讀日期，就看是哪一年加入書庫的（created_at 是 UTC ISO 字串，轉成本地時區再取年）。
 */
function yearClause(year: number): { sql: string; params: SqlParam[] } {
  return {
    sql: `CASE b.status
      WHEN 'read' THEN b.finished_at BETWEEN ? AND ?
      WHEN 'reading' THEN b.started_at BETWEEN ? AND ?
      ELSE strftime('%Y', b.created_at, 'localtime') = ?
    END`,
    params: [`${year}-01-01`, `${year}-12-31`, `${year}-01-01`, `${year}-12-31`, String(year)],
  };
}

/** 書庫年份篩選列用：每本書依 yearClause 同樣的規則歸到某一年，回傳有書的年份（新的在前）。 */
export async function listBookYears(): Promise<number[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ y: string | null }>(
    `SELECT DISTINCT CASE b.status
       WHEN 'read' THEN substr(b.finished_at, 1, 4)
       WHEN 'reading' THEN substr(b.started_at, 1, 4)
       ELSE strftime('%Y', b.created_at, 'localtime')
     END AS y
     FROM books b
     ORDER BY y DESC`,
  );
  return rows.map((row) => Number(row.y)).filter((y) => Number.isFinite(y) && y > 0);
}

function nowIso(): string {
  return new Date().toISOString();
}

async function attachCategories(books: Book[]): Promise<BookWithCategories[]> {
  if (books.length === 0) return [];
  const db = await getDb();
  const placeholders = books.map(() => '?').join(',');
  const rows = await db.getAllAsync<{ book_id: number; category_id: number }>(
    `SELECT book_id, category_id FROM book_categories WHERE book_id IN (${placeholders})`,
    books.map((b) => b.id),
  );
  const byBook = new Map<number, number[]>();
  for (const row of rows) {
    const list = byBook.get(row.book_id) ?? [];
    list.push(row.category_id);
    byBook.set(row.book_id, list);
  }
  return books.map((book) => ({ ...book, categoryIds: byBook.get(book.id) ?? [] }));
}

export async function listBooks(filter: BookFilter = {}): Promise<BookWithCategories[]> {
  const db = await getDb();
  const where: string[] = [];
  const params: SqlParam[] = [];

  if (filter.status) {
    where.push('b.status = ?');
    params.push(filter.status);
  }

  if (filter.categoryIds && filter.categoryIds.length > 0) {
    const placeholders = filter.categoryIds.map(() => '?').join(',');
    where.push(
      `EXISTS (SELECT 1 FROM book_categories bc WHERE bc.book_id = b.id AND bc.category_id IN (${placeholders}))`,
    );
    params.push(...filter.categoryIds);
  }

  if (filter.year != null) {
    const clause = yearClause(filter.year);
    where.push(clause.sql);
    params.push(...clause.params);
  }

  const search = filter.search?.trim();
  if (search) {
    where.push('(b.title LIKE ? OR b.authors LIKE ? OR b.isbn13 LIKE ? OR b.isbn10 LIKE ?)');
    const like = `%${search}%`;
    params.push(like, like, like, like);
  }

  const orderBy = SORT_SQL[filter.sort ?? 'createdDesc'];
  const limitSql = filter.limit ? ` LIMIT ${Math.max(1, Math.floor(filter.limit))}` : '';
  const rows = await db.getAllAsync<BookRow>(
    `SELECT b.* FROM books b
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY ${orderBy}${limitSql}`,
    params,
  );
  return attachCategories(rows.map(mapBook));
}

export async function getBook(id: number): Promise<BookWithCategories | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<BookRow>('SELECT * FROM books WHERE id = ?', [id]);
  if (!row) return null;
  const [book] = await attachCategories([mapBook(row)]);
  return book;
}

/** 掃描／手動輸入 ISBN 後用來偵測重複。isbn13 與 isbn10 都比對。 */
export async function findByIsbn(isbn: string): Promise<Book | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<BookRow>(
    'SELECT * FROM books WHERE isbn13 = ? OR isbn10 = ? LIMIT 1',
    [isbn, isbn],
  );
  return row ? mapBook(row) : null;
}

function inputParams(input: BookInput): SqlParam[] {
  return [
    input.isbn13,
    input.isbn10,
    input.title,
    input.authors,
    input.country,
    input.publishedDate,
    input.description,
    input.coverUri,
    input.coverIsCustom ? 1 : 0,
    input.status,
    input.startedAt,
    input.finishedAt,
    input.rating,
    input.notes,
    input.metadataSource,
  ];
}

async function replaceCategories(bookId: number, categoryIds: number[]): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM book_categories WHERE book_id = ?', [bookId]);
  for (const categoryId of categoryIds) {
    await db.runAsync(
      'INSERT OR IGNORE INTO book_categories (book_id, category_id) VALUES (?, ?)',
      [bookId, categoryId],
    );
  }
}

export async function createBook(input: BookInput, categoryIds: number[] = []): Promise<number> {
  const db = await getDb();
  const timestamp = nowIso();
  const result = await db.runAsync(
    `INSERT INTO books (
       isbn13, isbn10, title, authors, country, published_date, description,
       cover_uri, cover_is_custom, status, started_at, finished_at, rating,
       notes, metadata_source, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [...inputParams(input), timestamp, timestamp],
  );
  const id = result.lastInsertRowId;
  await replaceCategories(id, categoryIds);
  await syncLogsFromRange(id, input.startedAt, input.finishedAt, todayIso());
  return id;
}

export async function updateBook(
  id: number,
  input: BookInput,
  categoryIds: number[] = [],
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE books SET
       isbn13 = ?, isbn10 = ?, title = ?, authors = ?, country = ?,
       published_date = ?, description = ?, cover_uri = ?, cover_is_custom = ?,
       status = ?, started_at = ?, finished_at = ?, rating = ?, notes = ?, metadata_source = ?,
       updated_at = ?
     WHERE id = ?`,
    [...inputParams(input), nowIso(), id],
  );
  await replaceCategories(id, categoryIds);
  const today = todayIso();
  await trimLogsOutsideRange(id, input.startedAt, input.finishedAt, today);
  await syncLogsFromRange(id, input.startedAt, input.finishedAt, today);
}

/** 詳情頁的快速操作：只改狀態，並依狀態自動補上起訖日期。 */
export async function updateStatus(id: number, status: ReadingStatus): Promise<void> {
  const book = await getBook(id);
  if (!book) return;

  const today = todayIso();
  let startedAt = book.startedAt;
  let finishedAt = book.finishedAt;

  if (status === 'reading' && !startedAt) startedAt = today;
  if (status === 'read') {
    if (!startedAt) startedAt = today;
    if (!finishedAt) finishedAt = today;
  }
  if (status === 'unread') {
    startedAt = null;
    finishedAt = null;
  }

  await updateBook(id, { ...book, status, startedAt, finishedAt }, book.categoryIds);
}

export async function deleteBook(id: number): Promise<void> {
  const db = await getDb();
  // 明確刪除子表，避免部分平台未開啟 foreign_keys 造成殘留
  await db.runAsync('DELETE FROM quotes WHERE book_id = ?', [id]);
  await db.runAsync('DELETE FROM reading_logs WHERE book_id = ?', [id]);
  await db.runAsync('DELETE FROM book_categories WHERE book_id = ?', [id]);
  await db.runAsync('DELETE FROM books WHERE id = ?', [id]);
}

/** 各狀態的本數。帶 year 時依 yearClause 的規則只算該年的書。 */
export async function countsByStatus(year?: number): Promise<Record<ReadingStatus, number>> {
  const db = await getDb();
  const clause = year != null ? yearClause(year) : null;
  const rows = await db.getAllAsync<{ status: string; n: number }>(
    `SELECT b.status, COUNT(*) AS n FROM books b
     ${clause ? `WHERE ${clause.sql}` : ''}
     GROUP BY b.status`,
    clause?.params ?? [],
  );
  const counts: Record<ReadingStatus, number> = { unread: 0, reading: 0, read: 0 };
  for (const row of rows) {
    if (row.status in counts) counts[row.status as ReadingStatus] = row.n;
  }
  return counts;
}

/** 今年已讀本數 = finished_at 落在該年的書。 */
export async function countFinishedInYear(year: number): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM books b
     WHERE b.status = 'read' AND b.finished_at BETWEEN ? AND ?`,
    [`${year}-01-01`, `${year}-12-31`],
  );
  return row?.n ?? 0;
}

/** 該年讀完且有評分的書，星等高的在前；同分時較晚加入書庫的排前面。 */
export async function listTopRatedInYear(year: number, limit = 3): Promise<BookWithCategories[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<BookRow>(
    `SELECT b.* FROM books b
     WHERE b.status = 'read' AND b.finished_at BETWEEN ? AND ? AND b.rating IS NOT NULL
     ORDER BY b.rating DESC, b.created_at DESC, b.id DESC LIMIT ?`,
    [`${year}-01-01`, `${year}-12-31`, limit],
  );
  return attachCategories(rows.map(mapBook));
}

export async function listAllForExport(): Promise<Book[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<BookRow>('SELECT * FROM books ORDER BY id ASC');
  return rows.map(mapBook);
}
