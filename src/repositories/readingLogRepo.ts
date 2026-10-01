import { getDb } from '@/db';
import { mapReadingLog, type ReadingLogRow } from '@/repositories/mappers';
import type { ReadingLog } from '@/types/models';
import { eachDayBetween, isValidIsoDate } from '@/utils/date';

/** 月曆某一天要顯示的一筆紀錄（含書籍基本資料）。 */
export interface ReadingLogWithBook extends ReadingLog {
  bookTitle: string;
  bookAuthors: string | null;
  bookCoverUri: string | null;
}

export async function addLog(bookId: number, date: string, note: string | null = null): Promise<void> {
  if (!isValidIsoDate(date)) return;
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO reading_logs (book_id, date, note) VALUES (?, ?, ?)
     ON CONFLICT(book_id, date) DO UPDATE SET note = COALESCE(excluded.note, reading_logs.note)`,
    [bookId, date, note],
  );
}

export async function removeLog(bookId: number, date: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM reading_logs WHERE book_id = ? AND date = ?', [bookId, date]);
}

export async function listLogsForBook(bookId: number): Promise<ReadingLog[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<ReadingLogRow>(
    'SELECT * FROM reading_logs WHERE book_id = ? ORDER BY date ASC',
    [bookId],
  );
  return rows.map(mapReadingLog);
}

export async function listLogsForDate(date: string): Promise<ReadingLogWithBook[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<ReadingLogRow & { title: string; authors: string | null; cover_uri: string | null }>(
    `SELECT l.*, b.title, b.authors, b.cover_uri
     FROM reading_logs l JOIN books b ON b.id = l.book_id
     WHERE l.date = ? ORDER BY b.title ASC`,
    [date],
  );
  return rows.map((row) => ({
    ...mapReadingLog(row),
    bookTitle: row.title,
    bookAuthors: row.authors,
    bookCoverUri: row.cover_uri,
  }));
}

/** 月曆標記用：回傳該區間內每一天有幾本書、以及各自的書籍 id。 */
export async function listLogsInRange(
  start: string,
  end: string,
): Promise<Record<string, { bookIds: number[] }>> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ date: string; book_id: number }>(
    'SELECT date, book_id FROM reading_logs WHERE date BETWEEN ? AND ? ORDER BY date ASC',
    [start, end],
  );
  const byDate: Record<string, { bookIds: number[] }> = {};
  for (const row of rows) {
    (byDate[row.date] ??= { bookIds: [] }).bookIds.push(row.book_id);
  }
  return byDate;
}

/** 該區間內最後一筆閱讀紀錄的日期，用於切換年份時讓月曆自動跳過去；沒有紀錄回傳 null。 */
export async function getLastLogDateInRange(start: string, end: string): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ date: string | null }>(
    'SELECT MAX(date) AS date FROM reading_logs WHERE date BETWEEN ? AND ?',
    [start, end],
  );
  return row?.date ?? null;
}

/**
 * 依書籍的起訖日期補齊閱讀紀錄。
 * - 只補、不刪使用者手動加的紀錄；但會清掉舊區間中「自動產生」的殘留（以整段重建的方式處理）。
 * - 只有 started_at 沒有 finished_at 時，補到今天為止。
 */
export async function syncLogsFromRange(
  bookId: number,
  startedAt: string | null,
  finishedAt: string | null,
  today: string,
): Promise<void> {
  if (!isValidIsoDate(startedAt)) return;
  const end = isValidIsoDate(finishedAt) ? finishedAt : today;
  const days = eachDayBetween(startedAt, end);
  if (days.length === 0) return;

  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const day of days) {
      await db.runAsync(
        'INSERT OR IGNORE INTO reading_logs (book_id, date, note) VALUES (?, ?, NULL)',
        [bookId, day],
      );
    }
  });
}

/** 區間縮短時，把落在舊區間外的自動紀錄清掉。 */
export async function trimLogsOutsideRange(
  bookId: number,
  startedAt: string | null,
  finishedAt: string | null,
  today: string,
): Promise<void> {
  const db = await getDb();
  if (!isValidIsoDate(startedAt)) {
    await db.runAsync('DELETE FROM reading_logs WHERE book_id = ? AND note IS NULL', [bookId]);
    return;
  }
  const end = isValidIsoDate(finishedAt) ? finishedAt : today;
  await db.runAsync(
    'DELETE FROM reading_logs WHERE book_id = ? AND note IS NULL AND (date < ? OR date > ?)',
    [bookId, startedAt, end],
  );
}

/** 某月有閱讀的天數與涉及的書本數。 */
export async function monthSummary(start: string, end: string): Promise<{ days: number; books: number }> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ days: number; books: number }>(
    `SELECT COUNT(DISTINCT date) AS days, COUNT(DISTINCT book_id) AS books
     FROM reading_logs WHERE date BETWEEN ? AND ?`,
    [start, end],
  );
  return { days: row?.days ?? 0, books: row?.books ?? 0 };
}

export async function countDaysForBook(bookId: number): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM reading_logs WHERE book_id = ?',
    [bookId],
  );
  return row?.n ?? 0;
}
