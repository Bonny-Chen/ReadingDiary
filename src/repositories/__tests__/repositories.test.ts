import { clearTestDb, createTestDb } from '@/db/testing';
import {
  countFinishedInYear,
  countsByStatus,
  createBook,
  deleteBook,
  findByIsbn,
  getBook,
  listBookYears,
  listBooks,
  listTopRatedInYear,
  updateBook,
  updateStatus,
} from '@/repositories/bookRepo';
import {
  addCategory,
  listCategories,
  renameCategory,
  reorderCategories,
} from '@/repositories/categoryRepo';
import { getGoal, setGoal } from '@/repositories/goalRepo';
import { deleteSetting, getSetting, setSetting } from '@/repositories/settingsRepo';
import { addQuote, deleteQuote, listQuotes } from '@/repositories/quoteRepo';
import {
  addLog,
  listLogsForBook,
  listLogsForDate,
  listLogsInRange,
  monthSummary,
} from '@/repositories/readingLogRepo';
import type { BookInput } from '@/types/models';

function bookInput(overrides: Partial<BookInput> = {}): BookInput {
  return {
    isbn13: '9789573317241',
    isbn10: '9573317249',
    title: '測試書',
    authors: '某某',
    country: '台灣',
    publishedDate: '2026-01',
    description: null,
    coverUri: null,
    coverIsCustom: false,
    status: 'unread',
    startedAt: null,
    finishedAt: null,
    rating: null,
    notes: null,
    metadataSource: 'manual',
    ...overrides,
  };
}

beforeEach(async () => {
  await createTestDb();
});

afterEach(() => {
  clearTestDb();
});

describe('migration', () => {
  it('建立預設類別', async () => {
    const categories = await listCategories();
    expect(categories.length).toBeGreaterThan(0);
    expect(categories.map((c) => c.name)).toContain('文學小說');
  });
});

describe('書籍 CRUD', () => {
  it('建立後可依 id 與 ISBN 取回', async () => {
    const id = await createBook(bookInput());
    const book = await getBook(id);
    expect(book?.title).toBe('測試書');

    // 兩種 ISBN 寫法都要查得到，掃到舊版 10 碼條碼才不會重複建立
    expect((await findByIsbn('9789573317241'))?.id).toBe(id);
    expect((await findByIsbn('9573317249'))?.id).toBe(id);
  });

  it('更新會寫回欄位與類別', async () => {
    const categories = await listCategories();
    const id = await createBook(bookInput(), [categories[0].id]);

    await updateBook(id, bookInput({ title: '改過的書名', rating: 7 }), [
      categories[0].id,
      categories[1].id,
    ]);

    const book = await getBook(id);
    expect(book?.title).toBe('改過的書名');
    expect(book?.rating).toBe(7);
    expect(book?.categoryIds.sort()).toEqual([categories[0].id, categories[1].id].sort());
  });

  it('刪除會一併清掉心得金句與閱讀紀錄', async () => {
    const id = await createBook(bookInput({ startedAt: '2026-09-01', finishedAt: '2026-09-03' }));
    await addQuote(id, '一句話');

    await deleteBook(id);

    expect(await getBook(id)).toBeNull();
    expect(await listQuotes(id)).toEqual([]);
    expect(await listLogsForBook(id)).toEqual([]);
  });
});

describe('書庫篩選與排序', () => {
  it('可依狀態、類別、關鍵字篩選', async () => {
    const categories = await listCategories();
    await createBook(bookInput({ title: '在讀的書', isbn13: null, isbn10: null, status: 'reading' }), [
      categories[0].id,
    ]);
    await createBook(bookInput({ title: '未讀的書', isbn13: null, isbn10: null }), [categories[1].id]);

    expect((await listBooks({ status: 'reading' })).map((b) => b.title)).toEqual(['在讀的書']);
    expect((await listBooks({ categoryIds: [categories[1].id] })).map((b) => b.title)).toEqual([
      '未讀的書',
    ]);
    expect((await listBooks({ search: '在讀' })).map((b) => b.title)).toEqual(['在讀的書']);
  });

  it('依書名排序', async () => {
    await createBook(bookInput({ title: 'B 書', isbn13: null, isbn10: null }));
    await createBook(bookInput({ title: 'A 書', isbn13: null, isbn10: null }));

    expect((await listBooks({ sort: 'titleAsc' })).map((b) => b.title)).toEqual(['A 書', 'B 書']);
  });
});

