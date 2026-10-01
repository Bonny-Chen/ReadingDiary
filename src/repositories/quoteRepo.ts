import { getDb } from '@/db';
import { mapQuote, type QuoteRow } from '@/repositories/mappers';
import type { Quote } from '@/types/models';

export async function listQuotes(bookId: number): Promise<Quote[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<QuoteRow>(
    'SELECT * FROM quotes WHERE book_id = ? ORDER BY id ASC',
    [bookId],
  );
  return rows.map(mapQuote);
}

export async function addQuote(bookId: number, text: string): Promise<number> {
  const db = await getDb();
  const result = await db.runAsync(
    'INSERT INTO quotes (book_id, text, created_at) VALUES (?, ?, ?)',
    [bookId, text, new Date().toISOString()],
  );
  return result.lastInsertRowId;
}

export async function updateQuote(id: number, text: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE quotes SET text = ? WHERE id = ?', [text, id]);
}

export async function deleteQuote(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM quotes WHERE id = ?', [id]);
}

export interface QuoteWithBook extends Quote {
  bookTitle: string;
}

/** 首頁跑馬燈用：不限年度，從全部金句中隨機抽一句。 */
export async function getRandomQuote(): Promise<QuoteWithBook | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<QuoteRow & { book_title: string }>(
    `SELECT q.*, b.title AS book_title
     FROM quotes q JOIN books b ON b.id = q.book_id
     ORDER BY RANDOM() LIMIT 1`,
  );
  if (!row) return null;
  const { book_title, ...quoteRow } = row;
  return { ...mapQuote(quoteRow), bookTitle: book_title };
}

export async function listAllForExport(): Promise<Quote[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<QuoteRow>('SELECT * FROM quotes ORDER BY id ASC');
  return rows.map(mapQuote);
}
