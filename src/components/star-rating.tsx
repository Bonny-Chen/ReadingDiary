import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

/**
 * 半顆星評分。
 * value 是 0–10 的整數：每顆星 2 分，1 分即半顆。
 * 唯讀模式（沒有 onChange）只負責顯示。
 */
export interface StarRatingProps {
  value: number | null;
  onChange?: (value: number | null) => void;
  size?: number;
  /** 再按一次同樣的分數會清除評分 */
  allowClear?: boolean;
}

const STAR_COUNT = 5;

export function StarRating({ value, onChange, size = 28, allowClear = true }: StarRatingProps) {
  const theme = useTheme();
  const score = value ?? 0;
  const readOnly = !onChange;

  const select = (next: number) => {
    if (!onChange) return;
    onChange(allowClear && next === value ? null : next);
  };

  return (
    <View style={styles.row} accessibilityRole={readOnly ? 'text' : 'adjustable'}>
      {Array.from({ length: STAR_COUNT }, (_, index) => {
        const fullValue = (index + 1) * 2;
        const halfValue = fullValue - 1;
        const name = score >= fullValue ? 'star' : score >= halfValue ? 'star-half' : 'star-outline';

        return (
          <View key={index} style={{ width: size, height: size }}>
            <Ionicons
              name={name}
              size={size}
              color={score >= halfValue ? theme.star : theme.textMuted}
            />
            {!readOnly && (
              <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
                <View style={styles.halves}>
                  <Pressable
                    style={styles.half}
                    onPress={() => select(halfValue)}
                    accessibilityLabel={`${halfValue / 2} 顆星`}
                  />
                  <Pressable
                    style={styles.half}
                    onPress={() => select(fullValue)}
                    accessibilityLabel={`${fullValue / 2} 顆星`}
                  />
                </View>
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

/** 顯示用文字，例如 3.5 */
export function formatRating(value: number | null): string {
  if (value == null) return '';
  return (value / 2).toFixed(value % 2 === 0 ? 0 : 1);
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 2 },
  halves: { flex: 1, flexDirection: 'row' },
  half: { flex: 1 },
});
