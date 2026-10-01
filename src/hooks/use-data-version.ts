import { useSyncExternalStore } from 'react';

/**
 * 極簡的全域「資料已變動」訊號。
 * 任何寫入 DB 的動作結束後呼叫 bumpDataVersion()，
 * 正在畫面上的清單就會重新查詢，不必把 state 提到最上層。
 */

let version = 0;
const listeners = new Set<() => void>();

export function bumpDataVersion(): void {
  version += 1;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** 給畫面以外的訂閱者（例如雲端自動備份）用：每次 bumpDataVersion 都會被呼叫。 */
export function onDataVersionBump(listener: () => void): () => void {
  return subscribe(listener);
}

export function useDataVersion(): number {
  return useSyncExternalStore(
    subscribe,
    () => version,
    () => version,
  );
}
