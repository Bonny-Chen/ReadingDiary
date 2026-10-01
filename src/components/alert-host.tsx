import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui-kit';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { t } from '@/i18n/zh-TW';
import { type AlertRequest, setAlertListener } from '@/utils/alert';

/** web 版 Alert.alert 的顯示端：依序排隊顯示對話框，按鈕行為與 RN Alert 相同。 */
export function AlertHost() {
  const theme = useTheme();
  const [queue, setQueue] = useState<AlertRequest[]>([]);

  useEffect(() => {
    setAlertListener((request) => setQueue((current) => [...current, request]));
    return () => setAlertListener(null);
  }, []);

  const current = queue[0];
  if (!current) return null;

  const close = (onPress?: () => void) => {
    setQueue((items) => items.slice(1));
    onPress?.();
  };
  const cancelButton = current.buttons.find((button) => button.style === 'cancel');

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => close(cancelButton?.onPress)}>
      <Pressable style={styles.backdrop} onPress={() => close(cancelButton?.onPress)}>
        <Pressable
          style={[styles.sheet, { backgroundColor: theme.background }]}
          onPress={(event) => event.stopPropagation()}>
          <ThemedText type="smallBold">{current.title}</ThemedText>
          {current.message ? (
            <ThemedText type="small" themeColor="textSecondary">
              {current.message}
            </ThemedText>
          ) : null}
          <View style={styles.actions}>
            {current.buttons.map((button, index) => (
              <Button
                key={index}
                label={button.text ?? t.common.confirm}
                variant={button.style === 'cancel' ? 'secondary' : button.style === 'destructive' ? 'danger' : 'primary'}
                onPress={() => close(button.onPress)}
              />
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#00000088', justifyContent: 'center', padding: Spacing.three },
  sheet: { borderRadius: Radius.lg, padding: Spacing.four, gap: Spacing.three },
  actions: { gap: Spacing.two },
});
