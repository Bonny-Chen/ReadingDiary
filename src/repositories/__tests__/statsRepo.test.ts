import { clearTestDb, createTestDb } from '@/db/testing';
import { createBook } from '@/repositories/bookRepo';
import { addCategory } from '@/repositories/categoryRepo';
import { addQuote } from '@/repositories/quoteRepo';
import { getReadingStats } from '@/repositories/statsRepo';
import type { BookInput } from '@/types/models';

let isbnSeq = 0;

function bookInput(overrides: Partial<BookInput> = {}): BookInput {
  isbnSeq += 1;
  return {
    isbn13: null,
    isbn10: null,
    title: `測試書 ${isbnSeq}`,
    authors: null,
    country: null,
    publishedDate: null,
    description: null,
    coverUri: null,
    coverIsCustom: false,
    status: 'read',
    startedAt: '2026-03-01',
    finishedAt: '2026-03-10',
    rating: 8,
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

describe('getReadingStats', () => {
  it('範圍內沒有讀完的書時回傳空統計', async () => {
    await createBook(bookInput({ status: 'reading', finishedAt: null }));
    await createBook(bookInput({ status: 'unread', startedAt: null, finishedAt: null }));

    const stats = await getReadingStats({ kind: 'year', year: 2026 });
    expect(stats.finishedCount).toBe(0);
    expect(stats.trend).toHaveLength(12);
    expect(stats.trend.every((p) => p.count === 0)).toBe(true);
    expect(stats.avgDays).toBeNull();
    expect(stats.categories).toEqual([]);
    expect(stats.fastest).toBeNull();
    expect(stats.slowest).toBeNull();
    expect(stats.quotesByBook).toEqual([]);
    expect(stats.totalQuotes).toBe(0);
  });

  it('金句數量：只算範圍內已讀的書，多的在前，沒金句的不列', async () => {
    const two = await createBook(bookInput({ title: '兩句' }));
    const three = await createBook(bookInput({ title: '三句' }));
    await createBook(bookInput({ title: '零句' }));
    const reading = await createBook(bookInput({ title: '在讀', status: 'reading', finishedAt: null }));
    for (let i = 0; i < 2; i++) await addQuote(two, `q${i}`);
    for (let i = 0; i < 3; i++) await addQuote(three, `q${i}`);
    await addQuote(reading, 'not counted');

    const stats = await getReadingStats({ kind: 'year', year: 2026 });
    expect(stats.quotesByBook).toEqual([
      { bookId: three, title: '三句', count: 3 },
      { bookId: two, title: '兩句', count: 2 },
    ]);
    expect(stats.totalQuotes).toBe(5);
  });

  it('年度模式只計該年讀完的書，逐月補零', async () => {
    await createBook(bookInput({ startedAt: '2026-01-05', finishedAt: '2026-01-07' })); // 3 天
    await createBook(bookInput({ startedAt: '2026-03-01', finishedAt: '2026-03-01' })); // 1 天
    await createBook(bookInput({ startedAt: '2026-03-10', finishedAt: '2026-03-20' })); // 11 天
    await createBook(bookInput({ startedAt: '2025-12-01', finishedAt: '2025-12-31' })); // 去年

    const stats = await getReadingStats({ kind: 'year', year: 2026 });
    expect(stats.finishedCount).toBe(3);
    expect(stats.trend.map((p) => p.count)).toEqual([1, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(stats.trend[0].label).toBe('1');
    expect(stats.avgDays).toBeCloseTo((3 + 1 + 11) / 3);
    // 自動產生的 reading_logs：3 + 1 + 11 天
    expect(stats.totalReadingDays).toBe(15);
    expect(stats.fastest?.days).toBe(1);
    expect(stats.slowest?.days).toBe(11);
  });

  it('全部模式從最早讀完的年份列到今年', async () => {
    const currentYear = new Date().getFullYear();
    await createBook(bookInput({ startedAt: '2024-05-01', finishedAt: '2024-05-03' }));
    await createBook(bookInput({ startedAt: '2024-06-01', finishedAt: '2024-06-03' }));
    await createBook(bookInput({ startedAt: '2026-01-01', finishedAt: '2026-01-03' }));

    const stats = await getReadingStats({ kind: 'all' });
    expect(stats.finishedCount).toBe(3);
    expect(stats.trend[0]).toEqual({ label: '2024', count: 2 });
    expect(stats.trend[1]).toEqual({ label: '2025', count: 0 });
    expect(stats.trend[2]).toEqual({ label: '2026', count: 1 });
    expect(stats.trend[stats.trend.length - 1].label).toBe(String(currentYear));
    expect(stats.avgDays).toBeCloseTo(3);
  });

  it('類別佔比：多類別各計一次，未分類另計', async () => {
    const fiction = await addCategory('文學小說');
    const science = await addCategory('科普');
    await createBook(bookInput(), [fiction, science]);
    await createBook(bookInput(), [fiction]);
    await createBook(bookInput());
    await createBook(bookInput({ status: 'reading', finishedAt: null }), [science]);

    const stats = await getReadingStats({ kind: 'year', year: 2026 });
    expect(stats.finishedCount).toBe(3);
    expect(stats.categories).toEqual([
      { id: fiction, name: '文學小說', count: 2 },
      { id: science, name: '科普', count: 1 },
    ]);
    expect(stats.uncategorizedCount).toBe(1);
  });

  it('最快／最久同天數時取最近讀完的那本', async () => {
    const older = await createBook(bookInput({ startedAt: '2026-02-01', finishedAt: '2026-02-05' }));
    const newer = await createBook(bookInput({ startedAt: '2026-04-01', finishedAt: '2026-04-05' }));

    const stats = await getReadingStats({ kind: 'year', year: 2026 });
    expect(stats.fastest?.book.id).toBe(newer);
    expect(stats.slowest?.book.id).toBe(newer);
    expect(older).not.toBe(newer);
  });
});
