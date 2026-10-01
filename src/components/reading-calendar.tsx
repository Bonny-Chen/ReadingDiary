import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, View } from 'react-native';
import { Calendar, LocaleConfig } from 'react-native-calendars';

import { BookCover } from '@/components/book-cover';
import { ThemedText } from '@/components/themed-text';
import { Card, EmptyState, SectionHeader } from '@/components/ui-kit';
import { CalendarDotPalette, Radius, Spacing } from '@/constants/theme';
import { useAsyncData } from '@/hooks/use-async-data';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { t } from '@/i18n/zh-TW';
import { getEarliestActivityYear } from '@/repositories/goalRepo';
import {
  getLastLogDateInRange,
  listLogsForDate,
  listLogsInRange,
  monthSummary,
} from '@/repositories/readingLogRepo';
import { formatDisplayDate, formatDisplayMonth, monthRange, todayIso } from '@/utils/date';

LocaleConfig.locales['zh-TW'] = {
  monthNames: [
    '1月', '2月', '3月', '4月', '5月', '6月',
    '7月', '8月', '9月', '10月', '11月', '12月',
  ],
  monthNamesShort: [
    '1月', '2月', '3月', '4月', '5月', '6月',
    '7月', '8月', '9月', '10月', '11月', '12月',
  ],
  dayNames: ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'],
  dayNamesShort: ['日', '一', '二', '三', '四', '五', '六'],
  today: '今天',
};
LocaleConfig.defaultLocale = 'zh-TW';

/**
 * 首頁最下方的月曆區塊：看哪幾天讀了哪些書。
 * `year` 是首頁目標卡片目前選擇的年份——切換年份時自動跳到該年度最後一筆
 * 閱讀紀錄（沒有紀錄就跳到那年 1 月），不影響一般開啟 App 時「今天」的預設。
 */
