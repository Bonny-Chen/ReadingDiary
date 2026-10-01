import { useCallback, useEffect, useRef, useState } from 'react';

import { useDataVersion } from '@/hooks/use-data-version';

export interface AsyncData<T> {
  data: T | undefined;
  loading: boolean;
  error: Error | null;
  reload: () => void;
}

interface LoadedState<T> {
  /** 這份資料是為哪一組條件載入的 */
  key: string;
  data: T | undefined;
  error: Error | null;
}

/**
 * 查詢本機 DB 用的小型載入 hook。
 * 資料版本改變（bumpDataVersion）、deps 改變或呼叫 reload 時自動重查。
 *
 * loading 由「已載入的 key」與「目前的 key」比對得出，
 * 這樣就不必在 effect 裡同步 setState，也不會有多餘的重繪。
 */
export function useAsyncData<T>(loader: () => Promise<T>, deps: unknown[] = []): AsyncData<T> {
  const dataVersion = useDataVersion();
  const [manualVersion, setManualVersion] = useState(0);
  const key = JSON.stringify([dataVersion, manualVersion, ...deps]);

  const [loaded, setLoaded] = useState<LoadedState<T>>({ key: '', data: undefined, error: null });

  // 保存最新的 loader，但不把它放進下面的 deps —— 每次 render 都是新的函式，
  // 直接當依賴會無限重查。這個 effect 宣告在前面，會先於載入的 effect 執行。
  const loaderRef = useRef(loader);
  useEffect(() => {
    loaderRef.current = loader;
  });

  useEffect(() => {
    let cancelled = false;

    loaderRef
      .current()
      .then((result) => {
        if (!cancelled) setLoaded({ key, data: result, error: null });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoaded({
            key,
            data: undefined,
            error: err instanceof Error ? err : new Error(String(err)),
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [key]);

  const reload = useCallback(() => setManualVersion((v) => v + 1), []);

  return {
    data: loaded.data,
    loading: loaded.key !== key,
    error: loaded.error,
    reload,
  };
}