describe('閱讀狀態與日期連動', () => {
  it('標記在讀會自動補上開始日期', async () => {
    const id = await createBook(bookInput());
    await updateStatus(id, 'reading');

    const book = await getBook(id);
    expect(book?.status).toBe('reading');
    expect(book?.startedAt).not.toBeNull();
  });

  it('標記已讀會補上完成日期，改回未讀會清空', async () => {
    const id = await createBook(bookInput());
    await updateStatus(id, 'read');
    expect((await getBook(id))?.finishedAt).not.toBeNull();

    await updateStatus(id, 'unread');
    const book = await getBook(id);
    expect(book?.startedAt).toBeNull();
    expect(book?.finishedAt).toBeNull();
  });

  it('各狀態的本數統計正確', async () => {
    await createBook(bookInput({ isbn13: null, isbn10: null }));
    const reading = await createBook(bookInput({ isbn13: null, isbn10: null }));
    await updateStatus(reading, 'reading');

    expect(await countsByStatus()).toEqual({ unread: 1, reading: 1, read: 0 });
  });

  it('依年份統計時：已讀看完成日、在讀看開始日、未讀看加入年份', async () => {
    const thisYear = new Date().getFullYear();
    await createBook(bookInput({ isbn13: null, isbn10: null })); // 未讀，今年加入
    await createBook(
      bookInput({ isbn13: null, isbn10: null, status: 'reading', startedAt: '2025-06-01' }),
    );
    await createBook(
      bookInput({ isbn13: null, isbn10: null, status: 'read', startedAt: '2025-01-01', finishedAt: '2025-02-01' }),
    );
    await createBook(
      bookInput({ isbn13: null, isbn10: null, status: 'read', startedAt: '2025-12-20', finishedAt: '2026-01-05' }),
    );

    expect(await countsByStatus(2025)).toEqual({ unread: 0, reading: 1, read: 1 });
    expect(await countsByStatus(2026)).toEqual({ unread: thisYear === 2026 ? 1 : 0, reading: 0, read: 1 });
    expect(await listBooks({ status: 'read', year: 2025 })).toHaveLength(1);
    expect(await listBooks({ status: 'reading', year: 2026 })).toHaveLength(0);
    // 年份清單用同一套規則歸年，新的在前、不重複
    expect(await listBookYears()).toEqual([...new Set([thisYear, 2026, 2025])].sort((a, b) => b - a));
  });
});

describe('年度最高分', () => {
  it('依星等降冪，同分時較晚加入的排前面，沒評分的不列入', async () => {
    const read = (rating: number | null) =>
      bookInput({ isbn13: null, isbn10: null, status: 'read', startedAt: '2026-01-01', finishedAt: '2026-02-01', rating });
    const older = await createBook(read(8));
    const top = await createBook(read(10));
    await createBook(read(null));
    const newer = await createBook(read(8));
    await createBook(bookInput({ isbn13: null, isbn10: null, status: 'read', startedAt: '2025-01-01', finishedAt: '2025-02-01', rating: 10 }));

    const ids = (await listTopRatedInYear(2026, 3)).map((b) => b.id);
    expect(ids).toEqual([top, newer, older]);
  });
});

describe('年度目標統計', () => {
  it('只計入該年度讀完的書', async () => {
    await createBook(
      bookInput({ isbn13: null, isbn10: null, status: 'read', startedAt: '2026-01-01', finishedAt: '2026-03-01' }),
    );
    await createBook(
      bookInput({ isbn13: null, isbn10: null, status: 'read', startedAt: '2025-01-01', finishedAt: '2025-03-01' }),
    );
    await createBook(bookInput({ isbn13: null, isbn10: null, status: 'reading', startedAt: '2026-05-01' }));

    expect(await countFinishedInYear(2026)).toBe(1);
    expect(await countFinishedInYear(2025)).toBe(1);
  });

  it('目標可設定與覆寫', async () => {
    await setGoal(2026, 24);
    expect((await getGoal(2026))?.targetCount).toBe(24);

    await setGoal(2026, 30);
    expect((await getGoal(2026))?.targetCount).toBe(30);
  });
});

