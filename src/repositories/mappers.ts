import { resolveCoverUri } from '@/services/cover';
import type { Book, Category, Goal, Quote, ReadingLog, ReadingStatus, MetadataSource } from '@/types/models';

export interface BookRow {
  id: number;
  isbn13: string | null;
  isbn10: string | null;
  title: string;
  authors: string | null;
  country: string | null;
  published_date: string | null;
  description: string | null;
  cover_uri: string | null;
  cover_is_custom: number;
  status: string;
  started_at: string | null;
  finished_at: string | null;
  rating: number | null;
  notes: string | null;
  metadata_source: string | null;
  created_at: string;
  updated_at: string;
}

export function mapBook(row: BookRow): Book {
  return {
    id: row.id,
    isbn13: row.isbn13,
    isbn10: row.isbn10,
    title: row.title,
    authors: row.authors,
    country: row.country,
    publishedDate: row.published_date,
    description: row.description,
    coverUri: resolveCoverUri(row.cover_uri),
    coverIsCustom: row.cover_is_custom === 1,
    status: (row.status as ReadingStatus) ?? 'unread',
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    rating: row.rating,
    notes: row.notes,
    metadataSource: row.metadata_source as MetadataSource | null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface QuoteRow {
  id: number;
  book_id: number;
  text: string;
  created_at: string;
}

export function mapQuote(row: QuoteRow): Quote {
  return { id: row.id, bookId: row.book_id, text: row.text, createdAt: row.created_at };
}

export interface CategoryRow {
  id: number;
  name: string;
  sort_order: number;
}

export function mapCategory(row: CategoryRow): Category {
  return { id: row.id, name: row.name, sortOrder: row.sort_order };
}

export interface ReadingLogRow {
  id: number;
  book_id: number;
  date: string;
  note: string | null;
}

export function mapReadingLog(row: ReadingLogRow): ReadingLog {
  return { id: row.id, bookId: row.book_id, date: row.date, note: row.note };
}

export interface GoalRow {
  year: number;
  target_count: number;
}

export function mapGoal(row: GoalRow): Goal {
  return { year: row.year, targetCount: row.target_count };
}
