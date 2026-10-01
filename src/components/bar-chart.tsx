import { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Svg, { G, Line, Rect, Text as SvgText } from 'react-native-svg';

import { useTheme } from '@/hooks/use-theme';

export interface BarChartDatum {
  label: string;
  count: number;
}

const LABEL_HEIGHT = 18;
const VALUE_HEIGHT = 16;
const BAR_GAP_RATIO = 0.35;

/**
 * 直式長條圖：長條上方標數字（0 不標），底下標 label。
 * 寬度由 onLayout 取得後平分給每根長條，資料筆數多時每根自然變窄。
 */
export function BarChart({ data, height = 160 }: { data: BarChartDatum[]; height?: number }) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);

  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);

  const max = Math.max(0, ...data.map((d) => d.count));
  const plotTop = VALUE_HEIGHT;
  const plotBottom = height - LABEL_HEIGHT;
  const plotHeight = plotBottom - plotTop;
  const slot = data.length > 0 ? width / data.length : 0;
  const barWidth = slot * (1 - BAR_GAP_RATIO);
  // 年份多時字會擠在一起，只留頭尾與每隔幾根標一次
  const labelEvery = slot >= 28 ? 1 : Math.ceil(28 / Math.max(slot, 1));

  return (
    <View style={[styles.container, { height }]} onLayout={onLayout}>
      {width > 0 && (
        <Svg width={width} height={height}>
          <Line
            x1={0}
            y1={plotBottom}
            x2={width}
            y2={plotBottom}
            stroke={theme.border}
            strokeWidth={StyleSheet.hairlineWidth * 2}
          />
          {data.map((datum, i) => {
            const barHeight = max > 0 ? (datum.count / max) * plotHeight : 0;
            const x = i * slot + (slot - barWidth) / 2;
            const y = plotBottom - barHeight;
            const showLabel = i === 0 || i === data.length - 1 || i % labelEvery === 0;
            return (
              <G key={datum.label}>
                {barHeight > 0 && (
                  <Rect
                    x={x}
                    y={y}
                    width={barWidth}
                    height={barHeight}
                    rx={Math.min(4, barWidth / 2)}
                    fill={theme.primary}
                  />
                )}
                {datum.count > 0 && (
                  <SvgText
                    x={x + barWidth / 2}
                    y={y - 4}
                    fontSize={11}
                    fontWeight="600"
                    fill={theme.textSecondary}
                    textAnchor="middle">
                    {datum.count}
                  </SvgText>
                )}
                {showLabel && (
                  <SvgText
                    x={x + barWidth / 2}
                    y={height - 4}
                    fontSize={11}
                    fill={theme.textMuted}
                    textAnchor="middle">
                    {datum.label}
                  </SvgText>
                )}
              </G>
            );
          })}
        </Svg>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%' },
});
