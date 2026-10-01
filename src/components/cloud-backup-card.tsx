import { useEffect, useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';

import { Alert } from '@/utils/alert';
import { ThemedText } from '@/components/themed-text';
import { Button, Card } from '@/components/ui-kit';
import { Spacing } from '@/constants/theme';
import { useAsyncData } from '@/hooks/use-async-data';
import { useTheme } from '@/hooks/use-theme';
import { t } from '@/i18n/zh-TW';
import {
  backupToCloud,
  getCloudBackupInfo,
  NoCloudBackupError,
  onCloudBackupStatusChange,
  restoreFromCloud,
  setAutoBackupEnabled,
  SignInCancelledError,
  signInCloud,
  signOutCloud,
} from '@/services/cloud/backup';
import { formatDisplayDateTime } from '@/utils/date';

function describeSignInError(error: unknown): string {
  if (error && typeof error === 'object') {
    const { code, message } = error as { code?: unknown; message?: unknown };
    return [code, message].filter(Boolean).join(': ');
  }
  return String(error);
}

/** 設定頁的「雲端備份」卡片：Google 帳號連結、自動備份開關、立即備份／還原。 */
export function CloudBackupCard() {
  const theme = useTheme();
  const info = useAsyncData(getCloudBackupInfo, []);
  const [busy, setBusy] = useState<'signIn' | 'backup' | 'restore' | null>(null);

  // 自動備份在背景完成時也要讓「上次備份」時間跟著更新
  useEffect(() => onCloudBackupStatusChange(info.reload), [info.reload]);

  const run = async (kind: NonNullable<typeof busy>, task: () => Promise<void>) => {
    setBusy(kind);
    try {
      await task();
    } finally {
      setBusy(null);
      info.reload();
    }
  };

  const connect = () =>
    run('signIn', async () => {
      try {
        await signInCloud();
      } catch (error) {
        if (error instanceof SignInCancelledError) return;
        console.error(error);
        // 登入問題多半是 OAuth 設定（client ID／bundle id／test user）出錯，把原始訊息帶出來才好排查
        Alert.alert(t.errors.cloudSignInFailed, describeSignInError(error));
      }
    });

  const disconnect = () => run('signIn', signOutCloud);

  const backupNow = () =>
    run('backup', async () => {
      try {
        await backupToCloud();
        Alert.alert(t.settings.cloudBackupDone);
      } catch (error) {
        console.error(error);
        Alert.alert(t.errors.cloudBackupFailed);
      }
    });

  const restore = () => {
    Alert.alert(t.settings.importConfirmTitle, t.settings.cloudRestoreConfirmBody, [
      { text: t.common.cancel, style: 'cancel' },
      {
        text: t.common.confirm,
        style: 'destructive',
        onPress: () =>
          run('restore', async () => {
            try {
              await restoreFromCloud();
              Alert.alert(t.settings.cloudRestoreDone);
            } catch (error) {
              if (error instanceof NoCloudBackupError) {
                Alert.alert(t.settings.cloudNoBackup);
                return;
              }
              console.error(error);
              Alert.alert(t.settings.importFailed);
            }
          }),
      },
    ]);
  };

  const toggleAuto = async (enabled: boolean) => {
    await setAutoBackupEnabled(enabled);
    info.reload();
  };

  const account = info.data?.account ?? null;

  return (
    <Card style={styles.card}>
      {!account ? (
        <>
          <ThemedText type="small" themeColor="textSecondary">
            {t.settings.cloudIntro}
          </ThemedText>
          <Button
            label={t.settings.cloudConnect}
            icon="logo-google"
            onPress={connect}
            loading={busy === 'signIn'}
            disabled={info.data === undefined}
          />
        </>
      ) : (
        <>
          <View style={styles.row}>
            <View style={styles.flex}>
              <ThemedText type="smallBold" numberOfLines={1}>
                {account.email}
              </ThemedText>
              <ThemedText type="small" themeColor="textMuted">
                {info.data?.lastBackupAt
                  ? t.settings.cloudLastBackup(formatDisplayDateTime(info.data.lastBackupAt))
                  : t.settings.cloudNeverBackedUp}
              </ThemedText>
              {info.data?.lastRestoreAt ? (
                <ThemedText type="small" themeColor="textMuted">
                  {t.settings.cloudLastRestore(formatDisplayDateTime(info.data.lastRestoreAt))}
                </ThemedText>
              ) : null}
            </View>
          </View>

          {info.data?.lastError ? (
            <ThemedText type="small" style={{ color: theme.danger }}>
              {t.errors.cloudBackupFailed}
            </ThemedText>
          ) : null}

          <View style={styles.row}>
            <ThemedText type="small" themeColor="textSecondary" style={styles.flex}>
              {t.settings.cloudAutoBackup}
            </ThemedText>
            <Switch
              value={info.data?.autoBackup ?? true}
              onValueChange={toggleAuto}
              trackColor={{ true: theme.primary }}
            />
          </View>

          <Button
            label={t.settings.cloudBackupNow}
            icon="cloud-upload-outline"
            onPress={backupNow}
            loading={busy === 'backup'}
            disabled={busy !== null && busy !== 'backup'}
          />
          <Button
            label={t.settings.cloudRestore}
            icon="cloud-download-outline"
            variant="ghost"
            onPress={restore}
            loading={busy === 'restore'}
            disabled={busy !== null && busy !== 'restore'}
          />
          <Button
            label={t.settings.cloudDisconnect}
            variant="ghost"
            onPress={disconnect}
            loading={busy === 'signIn'}
            disabled={busy !== null && busy !== 'signIn'}
          />
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  // 邊距比照 settings.tsx 其他卡片
  card: { marginHorizontal: Spacing.three, marginBottom: Spacing.two, gap: Spacing.two + 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  flex: { flex: 1 },
});
