import * as googleBooks from '@/services/metadata/googleBooks';
import * as openLibrary from '@/services/metadata/openLibrary';
import { isValidIsbn, normalizeIsbn } from '@/services/isbn';
import type { BookMetadata } from '@/types/models';

export const LOOKUP_TIMEOUT_MS = 12000;

export interface LookupResult {
  metadata: BookMetadata | null;
  /** 全部來源都試過但沒有結果 / 連線失敗，UI 依此提示改用手動輸入 */
  failedReason: 'not_found' | 'network' | null;
}

interface Provider {
  name: string;
  lookup: (isbn: string, signal?: AbortSignal) => Promise<BookMetadata | null>;
}

/** 查詢順序：Google Books 繁中收錄率最高，Open Library 當備援。 */
const PROVIDERS: Provider[] = [
  { name: 'google_books', lookup: googleBooks.lookup },
  { name: 'open_library', lookup: openLibrary.lookup },
];

async function withTimeout<T>(fn: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fn(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 依序詢問各來源，第一個有結果的即回傳。
 * 全部失敗時不丟例外，而是回報原因讓 UI 轉向手動輸入 —— 離線時也要能新增書。
 */
export async function lookupByIsbn(rawIsbn: string): Promise<LookupResult> {
  const isbn = normalizeIsbn(rawIsbn);
  if (!isValidIsbn(isbn)) return { metadata: null, failedReason: 'not_found' };

  // 只要有任何一個來源成功連線並拿到回應（即使查無此書），就代表裝置有網路，
  // 結果只是「查無資料」而非「離線」——即使前面的來源逾時／被限流(429)也一樣。
  let anyProviderReached = false;

  for (const provider of PROVIDERS) {
    try {
      const metadata = await withTimeout((signal) => provider.lookup(isbn, signal), LOOKUP_TIMEOUT_MS);
      anyProviderReached = true;
      if (metadata) return { metadata, failedReason: null };
    } catch (error) {
      // 單一來源失敗（逾時、離線、5xx、429 配額限制）不應中斷整條鏈，繼續問下一個。
      // 印出實際錯誤，方便分辨是真的離線還是逾時／該來源本身出問題。
      console.error(`[metadata] ${provider.name} 查詢失敗`, error);
    }
  }

  return { metadata: null, failedReason: anyProviderReached ? 'not_found' : 'network' };
}

/**
 * 條碼／ISBN 都拿不到時的備援：用 OCR 猜到的書名查書目。
 * 書名比對不精確，只用繁中收錄率最高的 Google Books，回傳多筆候選讓使用者挑，查詢失敗時回傳空陣列。
 */
export async function searchByTitle(title: string): Promise<BookMetadata[]> {
  const trimmed = title.trim();
  if (!trimmed) return [];

  try {
    return await withTimeout((signal) => googleBooks.searchByTitle(trimmed, signal), LOOKUP_TIMEOUT_MS);
  } catch (error) {
    console.error('[metadata] 書名搜尋失敗', error);
    return [];
  }
}