describe('閱讀紀錄與月曆', () => {
  it('設定起訖日期後自動補齊每一天', async () => {
    const id = await createBook(bookInput({ startedAt: '2026-09-08', finishedAt: '2026-09-10' }));

    const logs = await listLogsForBook(id);
    expect(logs.map((l) => l.date)).toEqual(['2026-09-08', '2026-09-09', '2026-09-10']);
  });

  it('縮短區間會清掉區間外的自動紀錄', async () => {
    const id = await createBook(bookInput({ startedAt: '2026-09-01', finishedAt: '2026-09-10' }));
    await updateBook(id, bookInput({ startedAt: '2026-09-01', finishedAt: '2026-09-03' }));

    const logs = await listLogsForBook(id);
    expect(logs.map((l) => l.date)).toEqual(['2026-09-01', '2026-09-02', '2026-09-03']);
  });

  it('手動加的紀錄不會被起訖日期同步清掉', async () => {
    const id = await createBook(bookInput({ startedAt: '2026-09-01', finishedAt: '2026-09-03' }));
    await addLog(id, '2026-12-25', '手動');

    await updateBook(id, bookInput({ startedAt: '2026-09-01', finishedAt: '2026-09-02' }));

    const logs = await listLogsForBook(id);
    expect(logs.map((l) => l.date)).toContain('2026-12-25');
  });

  it('可查出某一天讀了哪些書', async () => {
    const a = await createBook(
      bookInput({ title: '甲書', isbn13: null, isbn10: null, startedAt: '2026-09-10', finishedAt: '2026-09-10' }),
    );
    await createBook(
      bookInput({ title: '乙書', isbn13: null, isbn10: null, startedAt: '2026-09-10', finishedAt: '2026-09-10' }),
    );

    const logs = await listLogsForDate('2026-09-10');
    expect(logs.map((l) => l.bookTitle).sort()).toEqual(['乙書', '甲書']);
    expect(logs.some((l) => l.bookId === a)).toBe(true);
  });

  it('月份區間查詢與摘要統計正確', async () => {
    await createBook(
      bookInput({ isbn13: null, isbn10: null, startedAt: '2026-09-08', finishedAt: '2026-09-09' }),
    );

    const range = await listLogsInRange('2026-09-01', '2026-09-30');
    expect(Object.keys(range).sort()).toEqual(['2026-09-08', '2026-09-09']);
    expect(await monthSummary('2026-09-01', '2026-09-30')).toEqual({ days: 2, books: 1 });
  });
});

describe('金句', () => {
  it('可依新增順序列出與刪除', async () => {
    const id = await createBook(bookInput());
    const first = await addQuote(id, '第一句');
    await addQuote(id, '第二句');

    expect((await listQuotes(id)).map((q) => q.text)).toEqual(['第一句', '第二句']);

    await deleteQuote(first);
    expect((await listQuotes(id)).map((q) => q.text)).toEqual(['第二句']);
  });
});

describe('類別', () => {
  it('新增重複名稱時回傳既有 id，不會產生重複類別', async () => {
    const before = (await listCategories()).length;
    const firstId = await addCategory('新類別');
    const secondId = await addCategory('新類別');

    expect(secondId).toBe(firstId);
    expect((await listCategories()).length).toBe(before + 1);
  });

  it('可重新命名，改成已存在的名稱時會失敗', async () => {
    const id = await addCategory('待改名');
    await addCategory('已存在的名稱');

    await renameCategory(id, '改好的名稱');
    expect((await listCategories()).find((c) => c.id === id)?.name).toBe('改好的名稱');

    await expect(renameCategory(id, '已存在的名稱')).rejects.toThrow();
  });

  it('可依拖移後的順序重新排序', async () => {
    const before = await listCategories();
    const reversedIds = [...before].reverse().map((c) => c.id);

    await reorderCategories(reversedIds);

    expect((await listCategories()).map((c) => c.id)).toEqual(reversedIds);
  });
});

describe('settings', () => {
  it('可寫入、覆寫與刪除', async () => {
    expect(await getSetting('k')).toBeNull();
    await setSetting('k', 'a');
    await setSetting('k', 'b');
    expect(await getSetting('k')).toBe('b');
    await deleteSetting('k');
    expect(await getSetting('k')).toBeNull();
  });
});
