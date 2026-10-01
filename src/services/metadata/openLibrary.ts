import { expandIsbn } from '@/services/isbn';
import type { BookMetadata } from '@/types/models';

const ENDPOINT = 'https://openlibrary.org/api/books';

interface OpenLibraryRecord {
  title?: string;
  authors?: { name?: string }[];
  publish_date?: string;
  cover?: Record<string, string>;
  excerpts?: { text?: string }[];
  notes?: string;
}

export async function lookup(isbn: string, signal?: AbortSignal): Promise<BookMetadata | null> {
  const key = `ISBN:${isbn}`;
  const url = `${ENDPOINT}?bibkeys=${encodeURIComponent(key)}&format=json&jscmd=data`;
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Open Library ${response.status}`);

  const json = (await response.json()) as Record<string, OpenLibraryRecord>;
  const record = json[key];
  if (!record?.title) return null;

  const expanded = expandIsbn(isbn);
  // Open Library 沒有正式的摘要欄位，退而求其次用 notes 或第一段節錄
  const description = record.notes ?? record.excerpts?.find((e) => e.text)?.text ?? null;

  return {
    isbn13: expanded.isbn13,
    isbn10: expanded.isbn10,
    title: record.title,
    authors: record.authors?.map((a) => a.name).filter(Boolean).join(' / ') || null,
    publishedDate: record.publish_date ?? null,
    description,
    coverUrl: record.cover?.large ?? record.cover?.medium ?? record.cover?.small ?? null,
    source: 'open_library',
  };
}
