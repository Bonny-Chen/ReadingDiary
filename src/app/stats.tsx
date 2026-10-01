import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { BarChart } from '@/components/bar-chart';
import { BookListItem } from '@/components/book-items';
import { ThemedText } from '@/components/themed-text';
import { Card, EmptyState, LoadingView, SectionHeader } from '@/components/ui-kit';
import { YearSwitcher } from '@/components/year-switcher';
import { Radius, Spacing } from '@/constants/theme';
import { useAsyncData } from '@/hooks/use-async-data';
import { useTheme } from '@/hooks/use-theme';
import { t } from '@/i18n/zh-TW';
import { getEarliestActivityYear } from '@/repositories/goalRepo';
import { getReadingStats, type BookDays, type ReadingStats } from '@/repositories/statsRepo';

type Mode = 'year' | 'all';

export default function StatsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ year?: string }>();
  const currentYear = new Date().getFullYear();

  const initialYear = Number.parseInt(params.year ?? '', 10);
  const [mode, setMode] = useState<Mode>('year');
  const [year, setYear] = useState(Number.isFinite(initialYear) ? initialYear : currentYear);

  const earliestYear = useAsyncData(getEarliestActivityYear, []);
  const minYear = earliestYear.data ?? currentYear;

  const stats = useAsyncData(
    () => getReadingStats(mode === 'year' ? { kind: 'year', year } : { kind: 'all' }),
    [mode, year],
  );

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <ModeSwitch mode={mode} onChange={setMode} />
        {mode === 'year' && (
          <YearSwitcher year={year} minYear={minYear} maxYear={currentYear} onChange={setYear} />
        )}
      </View>

      {stats.data === undefined ? (
        <LoadingView />
      ) : stats.data.finishedCount === 0 ? (
        <EmptyState icon="stats-chart-outline" title={t.stats.empty} />
      ) : (
        <StatsBody
          stats={stats.data}
          mode={mode}
          onOpenBook={(id) => router.push(`/book/${id}`)}
        />
      )}
    </ScrollView>
  );
}

