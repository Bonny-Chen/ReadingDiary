/**
 * Google Drive REST 的最小封裝：只做「Drive 根目錄下 BACKUP_FOLDER_NAME 資料夾裡的單一備份檔」。
 * 用 drive.file 範圍，只看得到本 App 建立的檔案；使用者可以在 Drive 裡直接看到並下載備份檔。
 * 全部函式都吃 accessToken 參數、不碰登入狀態，方便用 mock fetch 測。
 */

export const BACKUP_FILE_NAME = 'reading-backup.json';
export const BACKUP_FOLDER_NAME = '閱讀日記';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const LIST_TIMEOUT_MS = 15000;
const TRANSFER_TIMEOUT_MS = 60000;

export class DriveError extends Error {
  constructor(
    public readonly status: number,
    message?: string,
  ) {
    super(message ?? `Google Drive 回應 ${status}`);
    this.name = 'DriveError';
  }
}

export interface DriveFileInfo {
  id: string;
  /** ISO 時間字串 */
  modifiedTime: string;
}

async function request(
  url: string,
  init: RequestInit,
  accessToken: string,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...init,
      headers: { ...(init.headers ?? {}), Authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    });
    if (!response.ok) throw new DriveError(response.status);
    return response;
  } finally {
    clearTimeout(timer);
  }
}

async function listFiles(accessToken: string, query: string): Promise<DriveFileInfo[]> {
  const params = new URLSearchParams({
    q: `${query} and trashed = false`,
    fields: 'files(id,modifiedTime)',
    orderBy: 'modifiedTime desc',
    pageSize: '1',
  });
  const response = await request(`${API}/files?${params}`, { method: 'GET' }, accessToken, LIST_TIMEOUT_MS);
  const body = (await response.json()) as { files?: DriveFileInfo[] };
  return body.files ?? [];
}

/** 找備份資料夾，沒有就在根目錄建一個；回傳資料夾 id。 */
export async function ensureBackupFolder(accessToken: string): Promise<string> {
  const [existing] = await listFiles(
    accessToken,
    `name = '${BACKUP_FOLDER_NAME}' and mimeType = '${FOLDER_MIME}' and 'root' in parents`,
  );
  if (existing) return existing.id;

  const response = await request(
    `${API}/files?fields=id`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: BACKUP_FOLDER_NAME, mimeType: FOLDER_MIME, parents: ['root'] }),
    },
    accessToken,
    LIST_TIMEOUT_MS,
  );
  const created = (await response.json()) as { id: string };
  return created.id;
}

/** 找資料夾裡的備份檔；沒有時回傳 null。 */
export async function findBackupFile(
  accessToken: string,
  folderId: string,
): Promise<DriveFileInfo | null> {
  const [file] = await listFiles(accessToken, `name = '${BACKUP_FILE_NAME}' and '${folderId}' in parents`);
  return file ?? null;
}

/**
 * 上傳備份內容。已有檔案就覆寫內容（PATCH media），沒有就在資料夾裡新建（multipart）。
 * 回傳檔案 id。
 */
export async function uploadBackup(
  accessToken: string,
  json: string,
  folderId: string,
  existingId?: string | null,
): Promise<string> {
  if (existingId) {
    const response = await request(
      `${UPLOAD_API}/files/${existingId}?uploadType=media`,
      { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: json },
      accessToken,
      TRANSFER_TIMEOUT_MS,
    );
    const body = (await response.json()) as { id?: string };
    return body.id ?? existingId;
  }

  const boundary = 'reading-backup-boundary';
  const metadata = JSON.stringify({ name: BACKUP_FILE_NAME, parents: [folderId] });
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n${json}\r\n` +
    `--${boundary}--`;
  const response = await request(
    `${UPLOAD_API}/files?uploadType=multipart`,
    {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    },
    accessToken,
    TRANSFER_TIMEOUT_MS,
  );
  const created = (await response.json()) as { id: string };
  return created.id;
}

/** 下載備份檔內容（JSON 字串）。 */
export async function downloadBackup(accessToken: string, fileId: string): Promise<string> {
  const response = await request(
    `${API}/files/${fileId}?alt=media`,
    { method: 'GET' },
    accessToken,
    TRANSFER_TIMEOUT_MS,
  );
  return response.text();
}
