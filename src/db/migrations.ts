/**
 * 版本化 migration。每次新增一版就往陣列尾端加一筆，不要改動既有項目。
 * 目前版本 = 陣列長度，記錄在 SQLite 的 `PRAGMA user_version`。
 */

export const DEFAULT_CATEGORIES = [
  '文學小說',
  '商業理財',
  '心理勵志',
  '人文史地',
  '科普',
  '藝術設計',
  '生活風格',
  '漫畫',
] as const;

const seedCategories = DEFAULT_CATEGORIES.map(
  (name, i) => `INSERT OR IGNORE INTO categories (name, sort_order) VALUES ('${name}', ${i});`,
).join('\n');

export const MIGRATIONS: string[] = [
  // v1：初始 schema
  `
  CREATE TABLE IF NOT EXISTS books (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    isbn13 TEXT UNIQUE,
    isbn10 TEXT,
    title TEXT NOT NULL,
    subtitle TEXT,
    authors TEXT,
    publisher TEXT,
    published_date TEXT,
    description TEXT,
    page_count INTEGER,
    cover_uri TEXT,
    cover_is_custom INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'unread',
    started_at TEXT,
    finished_at TEXT,
    rating INTEGER,
    notes TEXT,
    metadata_source TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS quotes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    page INTEGER,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS book_categories (
    book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    PRIMARY KEY (book_id, category_id)
  );

  CREATE TABLE IF NOT EXISTS reading_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    note TEXT,
    UNIQUE (book_id, date)
  );

  CREATE TABLE IF NOT EXISTS goals (
    year INTEGER PRIMARY KEY,
    target_count INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_books_status ON books(status);
  CREATE INDEX IF NOT EXISTS idx_books_finished_at ON books(finished_at);
  CREATE INDEX IF NOT EXISTS idx_books_title ON books(title);
  CREATE INDEX IF NOT EXISTS idx_quotes_book ON quotes(book_id);
  CREATE INDEX IF NOT EXISTS idx_reading_logs_date ON reading_logs(date);
  CREATE INDEX IF NOT EXISTS idx_reading_logs_book ON reading_logs(book_id);
  CREATE INDEX IF NOT EXISTS idx_book_categories_category ON book_categories(category_id);

  ${seedCategories}
  `,

  // v2：不記錄頁碼——書籍的總頁數與金句的頁碼都拿掉
  `
  ALTER TABLE books DROP COLUMN page_count;
  ALTER TABLE quotes DROP COLUMN page;
  `,

  // v3：不記錄副標題
  `
  ALTER TABLE books DROP COLUMN subtitle;
  `,

  // v4：拿掉月曆手動加書的功能，清掉之前留下的手動紀錄（note 非 NULL）
  `
  DELETE FROM reading_logs WHERE note IS NOT NULL;
  `,

  // v5：出版社欄位改成國家（快選日本／美國／英國／台灣，也可自行輸入）。
  // 舊的出版社名稱跟國家是不同概念，不做轉換，直接砍掉欄位重開一個乾淨的。
  `
  ALTER TABLE books DROP COLUMN publisher;
  ALTER TABLE books ADD COLUMN country TEXT;
  `,

  // v6：App 層級的 key/value 設定（雲端備份狀態等），不另外引入 AsyncStorage
  `
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  `,
];