function ModeSwitch({ mode, onChange }: { mode: Mode; onChange: (mode: Mode) => void }) {
  const theme = useTheme();
  const options: { value: Mode; label: string }[] = [
    { value: 'year', label: t.stats.modeYear },
    { value: 'all', label: t.stats.modeAll },
  ];
  return (
    <View style={[styles.segment, { backgroundColor: theme.backgroundElement }]}>
      {options.map((option) => {
        const selected = option.value === mode;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            style={[styles.segmentItem, selected && { backgroundColor: theme.primary }]}>
            <ThemedText
              type="smallBold"
              style={{ color: selected ? theme.onPrimary : theme.textSecondary }}>
              {option.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

function StatsBody({
  stats,
  mode,
  onOpenBook,
}: {
  stats: ReadingStats;
  mode: Mode;
  onOpenBook: (id: number) => void;
}) {
  const theme = useTheme();
  const trend =
    mode === 'year'
      ? stats.trend.map((point) => ({ ...point, label: t.stats.monthLabel(point.label) }))
      : stats.trend;
  const sameBook =
    stats.fastest && stats.slowest && stats.fastest.book.id === stats.slowest.book.id;

  return (
    <>
      <View style={styles.summaryRow}>
        <SummaryCard label={t.stats.finishedCount} value={String(stats.finishedCount)} />
        <SummaryCard
          label={t.stats.avgDays}
          value={stats.avgDays == null ? '—' : stats.avgDays.toFixed(1)}
        />
        <SummaryCard label={t.stats.totalReadingDays} value={String(stats.totalReadingDays)} />
      </View>

      <View>
        <SectionHeader title={mode === 'year' ? t.stats.trendMonthly : t.stats.trendYearly} />
        <Card style={styles.sectionCard}>
          <BarChart data={trend} />
        </Card>
      </View>

      <View>
        <SectionHeader title={t.stats.categoryShare} />
        <Card style={[styles.sectionCard, styles.categoryList]}>
          {stats.categories.map((category) => (
            <RatioBar
              key={category.id}
              name={category.name}
              value={category.count}
              max={stats.finishedCount}
              valueLabel={shareLabel(category.count, stats.finishedCount)}
              color={theme.primary}
            />
          ))}
          {stats.uncategorizedCount > 0 && (
            <RatioBar
              name={t.stats.uncategorized}
              value={stats.uncategorizedCount}
              max={stats.finishedCount}
              valueLabel={shareLabel(stats.uncategorizedCount, stats.finishedCount)}
              color={theme.textMuted}
            />
          )}
        </Card>
      </View>

      {stats.quotesByBook.length > 0 && (
        <View>
          <SectionHeader
            title={t.stats.quotesByBook}
            action={
              <ThemedText type="small" themeColor="textMuted">
                {t.stats.quotesTotal(stats.totalQuotes)}
              </ThemedText>
            }
          />
          <Card style={[styles.sectionCard, styles.categoryList]}>
            {stats.quotesByBook.map((item) => (
              <RatioBar
                key={item.bookId}
                name={item.title}
                value={item.count}
                max={stats.quotesByBook[0].count}
                valueLabel={t.stats.quoteCount(item.count)}
                color={theme.primary}
                onPress={() => onOpenBook(item.bookId)}
              />
            ))}
          </Card>
        </View>
      )}

      {stats.fastest && stats.slowest && (
        <View>
          <SectionHeader title={t.stats.extremes} />
          <View style={styles.extremes}>
            <ExtremeRow
              label={sameBook ? t.stats.extremes : t.stats.fastest}
              item={stats.fastest}
              onPress={() => onOpenBook(stats.fastest!.book.id)}
            />
            {!sameBook && (
              <ExtremeRow
                label={t.stats.slowest}
                item={stats.slowest}
                onPress={() => onOpenBook(stats.slowest!.book.id)}
              />
            )}
          </View>
        </View>
      )}
    </>
  );
}

function shareLabel(count: number, total: number): string {
  const percent = total > 0 ? Math.round((count / total) * 100) : 0;
  return `${count} ${t.common.book} · ${percent}%`;
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <Card style={styles.summaryCard}>
      <ThemedText style={[styles.summaryValue, { color: theme.primary }]}>{value}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.centerText}>
        {label}
      </ThemedText>
    </Card>
  );
}

/** 橫向比例條：左邊名稱、右邊數值文字，底下是相對於 max 的長條。 */
function RatioBar({
  name,
  value,
  max,
  valueLabel,
  color,
  onPress,
}: {
  name: string;
  value: number;
  max: number;
  valueLabel: string;
  color: string;
  onPress?: () => void;
}) {
  const theme = useTheme();
  const ratio = max > 0 ? value / max : 0;
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      style={({ pressed }) => [styles.ratioRow, { opacity: pressed ? 0.6 : 1 }]}>
      <View style={styles.ratioHeader}>
        <ThemedText type="smallBold" numberOfLines={1} style={styles.flex}>
          {name}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {valueLabel}
        </ThemedText>
      </View>
      <View style={[styles.track, { backgroundColor: theme.backgroundElement }]}>
        <View style={[styles.fill, { width: `${ratio * 100}%`, backgroundColor: color }]} />
      </View>
    </Pressable>
  );
}

function ExtremeRow({ label, item, onPress }: { label: string; item: BookDays; onPress: () => void }) {
  const theme = useTheme();
  return (
    <View style={styles.extremeRow}>
      <View style={styles.extremeHeader}>
        <ThemedText type="small" themeColor="textSecondary">
          {label}
        </ThemedText>
        <ThemedText type="smallBold" style={{ color: theme.primary }}>
          {t.stats.days(item.days)}
        </ThemedText>
      </View>
      <BookListItem book={item.book} onPress={onPress} />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingVertical: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.five },
  header: { alignItems: 'center', gap: Spacing.three, paddingHorizontal: Spacing.three },
  segment: {
    flexDirection: 'row',
    borderRadius: Radius.pill,
    padding: Spacing.one,
    alignSelf: 'center',
  },
  segmentItem: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.pill,
    minWidth: 88,
    alignItems: 'center',
  },
  summaryRow: { flexDirection: 'row', gap: Spacing.two, paddingHorizontal: Spacing.three },
  summaryCard: { flex: 1, alignItems: 'center', gap: Spacing.half },
  summaryValue: { fontSize: 26, lineHeight: 32, fontWeight: '700' },
  centerText: { textAlign: 'center' },
  sectionCard: { marginHorizontal: Spacing.three },
  categoryList: { gap: Spacing.three },
  ratioRow: { gap: Spacing.one + 2 },
  ratioHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  track: { height: 8, borderRadius: Radius.pill, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: Radius.pill },
  extremes: { gap: Spacing.three, paddingHorizontal: Spacing.three },
  extremeRow: { gap: Spacing.one + 2 },
  extremeHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  flex: { flex: 1 },
});
