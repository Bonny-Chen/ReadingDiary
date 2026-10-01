import { resizeToJpegDataUrl } from '@/services/cover';
import { extractIsbnCandidates } from '@/services/isbn';

/**
 * Web 版 OCR：tesseract.js（WASM）在瀏覽器端離線辨識。
 * 語言模型第一次使用時才下載（eng 約 4MB、chi_tra 約 12MB），之後由瀏覽器快取。
 * 準確度不如原生 ML Kit，所以結果一律只當建議，使用者可在表單修改。
 */

const OCR_WIDTH = 1600;

export interface OcrResult {
  candidates: string[];
  rawText: string;
}

export interface CoverOcrResult {
  titleGuess: string | null;
  authorGuess: string | null;
  rawText: string;
}

type Worker = import('tesseract.js').Worker;

const workers = new Map<string, Promise<Worker>>();

async function getWorker(lang: string): Promise<Worker> {
  let worker = workers.get(lang);
  if (!worker) {
    worker = import('tesseract.js').then(({ createWorker }) => createWorker(lang));
    workers.set(lang, worker);
  }
  return worker;
}

export async function recognizeIsbn(imageUri: string): Promise<OcrResult> {
  try {
    const prepared = await resizeToJpegDataUrl(imageUri, OCR_WIDTH, 0.95);
    const worker = await getWorker('eng');
    const { data } = await worker.recognize(prepared);
    return { candidates: extractIsbnCandidates(data.text ?? ''), rawText: data.text ?? '' };
  } catch {
    return { candidates: [], rawText: '' };
  }
}

/** 中文字之間 tesseract 會插空白，合併前先去掉。 */
function clean(text: string): string {
  return text.replace(/\s+/g, ' ').replace(/(?<=[一-鿿]) (?=[一-鿿])/g, '').trim();
}

/** 以文字行的面積排序當作書名／作者的猜測（書名字通常最大），與原生版邏輯一致。 */
export async function recognizeCoverText(imageUri: string): Promise<CoverOcrResult> {
  try {
    const prepared = await resizeToJpegDataUrl(imageUri, OCR_WIDTH, 0.95);
    const worker = await getWorker('chi_tra');
    const { data } = await worker.recognize(prepared, {}, { blocks: true });
    const lines = (data.blocks ?? [])
      .flatMap((block) => block.paragraphs.flatMap((paragraph) => paragraph.lines))
      .map((line) => ({
        text: clean(line.text),
        area: (line.bbox.x1 - line.bbox.x0) * (line.bbox.y1 - line.bbox.y0),
      }))
      .filter((line) => line.text.length > 0)
      .sort((a, b) => b.area - a.area);

    return {
      titleGuess: lines[0]?.text ?? null,
      authorGuess: lines[1]?.text ?? null,
      rawText: data.text ?? '',
    };
  } catch {
    return { titleGuess: null, authorGuess: null, rawText: '' };
  }
}
