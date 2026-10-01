import {
  eachDayBetween,
  formatDisplayDate,
  isValidIsoDate,
  monthRange,
  toIsoDate,
  yearOf,
} from '@/utils/date';

describe('toIsoDate', () => {
  it('使用本地時區，不會因為 UTC 位移差一天', () => {
    // 台灣時間的午夜，用 toISOString() 會退回前一天
    expect(toIsoDate(new Date(2026, 8, 10, 0, 30))).toBe('2026-09-10');
    expect(toIsoDate(new Date(2026, 0, 1, 23, 59))).toBe('2026-01-01');
  });
});

describe('isValidIsoDate', () => {
  it('接受格式正確且真實存在的日期', () => {
    expect(isValidIsoDate('2026-09-10')).toBe(true);
  });

  it('拒絕不存在的日期與錯誤格式', () => {
    expect(isValidIsoDate('2026-02-30')).toBe(false);
    expect(isValidIsoDate('2026-9-10')).toBe(false);
    expect(isValidIsoDate(null)).toBe(false);
  });
});

describe('eachDayBetween', () => {
  it('含頭尾展開每一天', () => {
    expect(eachDayBetween('2026-09-08', '2026-09-11')).toEqual([
      '2026-09-08',
      '2026-09-09',
      '2026-09-10',
      '2026-09-11',
    ]);
  });

  it('同一天只回傳一筆', () => {
    expect(eachDayBetween('2026-09-10', '2026-09-10')).toEqual(['2026-09-10']);
  });

  it('可以跨月與跨年', () => {
    expect(eachDayBetween('2026-12-30', '2027-01-02')).toEqual([
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
    ]);
  });

  it('順序顛倒或無效輸入回傳空陣列', () => {
    expect(eachDayBetween('2026-09-11', '2026-09-08')).toEqual([]);
    expect(eachDayBetween('壞資料', '2026-09-08')).toEqual([]);
  });

  it('有上限保護，不會因為離譜的日期產生無限迴圈', () => {
    expect(eachDayBetween('1900-01-01', '2100-01-01').length).toBe(3650);
  });
});

describe('monthRange', () => {
  it('回傳當月第一天與最後一天', () => {
    expect(monthRange(2026, 9)).toEqual({ start: '2026-09-01', end: '2026-09-30' });
    expect(monthRange(2026, 2)).toEqual({ start: '2026-02-01', end: '2026-02-28' });
    expect(monthRange(2028, 2)).toEqual({ start: '2028-02-01', end: '2028-02-29' });
  });
});

describe('顯示格式', () => {
  it('yearOf 取出年份', () => {
    expect(yearOf('2026-09-10')).toBe(2026);
  });

  it('formatDisplayDate 轉成繁中寫法', () => {
    expect(formatDisplayDate('2026-09-10')).toBe('2026年9月10日');
    expect(formatDisplayDate(null)).toBe('');
  });
});
