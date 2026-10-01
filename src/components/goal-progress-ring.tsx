import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';

export interface GoalProgressRingProps {
  done: number;
  target: number;
  size?: number;
  strokeWidth?: number;
}

/** 年度目標進度環。target 為 0 時只顯示已讀本數。 */
export function GoalProgressRing({
  done,
  target,
  size = 132,
  strokeWidth = 12,
}: GoalProgressRingProps) {
  const theme = useTheme();
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const ratio = target > 0 ? Math.min(done / target, 1) : 0;
  const achieved = target > 0 && done >= target;
  const color = achieved ? theme.success : theme.primary;

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={theme.backgroundElement}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={circumference * (1 - ratio)}
          // 從 12 點鐘方向開始畫
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="none">
        <ThemedText style={[styles.number, { color }]}>{done}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {target > 0 ? `/ ${target} 本` : '本'}
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  number: { fontSize: 40, lineHeight: 46, fontWeight: '700' },
});
