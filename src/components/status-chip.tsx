import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { t } from '@/i18n/zh-TW';
import { READING_STATUSES, type ReadingStatus } from '@/types/models';

export function statusColor(status: ReadingStatus, theme: ReturnType<typeof useTheme>): string {
  return status === 'read' ? theme.read : status === 'reading' ? theme.reading : theme.unread;
}

export function StatusChip({ status, small }: { status: ReadingStatus; small?: boolean }) {
  const theme = useTheme();
  const color = statusColor(status, theme);

  return (
    <View style={[styles.chip, { borderColor: color }, small && styles.chipSmall]}>
      <ThemedText type={small ? 'small' : 'smallBold'} style={{ color }}>
        {t.status[status]}
      </ThemedText>
    </View>
  );
}

/**
 * 三段式狀態顯示。
 * 有給 onChange 時是可點的切換元件（用於編輯表單）；沒給則是唯讀顯示
 * （用於詳情頁）——一樣是三段並排、大字級，一眼就看出目前在哪個階段，
 * 只是不能點，跟小巧的 StatusChip 標籤是兩種用途。
 */
export function StatusPicker({
  value,
  onChange,
}: {
  value: ReadingStatus;
  onChange?: (status: ReadingStatus) => void;
}) {
  const theme = useTheme();
  const readOnly = !onChange;

  return (
    <View style={[styles.segment, { backgroundColor: theme.backgroundElement }]}>
      {READING_STATUSES.map((status) => {
        const selected = status === value;
        const content = (
          <>
            <ThemedText
              type="smallBold"
              style={{ color: selected ? statusColor(status, theme) : theme.textSecondary }}>
              {t.status[status]}
            </ThemedText>
          </>
        );
        const itemStyle = [
          styles.segmentItem,
          selected && { backgroundColor: theme.card, borderColor: statusColor(status, theme) },
        ];

        return readOnly ? (
          <View key={status} style={itemStyle}>
            {content}
          </View>
        ) : (
          <Pressable
            key={status}
            onPress={() => onChange(status)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            style={itemStyle}>
            {content}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderWidth: 1,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  chipSmall: { paddingHorizontal: Spacing.one + 2 },
  segment: {
    flexDirection: 'row',
    borderRadius: Radius.md,
    padding: 3,
    gap: 3,
  },
  segmentItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.two,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: 'transparent',
  },
});
