import {
  BACKUP_FILE_NAME,
  BACKUP_FOLDER_NAME,
  DriveError,
  downloadBackup,
  ensureBackupFolder,
  findBackupFile,
  uploadBackup,
} from '@/services/cloud/googleDrive';

function response(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  } as Response;
}

let fetchMock: jest.Mock;

beforeEach(() => {
  fetchMock = jest.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
});

function lastCall(): { url: string; init: RequestInit } {
  const [url, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
  return { url, init };
}

describe('ensureBackupFolder', () => {
  it('根目錄已有資料夾就直接用', async () => {
    fetchMock.mockResolvedValueOnce(response({ files: [{ id: 'dir', modifiedTime: 'x' }] }));
    expect(await ensureBackupFolder('tok')).toBe('dir');
    const q = new URL(lastCall().url).searchParams.get('q') ?? '';
    expect(q).toContain(`name = '${BACKUP_FOLDER_NAME}'`);
    expect(q).toContain("'root' in parents");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('沒有資料夾就在根目錄建一個', async () => {
    fetchMock.mockResolvedValueOnce(response({ files: [] })).mockResolvedValueOnce(response({ id: 'new-dir' }));
    expect(await ensureBackupFolder('tok')).toBe('new-dir');
    const { init } = lastCall();
    expect(init.method).toBe('POST');
    expect(String(init.body)).toContain('application/vnd.google-apps.folder');
  });
});

describe('findBackupFile', () => {
  it('在資料夾裡依檔名查詢，沒有就回 null', async () => {
    fetchMock.mockResolvedValueOnce(response({ files: [] }));
    expect(await findBackupFile('tok', 'dir')).toBeNull();

    const { url, init } = lastCall();
    const q = new URL(url).searchParams.get('q') ?? '';
    expect(q).toContain(`name = '${BACKUP_FILE_NAME}'`);
    expect(q).toContain("'dir' in parents");
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
  });

  it('有檔案時回傳 id 與修改時間', async () => {
    fetchMock.mockResolvedValueOnce(response({ files: [{ id: 'f1', modifiedTime: '2026-09-01T00:00:00Z' }] }));
    expect(await findBackupFile('tok', 'dir')).toEqual({ id: 'f1', modifiedTime: '2026-09-01T00:00:00Z' });
  });

  it('非 2xx 丟 DriveError 並帶狀態碼', async () => {
    fetchMock.mockResolvedValueOnce(response({}, 401));
    await expect(findBackupFile('tok', 'dir')).rejects.toMatchObject({ name: 'DriveError', status: 401 });
    fetchMock.mockResolvedValueOnce(response({}, 500));
    await expect(findBackupFile('tok', 'dir')).rejects.toBeInstanceOf(DriveError);
  });
});

describe('uploadBackup', () => {
  it('已有檔案時用 PATCH 覆寫內容', async () => {
    fetchMock.mockResolvedValueOnce(response({ id: 'f1' }));
    expect(await uploadBackup('tok', '{"a":1}', 'dir', 'f1')).toBe('f1');

    const { url, init } = lastCall();
    expect(url).toContain('/upload/drive/v3/files/f1?uploadType=media');
    expect(init.method).toBe('PATCH');
    expect(init.body).toBe('{"a":1}');
  });

  it('沒有檔案時用 multipart 在資料夾裡新建', async () => {
    fetchMock.mockResolvedValueOnce(response({ id: 'new' }));
    expect(await uploadBackup('tok', '{"a":1}', 'dir')).toBe('new');

    const { url, init } = lastCall();
    expect(url).toContain('/upload/drive/v3/files?uploadType=multipart');
    expect(init.method).toBe('POST');
    const body = String(init.body);
    expect(body).toContain('"parents":["dir"]');
    expect(body).toContain(`"name":"${BACKUP_FILE_NAME}"`);
    expect(body).toContain('{"a":1}');
  });
});

describe('downloadBackup', () => {
  it('以 alt=media 取回檔案文字', async () => {
    fetchMock.mockResolvedValueOnce(response('{"books":[]}'));
    expect(await downloadBackup('tok', 'f1')).toBe('{"books":[]}');
    expect(lastCall().url).toContain('/files/f1?alt=media');
  });
});
