import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AlertHost } from '@/components/alert-host';
import { getDb } from '@/db';
import { onDataVersionBump } from '@/hooks/use-data-version';
import { t } from '@/i18n/zh-TW';
import { BASE_URL } from '@/utils/base-url';
import {
  configureGoogleSignIn,
  runStartupCatchUp,
  scheduleAutoBackup,
  watchNetworkForRetry,
} from '@/services/cloud/backup';

SplashScreen.preventAutoHideAsync();

/** 只有 web 有 service worker；原生平台 navigator.serviceWorker 不存在，直接略過。 */
function registerServiceWorker() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register(`${BASE_URL}/sw.js`, { scope: `${BASE_URL}/` }).catch(() => undefined);
}

export default function RootLayout() {
  const colorScheme = useColorScheme();

  useEffect(() => {
    configureGoogleSignIn();
    registerServiceWorker();
    // 開啟資料庫並跑 migration，完成後才收起啟動畫面
    getDb()
      .then(() => {
        // 雲端自動備份：訂閱所有資料異動，並補傳上次沒傳成功的
        runStartupCatchUp().catch((error) => console.warn('啟動補備份失敗', error));
      })
      .catch((error) => console.error('資料庫初始化失敗', error))
      .finally(() => SplashScreen.hideAsync());
    const unsubscribeBump = onDataVersionBump(scheduleAutoBackup);
    const unwatchNetwork = watchNetworkForRetry();
    return () => {
      unsubscribeBump();
      unwatchNetwork();
    };
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false, title: '' }} />
          <Stack.Screen
            name="book/[id]"
            options={{ title: t.book.detailTitle, headerBackButtonDisplayMode: 'minimal' }}
          />
          <Stack.Screen
            name="book/edit"
            options={{ title: t.book.editTitle, headerBackButtonDisplayMode: 'minimal' }}
          />
          <Stack.Screen
            name="stats"
            options={{ title: t.stats.title, headerBackButtonDisplayMode: 'minimal' }}
          />
          <Stack.Screen
            name="scan"
            options={{ title: t.scan.title, presentation: 'modal' }}
          />
        </Stack>
        <AlertHost />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
