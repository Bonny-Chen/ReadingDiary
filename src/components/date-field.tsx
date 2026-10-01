import Ionicons from '@expo/vector-icons/Ionicons';
import { createElement } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { t } from '@/i18n/zh-TW';
import { formatDisplayDate, toIsoDate } from '@/utils/date';

export interface DateFieldProps {
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
}

/**
 * 在原本的欄位外觀上疊一個透明的 <input type=date>，
 * 點擊時直接叫出瀏覽器（iOS 上是原生滾輪）的日期選擇器。
 */
export function DateField({ value, onChange, placeholder }: DateFieldProps) {
  const theme = useTheme();

  return (
    <View style={styles.row}>
      <View style={[styles.box, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Ionicons name="calendar-outline" size={16} color={theme.textSecondary} />
        <ThemedText themeColor={value ? 'text' : 'textMuted'}>
          {value ? formatDisplayDate(value) : (placeholder ?? t.common.none)}
        </ThemedText>
        {createElement('input', {
          type: 'date',
          value: value ?? '',
          max: toIsoDate(new Date()),
          'aria-label': placeholder ?? t.common.none,
          onChange: (event: { target: HTMLInputElement }) => onChange(event.target.value || null),
          style: {
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            opacity: 0,
            cursor: 'pointer',
          },
        })}
      </View>

      {value ? (
        <Pressable
          onPress={() => onChange(null)}
          accessibilityRole="button"
          accessibilityLabel={t.common.delete}
          style={styles.clear}>
          <Ionicons name="close-circle" size={22} color={theme.textMuted} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  box: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.three,
    minHeight: 46,
    overflow: 'hidden',
  },
  clear: { padding: Spacing.one },
});
