/** 全程以本地時區的 'YYYY-MM-DD' 字串當作日期主鍵，避免 UTC 位移造成差一天。 */

export function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function todayIso(): string {
  return toIsoDate(new Date());
}

export function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function isValidIsoDate(iso: string | null | undefined): iso is string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const date = parseIsoDate(iso);
  return !Number.isNaN(date.getTime()) && toIsoDate(date) === iso;
}

/** 回傳 start 到 end（含頭尾）之間的每一天。順序顛倒或無效輸入時回傳空陣列。 */
export function eachDayBetween(start: string, end: string, maxDays = 3650): string[] {
  if (!isValidIsoDate(start) || !isValidIsoDate(end)) return [];
  if (start > end) return [];

  const days: string[] = [];
  const cursor = parseIsoDate(start);
  const last = parseIsoDate(end);
  while (cursor <= last && days.length < maxDays) {
    days.push(toIsoDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

export function yearOf(iso: string): number {
  return Number(iso.slice(0, 4));
}

/** 該月份的第一天與最後一天，month 為 1–12。 */
export function monthRange(year: number, month: number): { start: string; end: string } {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0);
  return { start: toIsoDate(start), end: toIsoDate(end) };
}

/** 顯示用：2026-09-10 → 2026年9月10日 */
export function formatDisplayDate(iso: string | null | undefined): string {
  if (!isValidIsoDate(iso)) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return `${y}年${m}月${d}日`;
}

/** 顯示用：2026-09 → 2026年9月 */
export function formatDisplayMonth(year: number, month: number): string {
  return `${year}年${month}月`;
}

/** 顯示用：ISO 時間字串 → 2026年9月10日 14:05（本地時區） */
export function formatDisplayDateTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${formatDisplayDate(toIsoDate(date))} ${hh}:${mm}`;
}
