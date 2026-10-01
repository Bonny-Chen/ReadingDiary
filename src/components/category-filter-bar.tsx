import { memo, useCallback, useEffect, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { t } from '@/i18n/zh-TW';
import type { Category } from '@/types/models';

export interface CategoryFilterBarProps {
  categories: Category[];
  selectedIds: number[];
  onChange: (ids: number[]) => void;
}

/**
 * 單獨拉出來並用 memo 包住，onToggle 也用穩定的參照傳下來：切換選取時只有真的
 * 變動的一兩個標籤會重新渲染，不會整排標籤同時重新排版——不然點一下「全部」，
 * 橫向 ScrollView 裡所有標籤同時重新量測文字寬度，畫面上會有一瞬間文字疊在一起、卡卡的。
 */
const CategoryChip = memo(function CategoryChip({
  id,
  label,
  selected,
  onToggle,
}: {
  id: number | null;
  label: string;
  selected: boolean;
  onToggle: (id: number | null) => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={() => onToggle(id)}
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
        numberOfLines={1}
        style={{ color: selected ? '#FFFFFF' : theme.textSecondary }}>
        {label}
      </ThemedText>
    </Pressable>
  );
});

/** 主頁與書庫共用的類別篩選列。多選為 OR 條件；全部取消即代表「全部」。 */
export function CategoryFilterBar({ categories, selectedIds, onChange }: CategoryFilterBarProps) {
  // 用 ref 讀最新的 selectedIds，讓 handleToggle 的參照維持穩定，
  // 不會因為 selectedIds 變動就讓所有 CategoryChip 一起被迫重新渲染。
  const selectedIdsRef = useRef(selectedIds);
  useEffect(() => {
    selectedIdsRef.current = selectedIds;
  });

  const handleToggle = useCallback(
    (id: number | null) => {
      if (id === null) {
        onChange([]);
        return;
      }
      const current = selectedIdsRef.current;
      onChange(current.includes(id) ? current.filter((x) => x !== id) : [...current, id]);
    },
    [onChange],
  );

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scroll}
      contentContainerStyle={styles.content}>
      <CategoryChip id={null} label={t.common.all} selected={selectedIds.length === 0} onToggle={handleToggle} />
      {categories.map((category) => (
        <CategoryChip
          key={category.id}
          id={category.id}
          label={category.name}
          selected={selectedIds.includes(category.id)}
          onToggle={handleToggle}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // ScrollView 預設 flexGrow: 1，在直向 flex 容器裡會撐滿剩餘空間；
  // 明確歸零讓它縮回內容高度，不要把下面的內容擠開。
  // flexShrink 也要歸零：預設值 1 會在空間吃緊時把整列壓扁，標籤高度被切掉、文字卡住。
  scroll: { flexGrow: 0, flexShrink: 0 },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  chip: {
    flexShrink: 0,
    borderRadius: Radius.pill,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one + 2,
  },
});
