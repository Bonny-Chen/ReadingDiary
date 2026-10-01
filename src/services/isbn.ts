/**
 * ISBN 正規化與驗證。
 * 掃描、OCR、手動輸入三種來源都先經過這裡，確保送查詢的一定是合法 ISBN。
 */

/** 去掉連字號、空白，並把 ISBN-10 的小寫 x 轉大寫。 */
export function normalizeIsbn(raw: string): string {
  return raw.replace(/[\s-]/g, '').toUpperCase();
}

export function isValidIsbn10(value: string): boolean {
  const isbn = normalizeIsbn(value);
  if (!/^\d{9}[\dX]$/.test(isbn)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i++) sum += (10 - i) * Number(isbn[i]);
  const last = isbn[9] === 'X' ? 10 : Number(isbn[9]);
  return (sum + last) % 11 === 0;
}

export function isValidIsbn13(value: string): boolean {
  const isbn = normalizeIsbn(value);
  if (!/^\d{13}$/.test(isbn)) return false;
  // 只有 978/979 前綴才是書籍，其他 EAN-13（例如商品條碼）不算
  if (!isbn.startsWith('978') && !isbn.startsWith('979')) return false;

  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(isbn[i]) * (i % 2 === 0 ? 1 : 3);
  const check = (10 - (sum % 10)) % 10;
  return check === Number(isbn[12]);
}

export function isValidIsbn(value: string): boolean {
  const isbn = normalizeIsbn(value);
  return isbn.length === 10 ? isValidIsbn10(isbn) : isValidIsbn13(isbn);
}

export function isbn10To13(value: string): string | null {
  const isbn = normalizeIsbn(value);
  if (!isValidIsbn10(isbn)) return null;

  const body = `978${isbn.slice(0, 9)}`;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(body[i]) * (i % 2 === 0 ? 1 : 3);
  const check = (10 - (sum % 10)) % 10;
  return `${body}${check}`;
}

export function isbn13To10(value: string): string | null {
  const isbn = normalizeIsbn(value);
  if (!isValidIsbn13(isbn) || !isbn.startsWith('978')) return null;

  const body = isbn.slice(3, 12);
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += (10 - i) * Number(body[i]);
  const remainder = (11 - (sum % 11)) % 11;
  return `${body}${remainder === 10 ? 'X' : remainder}`;
}

/** 把任一形式的 ISBN 展開成 { isbn13, isbn10 } 兩種寫法，方便存檔與比對。 */
export function expandIsbn(value: string): { isbn13: string | null; isbn10: string | null } {
  const isbn = normalizeIsbn(value);
  if (isValidIsbn13(isbn)) return { isbn13: isbn, isbn10: isbn13To10(isbn) };
  if (isValidIsbn10(isbn)) return { isbn13: isbn10To13(isbn), isbn10: isbn };
  return { isbn13: null, isbn10: null };
}

/**
 * 從一段自由文字（OCR 結果）中抽出所有合法 ISBN。
 * 會處理常見的「ISBN 978-986-…」寫法與行內換行造成的斷字。
 */
export function extractIsbnCandidates(text: string): string[] {
  // 只保留數字、X 與分隔符，讓跨行的 ISBN 也能被接回來
  const flattened = text.replace(/[\r\n]+/g, ' ');
  const found = new Set<string>();

  // 允許數字之間夾雜連字號、空白；13 碼與 10 碼各掃一次
  const patterns = [/(?:97[89])(?:[\s-]?\d){10}/g, /\d(?:[\s-]?\d){8}[\s-]?[\dXx]/g];

  for (const pattern of patterns) {
    for (const match of flattened.matchAll(pattern)) {
      const candidate = normalizeIsbn(match[0]);
      if (isValidIsbn(candidate)) found.add(candidate);
    }
  }

  // 13 碼優先，資訊較完整
  return [...found].sort((a, b) => b.length - a.length);
}
