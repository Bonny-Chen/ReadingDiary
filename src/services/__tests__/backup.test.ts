import { clearTestDb, createTestDb } from '@/db/testing';
import { createBook, listBooks } from '@/repositories/bookRepo';
import { addCategory, listCategories } from '@/repositories/categoryRepo';
import { getGoal, setGoal } from '@/repositories/goalRepo';
import { addQuote, listQuotes } from '@/repositories/quoteRepo';
import { listLogsForBook } from '@/repositories/readingLogRepo';
import { buildBackupJson, restoreFromJson } from '@/services/backup';

beforeEach(async () => {
  await createTestDb();
});

afterEach(() => {
  clearTestDb();
});

describe('備份 round-trip', () => {
  it('buildBackupJson → 清空 → restoreFromJson 後資料一致', async () => {
    const category = await addCategory('測試類別');
    const bookId = await createBook(
      {
        isbn13: null,
        isbn10: null,
        title: '備份測試',
        authors: '作者',
        country: '台灣',
        publishedDate: null,
        description: null,
        coverUri: null,
        status: 'read',
        startedAt: '2026-03-01',
        finishedAt: '2026-03-03',
        rating: 9,
        notes: '心得',
        metadataSource: 'manual',
      },
      [category],
    );
    await addQuote(bookId, '一句話');
    await setGoal(2026, 20);

    const json = await buildBackupJson();
    const payload = JSON.parse(json);
    expect(payload.version).toBe(1);
    expect(payload.books).toHaveLength(1);

    // 模擬換到一台全新裝置：清掉所有資料再還原
    clearTestDb();
    await createTestDb();
    expect(await listBooks()).toHaveLength(0);

    await restoreFromJson(json);

    const books = await listBooks();
    expect(books).toHaveLength(1);
    expect(books[0].title).toBe('備份測試');
    expect(books[0].categoryIds).toEqual([category]);
    expect(await listQuotes(books[0].id)).toHaveLength(1);
    expect(await listLogsForBook(books[0].id)).toHaveLength(3);
    expect((await getGoal(2026))?.targetCount).toBe(20);
    expect((await listCategories()).some((c) => c.name === '測試類別')).toBe(true);
  });

  it('版本不符時丟例外且不清空資料', async () => {
    await setGoal(2026, 5);
    await expect(restoreFromJson(JSON.stringify({ version: 99, books: [] }))).rejects.toThrow();
    expect((await getGoal(2026))?.targetCount).toBe(5);
  });

  it('備份檔裡夾帶的未知欄位（例如竄改過、意圖做 SQL injection 的欄位名稱）會被忽略，不影響正常欄位還原', async () => {
    const malicious = "title) VALUES ('x'); DROP TABLE books; --";
    await restoreFromJson(
      JSON.stringify({
        version: 1,
        exportedAt: 'x',
        books: [
          {
            id: 1,
            title: '正常書名',
            isbn13: null,
            isbn10: null,
            authors: null,
            country: null,
            published_date: null,
            description: null,
            cover_is_custom: 0,
            status: 'unread',
            started_at: null,
            finished_at: null,
            rating: null,
            notes: null,
            metadata_source: 'manual',
            created_at: 'x',
            updated_at: 'x',
            cover_base64: null,
            [malicious]: 'evil',
          },
        ],
        quotes: [],
        categories: [{ id: 1, name: '正常類別', sort_order: 0, [malicious]: 'evil' }],
        bookCategories: [],
        readingLogs: [],
        goals: [],
      }),
    );

    const books = await listBooks();
    expect(books).toHaveLength(1);
    expect(books[0].title).toBe('正常書名');
    expect((await listCategories()).map((c) => c.name)).toContain('正常類別');
  });
});
