import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** 每秒捲動的像素數 */
const SPEED = 40;
/** 兩份文字之間的間距 */
const GAP = 48;

/**
 * 單行文字跑馬燈：文字連續放兩份，往左捲完一份的寬度就回到起點，
 * 看起來像無縫接續、不會等整句離開才重來。
 * 文字放在關閉捲動的橫向 ScrollView 裡，才能量到不換行的完整寬度。
 */
export function QuoteMarquee({ text, onPress }: { text: string; onPress?: () => void }) {
  const theme = useTheme();
  const [textWidth, setTextWidth] = useState(0);
  // 用 useState 的 lazy initializer 保存 Animated.Value，避免在 render 期間讀 ref
  const [translateX] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (textWidth === 0) return;
    const distance = textWidth + GAP;
    translateX.setValue(0);
    const animation = Animated.loop(
      Animated.timing(translateX, {
        toValue: -distance,
        duration: (distance / SPEED) * 1000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    animation.start();
    return () => animation.stop();
  }, [textWidth, text, translateX]);

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={text}
      style={({ pressed }) => [
        styles.container,
        { backgroundColor: theme.primarySoft, opacity: pressed ? 0.7 : 1 },
      ]}>
      <Ionicons name="chatbox-ellipses-outline" size={16} color={theme.primary} />
      <View style={styles.viewport}>
        <ScrollView horizontal scrollEnabled={false} showsHorizontalScrollIndicator={false}>
          <Animated.View style={[styles.track, { transform: [{ translateX }] }]}>
            <ThemedText
              type="small"
              numberOfLines={1}
              onLayout={(event) => setTextWidth(event.nativeEvent.layout.width)}>
              {text}
            </ThemedText>
            <ThemedText type="small" numberOfLines={1} accessibilityElementsHidden importantForAccessibility="no">
              {text}
            </ThemedText>
          </Animated.View>
        </ScrollView>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginHorizontal: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radius.pill,
  },
  viewport: { flex: 1, overflow: 'hidden' },
  track: { flexDirection: 'row', gap: GAP },
});
