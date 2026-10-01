import { lookupByIsbn, searchByTitle } from '@/services/metadata';

const ISBN = '9789573317241';

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response;
}

function serverError(status: number) {
  return { ok: false, status, json: async () => ({}) } as Response;
}

const googleHit = {
  totalItems: 1,
  items: [
    {
      volumeInfo: {
        title: '挪威的森林',
        authors: ['村上春樹', '賴明珠'],
        publishedDate: '2003-01-01',
        description: '一段關於失落與成長的故事。',
        pageCount: 448,
        industryIdentifiers: [{ type: 'ISBN_13', identifier: ISBN }],
        imageLinks: { thumbnail: 'http://books.google.com/cover?id=1&edge=curl' },
      },
    },
  ],
};

const openLibraryHit = {
  [`ISBN:${ISBN}`]: {
    title: 'Open Library 的書',
    authors: [{ name: 'Some Author' }],
    publish_date: '2001',
    number_of_pages: 120,
    cover: { large: 'https://covers.openlibrary.org/b/id/1-L.jpg' },
  },
};

let fetchMock: jest.Mock;

beforeEach(() => {
  fetchMock = jest.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
});

describe('lookupByIsbn', () => {
  it('Google Books 命中時直接回傳，不再問其他來源', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(googleHit));

    const { metadata, failedReason } = await lookupByIsbn(ISBN);

    expect(failedReason).toBeNull();
    expect(metadata?.title).toBe('挪威的森林');
    expect(metadata?.source).toBe('google_books');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('多位作者串成一個字串，封面網址改成 https 並去掉 edge=curl', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(googleHit));

    const { metadata } = await lookupByIsbn(ISBN);

    expect(metadata?.authors).toBe('村上春樹 / 賴明珠');
    expect(metadata?.coverUrl).toBe('https://books.google.com/cover?id=1');
  });

  it('Google Books 查無資料時改問 Open Library', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ totalItems: 0 }))
      .mockResolvedValueOnce(jsonResponse(openLibraryHit));

    const { metadata } = await lookupByIsbn(ISBN);

    expect(metadata?.title).toBe('Open Library 的書');
    expect(metadata?.source).toBe('open_library');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('Google Books 連線失敗也會繼續問下一個來源', async () => {
    fetchMock
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(jsonResponse(openLibraryHit));

    const { metadata } = await lookupByIsbn(ISBN);

    expect(metadata?.source).toBe('open_library');
  });

  it('兩個來源都查無資料時回報 not_found，讓 UI 轉手動輸入', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ totalItems: 0 }))
      .mockResolvedValueOnce(jsonResponse({}));

    expect(await lookupByIsbn(ISBN)).toEqual({ metadata: null, failedReason: 'not_found' });
  });

  it('全部連線失敗時回報 network（離線情境）', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));

    expect(await lookupByIsbn(ISBN)).toEqual({ metadata: null, failedReason: 'network' });
  });

  it('Google Books 被限流(429)但 Open Library 有連上只是查無資料時，回報 not_found 而非 network', async () => {
    fetchMock
      .mockRejectedValueOnce(new Error('Google Books 429'))
      .mockResolvedValueOnce(jsonResponse({}));

    expect(await lookupByIsbn(ISBN)).toEqual({ metadata: null, failedReason: 'not_found' });
  });

  it('ISBN 不合法時不發出任何請求', async () => {
    expect(await lookupByIsbn('1234')).toEqual({ metadata: null, failedReason: 'not_found' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('查詢結果會補齊 10 碼與 13 碼', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(googleHit));

    const { metadata } = await lookupByIsbn('9573317249');

    expect(metadata?.isbn13).toBe(ISBN);
    expect(metadata?.isbn10).toBe('9573317249');
  });
});

describe('searchByTitle', () => {
  it('回傳多筆候選書目', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        totalItems: 2,
        items: [
          { volumeInfo: { title: '挪威的森林', authors: ['村上春樹'] } },
          { volumeInfo: { title: '挪威的森林（另一版本）', authors: ['村上春樹'] } },
        ],
      }),
    );

    const results = await searchByTitle('挪威的森林');

    expect(results).toHaveLength(2);
    expect(results[0].title).toBe('挪威的森林');
    expect(results[0].source).toBe('google_books');
  });

  it('查無資料時回傳空陣列', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ totalItems: 0 }));

    expect(await searchByTitle('不存在的書名')).toEqual([]);
  });

  it('查詢失敗時回傳空陣列而不丟例外', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network down'));

    expect(await searchByTitle('挪威的森林')).toEqual([]);
  });

  it('空白書名不發出請求', async () => {
    expect(await searchByTitle('   ')).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('第一次遇到 5xx（例如 503）會自動重試一次，使用者不用自己再點一次', async () => {
    fetchMock
      .mockResolvedValueOnce(serverError(503))
      .mockResolvedValueOnce(
        jsonResponse({ items: [{ volumeInfo: { title: '挪威的森林', authors: ['村上春樹'] } }] }),
      );

    const results = await searchByTitle('挪威的森林');

    expect(results).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('重試一次後還是失敗，維持回傳空陣列而不丟例外', async () => {
    fetchMock.mockResolvedValueOnce(serverError(503)).mockResolvedValueOnce(serverError(503));

    expect(await searchByTitle('挪威的森林')).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('4xx 不當成暫時性錯誤處理，不重試', async () => {
    fetchMock.mockResolvedValueOnce(serverError(429));

    expect(await searchByTitle('挪威的森林')).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
