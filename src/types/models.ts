export type ReadingStatus = 'unread' | 'reading' | 'read';

export const READING_STATUSES: ReadingStatus[] = ['unread', 'reading', 'read'];

export type MetadataSource = 'google_books' | 'open_library' | 'manual';

export interface Book {
  id: number;
  isbn13: string | null;
  isbn10: string | null;
  title: string;
  /** 多位作者以 " / " 串接 */
  authors: string | null;
  /** 出版國家，快選日本／美國／英國／台灣，也可自行輸入 */
  country: string | null;
  publishedDate: string | null;
  description: string | null;
  /** 本機檔案 uri；線上封面下載後也會落地，確保離線可見 */
  coverUri: string | null;
  coverIsCustom: boolean;
  status: ReadingStatus;
  /** 'YYYY-MM-DD' */
  startedAt: string | null;
  /** 'YYYY-MM-DD' */
  finishedAt: string | null;
  /** 0–10，代表 0–5 顆星，半顆星 = 1 */
  rating: number | null;
  notes: string | null;
  metadataSource: MetadataSource | null;
  createdAt: string;
  updatedAt: string;
}

/** 書庫列表用：帶上類別，避免每張卡片各自查一次 DB */
export interface BookWithCategories extends Book {
  categoryIds: number[];
}

export interface Quote {
  id: number;
  bookId: number;
  text: string;
  createdAt: string;
}

export interface Category {
  id: number;
  name: string;
  sortOrder: number;
}

export interface ReadingLog {
  id: number;
  bookId: number;
  /** 'YYYY-MM-DD' */
  date: string;
  note: string | null;
}

export interface Goal {
  year: number;
  targetCount: number;
}

/** 新增／編輯書籍表單所寫入的欄位 */
export type BookInput = Omit<Book, 'id' | 'createdAt' | 'updatedAt' | 'coverIsCustom'> &
  Partial<Pick<Book, 'coverIsCustom'>>;

/** 線上書目查詢結果。國家不是書目 API 會回傳的資訊，一律交給使用者手動選/填。 */
export interface BookMetadata {
  isbn13: string | null;
  isbn10: string | null;
  title: string;
  authors: string | null;
  publishedDate: string | null;
  description: string | null;
  /** 遠端封面網址，尚未下載 */
  coverUrl: string | null;
  source: MetadataSource;
}
