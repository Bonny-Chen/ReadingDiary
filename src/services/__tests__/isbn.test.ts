import {
  expandIsbn,
  extractIsbnCandidates,
  isbn10To13,
  isbn13To10,
  isValidIsbn,
  isValidIsbn10,
  isValidIsbn13,
  normalizeIsbn,
} from '@/services/isbn';

describe('normalizeIsbn', () => {
  it('去掉連字號與空白並轉大寫', () => {
    expect(normalizeIsbn('978-986-235-000 6')).toBe('9789862350006');
    expect(normalizeIsbn('080442957x')).toBe('080442957X');
  });
});

describe('檢查碼驗證', () => {
  it('接受合法的 ISBN-13', () => {
    expect(isValidIsbn13('9789573317241')).toBe(true);
    expect(isValidIsbn13('9780140328721')).toBe(true);
  });

  it('拒絕檢查碼錯誤的 ISBN-13', () => {
    expect(isValidIsbn13('9789573317249')).toBe(false);
  });

  it('拒絕非 978/979 前綴的 EAN-13（例如一般商品條碼）', () => {
    expect(isValidIsbn13('4710088620811')).toBe(false);
  });

  it('接受合法的 ISBN-10，包含尾碼 X', () => {
    expect(isValidIsbn10('080442957X')).toBe(true);
    expect(isValidIsbn10('9573317249')).toBe(true);
  });

  it('拒絕檢查碼錯誤的 ISBN-10', () => {
    expect(isValidIsbn10('0804429571')).toBe(false);
  });

  it('isValidIsbn 依長度自動判斷', () => {
    expect(isValidIsbn('978-957-33-1724-1')).toBe(true);
    expect(isValidIsbn('123')).toBe(false);
  });
});

describe('10 碼與 13 碼互轉', () => {
  it('ISBN-10 轉 13 會加上 978 前綴並重算檢查碼', () => {
    expect(isbn10To13('9573317249')).toBe('9789573317241');
    expect(isbn10To13('080442957X')).toBe('9780804429573');
  });

  it('ISBN-13 轉 10 只適用 978 前綴', () => {
    expect(isbn13To10('9789573317241')).toBe('9573317249');
    expect(isbn13To10('9791234567896')).toBeNull();
  });

  it('轉換結果本身也要是合法 ISBN', () => {
    const converted = isbn10To13('9573317249');
    expect(converted && isValidIsbn13(converted)).toBe(true);
  });

  it('無效輸入回傳 null', () => {
    expect(isbn10To13('1234567890')).toBeNull();
  });
});

describe('expandIsbn', () => {
  it('不論輸入哪一種都補齊兩種寫法', () => {
    expect(expandIsbn('9573317249')).toEqual({ isbn13: '9789573317241', isbn10: '9573317249' });
    expect(expandIsbn('9789573317241')).toEqual({ isbn13: '9789573317241', isbn10: '9573317249' });
  });

  it('無效 ISBN 兩個欄位都是 null', () => {
    expect(expandIsbn('hello')).toEqual({ isbn13: null, isbn10: null });
  });
});

describe('extractIsbnCandidates（OCR 用）', () => {
  it('從版權頁文字中抽出 ISBN', () => {
    const text = '定價 380 元\nISBN 978-957-33-1724-1\n初版一刷';
    expect(extractIsbnCandidates(text)).toContain('9789573317241');
  });

  it('忽略檢查碼錯誤的數字串', () => {
    expect(extractIsbnCandidates('ISBN 978-957-33-1724-9')).toEqual([]);
  });

  it('不會把電話或定價誤判成 ISBN', () => {
    expect(extractIsbnCandidates('電話 02-2500-7696 定價 380 元')).toEqual([]);
  });

  it('跨行的 ISBN 也能接回來', () => {
    expect(extractIsbnCandidates('ISBN\n9789573317241')).toContain('9789573317241');
  });

  it('同時出現 13 碼與 10 碼時 13 碼排在前面', () => {
    const candidates = extractIsbnCandidates('ISBN 9789573317241 / 舊碼 9573317249');
    expect(candidates[0]).toBe('9789573317241');
  });
});
