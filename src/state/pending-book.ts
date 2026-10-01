import type { BookMetadata } from '@/types/models';

/**
 * 掃描／查詢完成後要帶進編輯表單的資料。
 * 用模組層變數而不是 router params，避免把整包 JSON（含長摘要）塞進網址。
 */
let pending: BookMetadata | null = null;

export function setPendingBook(metadata: BookMetadata | null): void {
  pending = metadata;
}

/** 取出並清空，確保同一筆資料不會在返回上一頁時重複套用。 */
export function takePendingBook(): BookMetadata | null {
  const value = pending;
  pending = null;
  return value;
}
