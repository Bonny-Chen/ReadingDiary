import { SquarePen, Trash } from 'lucide-react-native';
import { useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { t } from '@/i18n/zh-TW';

/** 單顆動作按鈕的寬度 */
const ACTION_WIDTH = 64;
const ACTION_ICON_COLOR = '#FFFFFF';

/**
 * 金句列：左滑露出編輯／刪除，只有圖示、不寫字，跟隨手指、輕輕滑就有反應。
 * friction 用預設值 1（跟手），rightThreshold 對齊按鈕寬度，滑過一小段放手就吸附全開。
 */
export function SwipeableQuoteRow({
  text,
  accentColor,
  onEdit,
  onDelete,
}: {
  text: string;
  accentColor: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const theme = useTheme();
  const swipeableRef = useRef<Swipeable>(null);

  const renderRightActions = () => (
    <View style={styles.actions}>
      <Pressable
        onPress={() => {
          swipeableRef.current?.close();
          onEdit();
        }}
        accessibilityRole="button"
        accessibilityLabel={t.common.edit}
        style={[styles.action, { backgroundColor: theme.reading }]}>
        <SquarePen size={20} color={ACTION_ICON_COLOR} strokeWidth={2.25} />
      </Pressable>
      <Pressable
        onPress={() => {
          swipeableRef.current?.close();
          onDelete();
        }}
        accessibilityRole="button"
        accessibilityLabel={t.common.delete}
        style={[styles.action, { backgroundColor: theme.danger }]}>
        <Trash size={20} color={ACTION_ICON_COLOR} strokeWidth={2.25} />
      </Pressable>
    </View>
  );

  return (
    <Swipeable
      ref={swipeableRef}
      renderRightActions={renderRightActions}
      rightThreshold={ACTION_WIDTH}
      overshootRight={false}>
      <View style={[styles.quote, { borderLeftColor: accentColor, backgroundColor: theme.background }]}>
        <ThemedText>{text}</ThemedText>
      </View>
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  quote: {
    borderLeftWidth: 3,
    paddingLeft: Spacing.three,
    paddingVertical: Spacing.two,
  },
  actions: { flexDirection: 'row', width: ACTION_WIDTH * 2 },
  action: { width: ACTION_WIDTH, alignItems: 'center', justifyContent: 'center' },
});
