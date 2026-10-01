import { getDb } from '@/db';
import { readBackupFile, readCoverBase64, writeBackupFile, writeCoverFromBase64 } from '@/services/backup-io';
import { clearCoversDirectory } from '@/services/cover';
import { todayIso } from '@/utils/date';

/**
 * 離線 App 沒有雲端可靠山，備份就是唯一的保險。
 * 匯出成單一 JSON：所有資料表 + 封面圖（base64），匯入時整包還原。
 */

const BACKUP_VERSION = 1;

interface BackupBook {
  id: number;
  isbn13: string | null;
  isbn10: string | null;
  title: string;
  authors: string | null;
  country: string | null;
  published_date: string | null;
  description: string | null;
  cover_is_custom: number;
  status: string;
  started_at: string | null;
  finished_at: string | null;
  rating: number | null;
  notes: string | null;
  metadata_source: string | null;
  created_at: string;
  updated_at: string;
  /** 封面圖內容，沒有封面時為 null */
  cover_base64: string | null;
}

interface BackupPayload {
  version: number;
  exportedAt: string;
  books: BackupBook[];
  quotes: Record<string, unknown>[];
  categories: Record<string, unknown>[];
  bookCategories: Record<string, unknown>[];
  readingLogs: Record<string, unknown>[];
  goals: Record<string, unknown>[];
}

/** 組出完整備份內容的 JSON 字串。本機匯出與雲端備份共用。 */
export async function buildBackupJson(): Promise<string> {
  const db = await getDb();

  const bookRows = await db.getAllAsync<BackupBook & { cover_uri: string | null }>(
    'SELECT * FROM books ORDER BY id ASC',
  );
  const books: BackupBook[] = [];
  for (const row of bookRows) {
    const { cover_uri, ...rest } = row;
    books.push({ ...rest, cover_base64: await readCoverBase64(cover_uri) });
  }

  const payload: BackupPayload = {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    books,
    quotes: await db.getAllAsync('SELECT * FROM quotes ORDER BY id ASC'),
    categories: await db.getAllAsync('SELECT * FROM categories ORDER BY id ASC'),
    bookCategories: await db.getAllAsync('SELECT * FROM book_categories'),
    readingLogs: await db.getAllAsync('SELECT * FROM reading_logs ORDER BY id ASC'),
    goals: await db.getAllAsync('SELECT * FROM goals ORDER BY year ASC'),
  };
  return JSON.stringify(payload);
}

/** 產生備份檔並回傳其 uri（位於快取目錄，交給分享面板處理）。 */
export async function exportBackup(): Promise<string> {
  const json = await buildBackupJson();
  return writeBackupFile(`reading-backup-${todayIso()}.json`, json);
}

/**
 * 還原時允許寫入的欄位白名單，逐表列出目前 schema 的欄位（對照 db/migrations.ts）。
 * `row` 來自解析使用者提供的備份 JSON（本機檔案或雲端下載），不是我們自己產生的——
 * insertRows 會把物件的 key 直接接進 SQL 當欄位名稱，若不過濾，一份被竄改過的備份檔
 * 就能夾帶惡意欄位名稱做 SQL injection。這裡用白名單交集，未知欄位一律忽略。
 */
const TABLE_COLUMNS: Record<string, readonly string[]> = {
  books: [
    'id', 'isbn13', 'isbn10', 'title', 'authors', 'country', 'published_date',
    'description', 'cover_uri', 'cover_is_custom', 'status', 'started_at',
    'finished_at', 'rating', 'notes', 'metadata_source', 'created_at', 'updated_at',
  ],
  quotes: ['id', 'book_id', 'text', 'created_at'],
  categories: ['id', 'name', 'sort_order'],
  book_categories: ['book_id', 'category_id'],
  reading_logs: ['id', 'book_id', 'date', 'note'],
  goals: ['year', 'target_count'],
};

async function insertRows(
  table: keyof typeof TABLE_COLUMNS,
  rows: Record<string, unknown>[],
): Promise<void> {
  const db = await getDb();
  const allowed = new Set(TABLE_COLUMNS[table]);
  for (const row of rows) {
    const columns = Object.keys(row).filter((column) => allowed.has(column));
    if (columns.length === 0) continue;
    const placeholders = columns.map(() => '?').join(',');
    await db.runAsync(
      `INSERT OR REPLACE INTO ${table} (${columns.join(',')}) VALUES (${placeholders})`,
      columns.map((column) => (row[column] ?? null) as string | number | null),
    );
  }
}

/** 匯入本機備份檔，見 restoreFromJson。 */
export async function importBackup(fileUri: string): Promise<void> {
  const text = await readBackupFile(fileUri);
  await restoreFromJson(text);
}

/**
 * 從備份 JSON 還原，會先清空所有現有資料。
 * 格式不符時直接丟例外，由呼叫端顯示錯誤，不做部分匯入。
 */
export async function restoreFromJson(text: string): Promise<void> {
  const payload = JSON.parse(text) as BackupPayload;

  if (payload.version !== BACKUP_VERSION || !Array.isArray(payload.books)) {
    throw new Error('備份格式不符');
  }

  const db = await getDb();
  await db.execAsync(`
    DELETE FROM book_categories;
    DELETE FROM reading_logs;
    DELETE FROM quotes;
    DELETE FROM books;
    DELETE FROM categories;
    DELETE FROM goals;
  `);

  clearCoversDirectory();
  for (const book of payload.books) {
    const { cover_base64, ...row } = book;
    let coverUri: string | null = null;

    if (cover_base64) coverUri = writeCoverFromBase64(book.id, cover_base64);

    await insertRows('books', [{ ...row, cover_uri: coverUri }]);
  }

  await insertRows('categories', payload.categories ?? []);
  await insertRows('quotes', payload.quotes ?? []);
  await insertRows('book_categories', payload.bookCategories ?? []);
  await insertRows('reading_logs', payload.readingLogs ?? []);
  await insertRows('goals', payload.goals ?? []);
}
