/**
 * 備份用到的平台相關檔案操作（web 版）。封面以 data URL 存在資料庫，
 * 備份時去掉前綴只存 base64，格式與原生 App 匯出的備份完全相容。
 */

const DATA_URL_PREFIX = 'data:image/jpeg;base64,';

export async function readCoverBase64(uri: string | null): Promise<string | null> {
  if (!uri) return null;
  if (uri.startsWith(DATA_URL_PREFIX)) return uri.slice(DATA_URL_PREFIX.length);
  if (uri.startsWith('data:')) return uri.slice(uri.indexOf(',') + 1);
  return null;
}

export function writeCoverFromBase64(_bookId: number, base64: string): string | null {
  return `${DATA_URL_PREFIX}${base64}`;
}

/** web 沒有檔案系統：回傳 object URL，由 settings 頁觸發下載／分享。 */
export function writeBackupFile(fileName: string, json: string): string {
  const file = new File([json], fileName, { type: 'application/json' });
  return URL.createObjectURL(file);
}

export async function readBackupFile(fileUri: string): Promise<string> {
  const response = await fetch(fileUri);
  return response.text();
}

/** 優先用 Web Share（iOS Safari 支援分享檔案），不支援時退回下載連結。 */
export async function shareBackupFile(uri: string): Promise<void> {
  const blob = await (await fetch(uri)).blob();
  const file = new File([blob], `reading-backup-${new Date().toISOString().slice(0, 10)}.json`, {
    type: 'application/json',
  });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
    } catch (error) {
      // 使用者關閉分享面板不算錯誤
      if (!(error instanceof DOMException && error.name === 'AbortError')) throw error;
    }
    return;
  }
  const link = document.createElement('a');
  link.href = uri;
  link.download = file.name;
  link.click();
}

/** 必須在使用者點擊的同一個 call stack 內呼叫，否則 iOS 會擋掉檔案選擇器。 */
export function pickBackupFile(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = () => {
      const file = input.files?.[0];
      resolve(file ? URL.createObjectURL(file) : null);
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}
