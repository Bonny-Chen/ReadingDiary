import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Category } from '@/types/models';

/** 編輯表單用的多選類別，會自動換行。 */
export function CategoryPicker({
  categories,
  selectedIds,
  onChange,
}: {
  categories: Category[];
  selectedIds: number[];
  onChange: (ids: number[]) => void;
}) {
  const theme = useTheme();

  const toggle = (id: number) =>
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);

  return (
    <View style={styles.wrap}>
      {categories.map((category) => {
        const selected = selectedIds.includes(category.id);
        return (
          <Pressable
            key={category.id}
            onPress={() => toggle(category.id)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            style={[
              styles.chip,
              {
                backgroundColor: selected ? theme.filterSelected : 'transparent',
                borderColor: selected ? theme.filterSelected : theme.border,
              },
            ]}>
            <ThemedText
              type="small"
              style={{ color: selected ? '#FFFFFF' : theme.textSecondary }}>
              {category.name}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  // 左右內距刻意比 Spacing.three 窄一點：兩個字的標籤在 16px 內距下寬 62px，
  // 五顆加間距要 342px，在 375pt 的機型上只剩 1px 餘裕，系統字級一調大就會
  // 擠掉最後一顆。14px 時一顆約 58px、五顆共 322px，仍留約 20px 餘裕。
  chip: {
    borderWidth: 1,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.three - 2,
    paddingVertical: Spacing.two,
  },
});
