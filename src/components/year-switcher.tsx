import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { t } from '@/i18n/zh-TW';

/** 首頁與統計頁共用的年份切換列：左右箭頭夾著「YYYY 年度閱讀」。 */
export function YearSwitcher({
  year,
  minYear,
  maxYear,
  onChange,
}: {
  year: number;
  minYear: number;
  maxYear: number;
  onChange: (year: number) => void;
}) {
  const theme = useTheme();
  const canGoBack = year > minYear;
  const canGoForward = year < maxYear;

  return (
    <View style={styles.row}>
      <Pressable
        onPress={() => onChange(year - 1)}
        disabled={!canGoBack}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={t.home.prevYear}>
        <Ionicons
          name="chevron-back"
          size={20}
          color={canGoBack ? theme.textSecondary : theme.textMuted}
        />
      </Pressable>
      <ThemedText type="smallBold" themeColor="textSecondary">
        {t.home.yearHeading(year)}
      </ThemedText>
      <Pressable
        onPress={() => onChange(year + 1)}
        disabled={!canGoForward}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={t.home.nextYear}>
        <Ionicons
          name="chevron-forward"
          size={20}
          color={canGoForward ? theme.textSecondary : theme.textMuted}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
});