export function ReadingCalendarSection({ year }: { year: number }) {
  const theme = useTheme();
  const scheme = useColorScheme();
  const dotPalette = CalendarDotPalette[scheme === 'dark' ? 'dark' : 'light'];
  const router = useRouter();
  const today = todayIso();

  const [selectedDate, setSelectedDate] = useState(today);
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  });

  // 第一次掛載維持「今天」的預設，只有之後年份真的被切換才跳過去。
  // 跳去哪個月由這裡決定；跳去該月的哪一天則交給下面「月份變動」的 effect
  // 統一處理（切年份也是先換月份，順著同一條路徑帶出那個月的最後一筆）。
  const isFirstYearChange = useRef(true);
  useEffect(() => {
    if (isFirstYearChange.current) {
      isFirstYearChange.current = false;
      return;
    }
    let cancelled = false;
    (async () => {
      const lastDate = await getLastLogDateInRange(`${year}-01-01`, `${year}-12-31`);
      if (cancelled) return;
      const target = lastDate ?? `${year}-01-01`;
      const [y, m] = target.split('-').map(Number);
      setVisibleMonth({ year: y, month: m });
    })();
    return () => {
      cancelled = true;
    };
  }, [year]);

  const range = useMemo(
    () => monthRange(visibleMonth.year, visibleMonth.month),
    [visibleMonth.year, visibleMonth.month],
  );

  /**
   * 月曆顯示的月份一改變（滑動、箭頭、年份選單皆算），下方清單就自動跳到
   * 該月最後一筆閱讀紀錄（該月沒紀錄就停在 1 號）。跟上面一樣第一次掛載
   * 不觸發，維持打開 App 時停在「今天」的預設；點選某一天不會動到
   * visibleMonth，所以不會被這個 effect 蓋回去。
   */
  const isFirstMonthChange = useRef(true);
  useEffect(() => {
    if (isFirstMonthChange.current) {
      isFirstMonthChange.current = false;
      return;
    }
    let cancelled = false;
    (async () => {
      const lastDate = await getLastLogDateInRange(range.start, range.end);
      if (!cancelled) setSelectedDate(lastDate ?? range.start);
    })();
    return () => {
      cancelled = true;
    };
  }, [range.start, range.end]);

  const logsInMonth = useAsyncData(
    () => listLogsInRange(range.start, range.end),
    [range.start, range.end],
  );
  const summary = useAsyncData(
    () => monthSummary(range.start, range.end),
    [range.start, range.end],
  );
  const dayLogs = useAsyncData(() => listLogsForDate(selectedDate), [selectedDate]);

  const markedDates = useMemo(() => {
    const marks: Record<string, object> = {};
    for (const [date, entry] of Object.entries(logsInMonth.data ?? {})) {
      // 一天讀多本就多一顆點，最多三顆，避免格子被塞爆；每本書固定用同一個顏色，
      // 這樣同一天出現好幾顆點時，能看出是不同的書而不是同一本重複計算。
      marks[date] = {
        dots: entry.bookIds.slice(0, 3).map((bookId) => ({
          key: String(bookId),
          color: dotPalette[Math.abs(bookId) % dotPalette.length],
        })),
      };
    }
    marks[selectedDate] = {
      ...(marks[selectedDate] ?? {}),
      selected: true,
      selectedColor: theme.primary,
      dotColor: theme.onPrimary,
    };
    return marks;
  }, [logsInMonth.data, selectedDate, theme.primary, theme.onPrimary, dotPalette]);

  const logs = dayLogs.data ?? [];

  /**
   * 月曆自己的年份切換：直接點月曆標題（例如「2026年9月」）跳出年份清單，
   * 選了就直接換年、月份不變——不用一個月一個月翻，也不用多長一顆切換按鈕。
   * 跟首頁目標卡片的年份選擇器是兩回事，這裡純粹是瀏覽月曆用，不影響首頁的
   * 年度目標／進度環。
   */
  const [yearPickerOpen, setYearPickerOpen] = useState(false);
  const currentSystemYear = new Date().getFullYear();
  const earliestYear = useAsyncData(getEarliestActivityYear, []);
  const minYear = Math.min(earliestYear.data ?? currentSystemYear, visibleMonth.year);
  const yearOptions = useMemo(() => {
    const years: number[] = [];
    for (let y = currentSystemYear; y >= minYear; y--) years.push(y);
    return years;
  }, [currentSystemYear, minYear]);

  const pickYear = (y: number) => {
    setVisibleMonth((prev) => ({ year: y, month: prev.month }));
    setYearPickerOpen(false);
  };

  return (
    <View style={styles.content}>
      <SectionHeader title={t.tabs.calendar} />

      <Calendar
        key={`${theme.background}-${visibleMonth.year}-${visibleMonth.month}`}
        current={range.start}
        onDayPress={(day) => setSelectedDate(day.dateString)}
        onMonthChange={(month) => setVisibleMonth({ year: month.year, month: month.month })}
        markedDates={markedDates}
        markingType="multi-dot"
        firstDay={0}
        enableSwipeMonths
        renderHeader={() => (
          <Pressable
            onPress={() => setYearPickerOpen(true)}
            accessibilityRole="button"
            style={styles.calendarHeader}>
            <ThemedText type="smallBold">{formatDisplayMonth(visibleMonth.year, visibleMonth.month)}</ThemedText>
            <Ionicons name="chevron-down" size={16} color={theme.textSecondary} />
          </Pressable>
        )}
        theme={{
          calendarBackground: theme.background,
          dayTextColor: theme.text,
          monthTextColor: theme.text,
          textSectionTitleColor: theme.textSecondary,
          todayTextColor: theme.primary,
          selectedDayBackgroundColor: theme.primary,
          selectedDayTextColor: theme.onPrimary,
          arrowColor: theme.primary,
          textDisabledColor: theme.textMuted,
        }}
      />

      <Modal
        visible={yearPickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setYearPickerOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setYearPickerOpen(false)}>
          <Pressable
            style={[styles.yearSheet, { backgroundColor: theme.background }]}
            onPress={(event) => event.stopPropagation()}>
            <FlatList
              data={yearOptions}
              keyExtractor={(y) => String(y)}
              style={styles.yearList}
              renderItem={({ item: y }) => (
                <Pressable
                  onPress={() => pickYear(y)}
                  style={[
                    styles.yearOption,
                    y === visibleMonth.year && { backgroundColor: theme.backgroundSelected },
                  ]}>
                  <ThemedText
                    type={y === visibleMonth.year ? 'smallBold' : 'default'}
                    style={{ color: y === visibleMonth.year ? theme.primary : theme.text }}>
                    {y}
                  </ThemedText>
                </Pressable>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>

      <ThemedText type="small" themeColor="textSecondary" style={styles.summary}>
        {t.calendar.monthSummary(summary.data?.days ?? 0, summary.data?.books ?? 0)}
      </ThemedText>

      <View style={styles.dayHeader}>
        <ThemedText type="smallBold">{t.calendar.dayTitle(formatDisplayDate(selectedDate))}</ThemedText>
      </View>

      {logs.length === 0 ? (
        <EmptyState icon="calendar-outline" title={t.calendar.noRecordsForDay} />
      ) : (
        <View style={styles.dayList}>
          {logs.map((log) => (
            <Pressable
              key={log.id}
              onPress={() => router.push(`/book/${log.bookId}`)}
              accessibilityRole="button">
              <Card style={styles.logCard}>
                <View
                  style={[
                    styles.logDot,
                    { backgroundColor: dotPalette[Math.abs(log.bookId) % dotPalette.length] },
                  ]}
                />
                <BookCover
                  uri={log.bookCoverUri}
                  title={log.bookTitle}
                  width={40}
                  showTitleFallback={false}
                />
                <View style={styles.logBody}>
                  <ThemedText type="smallBold" numberOfLines={2}>
                    {log.bookTitle}
                  </ThemedText>
                  {log.bookAuthors ? (
                    <ThemedText type="small" themeColor="textMuted" numberOfLines={1}>
                      {log.bookAuthors}
                    </ThemedText>
                  ) : null}
                </View>
              </Card>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: Spacing.two },
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    paddingVertical: Spacing.two,
  },
  backdrop: { flex: 1, backgroundColor: '#00000088', justifyContent: 'center', padding: Spacing.three },
  yearSheet: { borderRadius: Radius.lg, maxHeight: '70%', overflow: 'hidden' },
  yearList: { flexGrow: 0 },
  yearOption: { paddingVertical: Spacing.three, paddingHorizontal: Spacing.four, alignItems: 'center' },
  summary: { paddingHorizontal: Spacing.three },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    marginTop: Spacing.two,
  },
  dayList: { paddingHorizontal: Spacing.three, gap: Spacing.two },
  logCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, padding: Spacing.two },
  logDot: { width: 8, height: 8, borderRadius: 4 },
  logBody: { flex: 1, gap: Spacing.half },
});
