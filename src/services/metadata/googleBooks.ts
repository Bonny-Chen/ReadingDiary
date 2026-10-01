import { expandIsbn } from '@/services/isbn';
import type { BookMetadata } from '@/types/models';

const ENDPOINT = 'https://www.googleapis.com/books/v1/volumes';

interface VolumeInfo {
  title?: string;
  authors?: string[];
  publishedDate?: string;
  description?: string;
  industryIdentifiers?: { type: string; identifier: string }[];
  imageLinks?: Record<string, string>;
}

/** Google Books 的封面網址預設是 zoom=1 小圖，換成較大且走 https。 */
function pickCover(imageLinks: Record<string, string> | undefined): string | null {
  if (!imageLinks) return null;
  const url =
    imageLinks.extraLarge ??
    imageLinks.large ??
    imageLinks.medium ??
    imageLinks.thumbnail ??
    imageLinks.smallThumbnail;
  if (!url) return null;
  return url.replace(/^http:/, 'https:').replace(/&edge=curl/, '');
}

/** 有帶 key 時配額大幅提高，避免共用配額被限流(429)；沒設定時維持原本不帶 key 的行為。 */
function buildUrl(query: string, maxResults: number): string {
  const params = new URLSearchParams({ q: query, maxResults: String(maxResults) });
  const apiKey = process.env.EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY;
  if (apiKey) params.set('key', apiKey);
  return `${ENDPOINT}?${params.toString()}`;
}

/** 短暫延遲，重試前讓伺服器有機會恢復；用 signal 讓逾時取消時不會多等這段。 */
function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new Error('aborted'));
    });
  });
}

/**
 * 5xx（伺服器端瞬斷，例如 503）往往重試一次就過，不像 4xx 是真的查無此書／請求有誤。
 * 第一次遇到 5xx 就等一下重試一次，使用者不用自己再點一次查詢。
 */
async function fetchVolumes(
  query: string,
  maxResults: number,
  signal?: AbortSignal,
): Promise<{ volumeInfo?: VolumeInfo }[]> {
  const url = buildUrl(query, maxResults);
  let response = await fetch(url, { signal });
  if (!response.ok && response.status >= 500) {
    await delay(400, signal);
    response = await fetch(url, { signal });
  }
  if (!response.ok) throw new Error(`Google Books ${response.status}`);

  const json = (await response.json()) as { totalItems?: number; items?: { volumeInfo?: VolumeInfo }[] };
  return json.items ?? [];
}

function mapVolumeInfo(info: VolumeInfo, fallbackIsbn?: { isbn13: string | null; isbn10: string | null }): BookMetadata {
  const identifiers = info.industryIdentifiers ?? [];
  const fromApi13 = identifiers.find((i) => i.type === 'ISBN_13')?.identifier ?? null;
  const fromApi10 = identifiers.find((i) => i.type === 'ISBN_10')?.identifier ?? null;

  return {
    isbn13: fromApi13 ?? fallbackIsbn?.isbn13 ?? null,
    isbn10: fromApi10 ?? fallbackIsbn?.isbn10 ?? null,
    title: info.title ?? '',
    authors: info.authors?.length ? info.authors.join(' / ') : null,
    publishedDate: info.publishedDate ?? null,
    description: info.description ?? null,
    coverUrl: pickCover(info.imageLinks),
    source: 'google_books',
  };
}

export async function lookup(isbn: string, signal?: AbortSignal): Promise<BookMetadata | null> {
  const items = await fetchVolumes(`isbn:${isbn}`, 1, signal);
  const info = items[0]?.volumeInfo;
  if (!info?.title) return null;
  return mapVolumeInfo(info, expandIsbn(isbn));
}

/**
 * 條碼／ISBN 都拿不到時的備援：用 OCR 猜到的書名直接查書目，回傳多筆候選讓使用者挑。
 * 書名比對本來就不精確，不像 ISBN 查詢那樣保證唯一，所以回傳陣列而非單一結果。
 */
export async function searchByTitle(title: string, signal?: AbortSignal): Promise<BookMetadata[]> {
  // 40 是 Google Books API maxResults 的上限，同名書可能不少，不要卡在 5 筆
  const items = await fetchVolumes(`intitle:${title}`, 40, signal);
  return items
    .map((item) => item.volumeInfo)
    .filter((info): info is VolumeInfo => Boolean(info?.title))
    .map((info) => mapVolumeInfo(info));
}
