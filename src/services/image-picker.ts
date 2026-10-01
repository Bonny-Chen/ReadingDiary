export type ImageSource = 'library' | 'camera';

/**
 * 用隱藏的 <input type=file> 取圖：camera 加上 capture 讓手機直接開相機。
 * 必須在使用者點擊的同一個 call stack 內呼叫，所以呼叫端不能先 await 別的東西。
 */
export function pickImage(source: ImageSource): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    if (source === 'camera') input.capture = 'environment';
    input.onchange = () => {
      const file = input.files?.[0];
      resolve(file ? URL.createObjectURL(file) : null);
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}
