import { type IScannerControls, BrowserMultiFormatReader } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';
import { createElement, forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { StyleSheet, View } from 'react-native';

/**
 * 與 expo-camera 相容的最小子集（scan.tsx 用到的部分）。
 * iOS Safari 沒有 BarcodeDetector，所以用 ZXing 從影片畫面持續解碼 EAN-13／EAN-8。
 * 需要 HTTPS，且 getUserMedia 要在使用者點擊後才會跳出授權。
 */

export interface CameraViewProps {
  style?: StyleProp<ViewStyle>;
  facing?: 'back' | 'front';
  barcodeScannerSettings?: { barcodeTypes: string[] };
  onBarcodeScanned?: (result: { data: string }) => void;
}

export interface CameraViewHandle {
  takePictureAsync: (options?: { quality?: number }) => Promise<{ uri: string } | undefined>;
}

const hints = new Map<DecodeHintType, unknown>([
  [DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8]],
  [DecodeHintType.TRY_HARDER, true],
]);

export const CameraView = forwardRef<CameraViewHandle, CameraViewProps>(function CameraView(
  { style, facing = 'back', onBarcodeScanned },
  ref,
) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  // 掃描回呼放 ref，避免 callback 更換時重啟相機串流
  const onScanRef = useRef(onBarcodeScanned);
  useEffect(() => {
    onScanRef.current = onBarcodeScanned;
  });

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let controls: IScannerControls | null = null;
    let cancelled = false;

    const reader = new BrowserMultiFormatReader(hints as Map<DecodeHintType, never>);
    reader
      .decodeFromConstraints(
        {
          video: {
            facingMode: facing === 'back' ? { ideal: 'environment' } : 'user',
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        },
        video,
        (result) => {
          if (result) onScanRef.current?.({ data: result.getText() });
        },
      )
      .then((started) => {
        if (cancelled) started.stop();
        else controls = started;
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      controls?.stop();
    };
  }, [facing]);

  useImperativeHandle(ref, () => ({
    async takePictureAsync(options) {
      const video = videoRef.current;
      if (!video || !video.videoWidth) return undefined;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext('2d')?.drawImage(video, 0, 0);
      return { uri: canvas.toDataURL('image/jpeg', options?.quality ?? 0.92) };
    },
  }));

  return (
    <View style={[styles.container, style]}>
      {createElement('video', {
        ref: videoRef,
        autoPlay: true,
        muted: true,
        playsInline: true,
        style: { width: '100%', height: '100%', objectFit: 'cover' },
      })}
    </View>
  );
});

const styles = StyleSheet.create({ container: { overflow: 'hidden', backgroundColor: '#000' } });

/** 授權狀態：只有成功拿到串流才算 granted；必須由按鈕點擊觸發 request。 */
export function useCameraPermissions(): [
  { granted: boolean } | null,
  () => Promise<{ granted: boolean }>,
] {
  const [permission, setPermission] = useState<{ granted: boolean } | null>(null);

  useEffect(() => {
    let active = true;
    const query = navigator.permissions?.query({ name: 'camera' as PermissionName });
    // 不支援 permissions API（iOS Safari）時視為尚未授權，等使用者按下按鈕
    (query ?? Promise.reject(new Error('unsupported')))
      .then((status) => active && setPermission({ granted: status.state === 'granted' }))
      .catch(() => active && setPermission({ granted: false }));
    return () => {
      active = false;
    };
  }, []);

  const request = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach((track) => track.stop());
      setPermission({ granted: true });
      return { granted: true };
    } catch {
      setPermission({ granted: false });
      return { granted: false };
    }
  }, []);

  return [permission, request];
}
