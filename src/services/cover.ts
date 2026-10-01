/**
 * Web 版封面：壓縮成 600px JPEG 後直接以 data URL 存在 books.cover_uri，
 * 不需要檔案系統，備份與還原也不用另外搬檔案。
 */

const TARGET_WIDTH = 600;
const JPEG_QUALITY = 0.85;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('圖片載入失敗'));
    image.src = src;
  });
}

/** 縮到指定寬度並轉成 JPEG data URL（不放大）。OCR 也共用這個函式。 */
export async function resizeToJpegDataUrl(
  sourceUri: string,
  width: number,
  quality: number,
): Promise<string> {
  const image = await loadImage(sourceUri);
  const scale = Math.min(1, width / image.naturalWidth);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(image.naturalWidth * scale);
  canvas.height = Math.round(image.naturalHeight * scale);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('無法建立 canvas');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', quality);
}

export async function saveCoverFromLocalUri(sourceUri: string, _prefix: string): Promise<string> {
  return resizeToJpegDataUrl(sourceUri, TARGET_WIDTH, JPEG_QUALITY);
}

/** 失敗（含 CORS 擋下）時回傳 null —— 沒有封面不該擋住整個新增書籍流程。 */
export async function saveCoverFromUrl(url: string, prefix: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    try {
      return await saveCoverFromLocalUri(objectUrl, prefix);
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  } catch {
    return null;
  }
}

/** data URL 自帶內容，不會失效，原樣回傳。 */
export function resolveCoverUri(stored: string | null | undefined): string | null {
  return stored || null;
}

/** 封面存在資料列裡，刪書時隨資料一起消失，無檔案可清。 */
export function deleteCover(_uri: string | null | undefined): void {}

export function clearCoversDirectory(): void {}

export function coversDirectoryUri(): string {
  return '';
}
