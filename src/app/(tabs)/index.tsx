import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { Alert } from '@/utils/alert';
import { BookGridItem, BookListItem } from '@/components/book-items';
import { GoalProgressRing } from '@/components/goal-progress-ring';
import { QuoteMarquee } from '@/components/quote-marquee';
import { ReadingCalendarSection } from '@/components/reading-calendar';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, EmptyState, Field, Input, SectionHeader } from '@/components/ui-kit';
import { YearSwitcher } from '@/components/year-switcher';
import { Radius, Spacing } from '@/constants/theme';
import { useAsyncData } from '@/hooks/use-async-data';
import { bumpDataVersion } from '@/hooks/use-data-version';
import { useTheme } from '@/hooks/use-theme';
import { t } from '@/i18n/zh-TW';
import { countFinishedInYear, countsByStatus, listBooks, listTopRatedInYear } from '@/repositories/bookRepo';
import { getEarliestActivityYear, getGoal, setGoal } from '@/repositories/goalRepo';
import { getRandomQuote } from '@/repositories/quoteRepo';
import type { ReadingStatus } from '@/types/models';

const SHELF_ITEM_WIDTH = 92;

export default function HomeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const currentYear = new Date().getFullYear();

  const [goalModalOpen, setGoalModalOpen] = useState(false);
  const [goalDraft, setGoalDraft] = useState('');
  const [previewStatus, setPreviewStatus] = useState<ReadingStatus | null>(null);
  const [year, setYear] = useState(currentYear);
  const isCurrentYear = year === currentYear;

  const earliestYear = useAsyncData(getEarliestActivityYear, []);
  const minYear = earliestYear.data ?? currentYear;

  const goal = useAsyncData(() => getGoal(year), [year]);
  const finishedCount = useAsyncData(() => countFinishedInYear(year), [year]);
  const statusCounts = useAsyncData(() => countsByStatus(year), [year]);
  // 不限年度，每次進首頁或資料異動就重抽一句
  const randomQuote = useAsyncData(getRandomQuote, []);
  const reading = useAsyncData(
    () => listBooks({ status: 'reading', sort: 'createdDesc', limit: 12 }),
    [],
  );
  const topRated = useAsyncData(() => listTopRatedInYear(year, 3), [year]);

  /**
   * 狀態預覽的清單。帶同一個 year，點開的書本數才會跟卡片上的數字對得起來。
   */
  const previewBooks = useAsyncData(
    () =>
      previewStatus
        ? listBooks({ status: previewStatus, year, sort: 'titleAsc' })
        : Promise.resolve([]),
    [previewStatus, year],
  );

  const openBookFromPreview = (id: number) => {
    setPreviewStatus(null);
    router.push(`/book/${id}`);
  };

  const target = goal.data?.targetCount ?? 0;
  const done = finishedCount.data ?? 0;
  const achieved = target > 0 && done >= target;

  const openGoalModal = () => {
    setGoalDraft(target > 0 ? String(target) : '');
    setGoalModalOpen(true);
  };

  const saveGoal = async () => {
    const value = Number.parseInt(goalDraft, 10);
    if (!Number.isFinite(value) || value <= 0) {
      Alert.alert(t.settings.goalRequired);
      return;
    }
    await setGoal(year, value);
    setGoalModalOpen(false);
    bumpDataVersion();
  };

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.content}>
      <Card style={styles.goalCard}>
        <YearSwitcher year={year} minYear={minYear} maxYear={currentYear} onChange={setYear} />

        <Pressable
          onPress={() => router.push({ pathname: '/stats', params: { year: String(year) } })}
          accessibilityRole="button"
          accessibilityLabel={t.home.openStats}
          hitSlop={8}
          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
          <GoalProgressRing done={done} target={target} />
        </Pressable>

        {target > 0 ? (
          <View style={styles.achievedRow}>
            <ThemedText
              type="smallBold"
              style={{ color: achieved ? theme.success : theme.textSecondary }}>
              {achieved
                ? t.home.goalAchieved
                : isCurrentYear
                  ? t.home.goalRemaining(target - done)
                  : t.home.goalNotAchieved(target - done)}
            </ThemedText>
            {achieved && (
              <Image
                source={require('@/assets/images/goal-cat.png')}
                style={styles.achievedCat}
                contentFit="contain"
              />
            )}
          </View>
        ) : (
          <ThemedText type="small" themeColor="textMuted">
            {t.home.noGoal}
          </ThemedText>
        )}

        <Pressable onPress={openGoalModal} accessibilityRole="button" hitSlop={8}>
          <ThemedText type="small" style={{ color: theme.primary }}>
            {target > 0 ? t.common.edit : t.home.setGoal}
          </ThemedText>
        </Pressable>
      </Card>

      {randomQuote.data && (
        <QuoteMarquee
          text={t.home.quoteTicker(randomQuote.data.text, randomQuote.data.bookTitle)}
          onPress={() => router.push(`/book/${randomQuote.data!.bookId}`)}
        />
      )}

      <View style={styles.statsRow}>
        <StatCard
          label={t.home.statUnread}
          value={statusCounts.data?.unread ?? 0}
          color={theme.unread}
          onPress={() => setPreviewStatus('unread')}
        />
        <StatCard
          label={t.home.statReading}
          value={statusCounts.data?.reading ?? 0}
          color={theme.reading}
          onPress={() => setPreviewStatus('reading')}
        />
        <StatCard
          label={t.home.statRead}
          value={statusCounts.data?.read ?? 0}
          color={theme.read}
          onPress={() => setPreviewStatus('read')}
        />
      </View>

      <View style={styles.section}>
        <SectionHeader title={t.home.currentlyReading} />
        {(reading.data ?? []).length === 0 ? (
          <EmptyState icon="bookmark-outline" title={t.home.emptyReading} />
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.shelf}>
            {(reading.data ?? []).map((book) => (
              <BookGridItem
                key={book.id}
                book={book}
                width={SHELF_ITEM_WIDTH}
                onPress={() => router.push(`/book/${book.id}`)}
              />
            ))}
          </ScrollView>
        )}
      </View>

      <View style={styles.section}>
        <SectionHeader title={t.home.topRated} />
        {(topRated.data ?? []).length === 0 ? (
          <EmptyState icon="star-outline" title={t.home.emptyTopRated} />
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.shelf}>
            {(topRated.data ?? []).map((book, index) => (
              <BookGridItem
                key={book.id}
                book={book}
                width={SHELF_ITEM_WIDTH}
                rank={index + 1}
                showRating
                onPress={() => router.push(`/book/${book.id}`)}
              />
            ))}
          </ScrollView>
        )}
      </View>

      <ReadingCalendarSection year={year} />

      <Modal
        visible={previewStatus !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewStatus(null)}>
        <Pressable style={styles.backdrop} onPress={() => setPreviewStatus(null)}>
          <Pressable
            style={[styles.sheet, styles.previewSheet, { backgroundColor: theme.background }]}
            onPress={(event) => event.stopPropagation()}>
            <View style={styles.previewHeader}>
              <ThemedText type="smallBold">
                {previewStatus ? t.status[previewStatus] : ''}
              </ThemedText>
              <Pressable
                onPress={() => setPreviewStatus(null)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={t.common.close}
                style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
                <Ionicons name="close" size={22} color={theme.textSecondary} />
              </Pressable>
            </View>
            {(previewBooks.data ?? []).length === 0 ? (
              <EmptyState title={t.home.statEmpty} />
            ) : (
              <FlatList
                data={previewBooks.data ?? []}
                keyExtractor={(item) => String(item.id)}
                contentContainerStyle={styles.previewList}
                renderItem={({ item }) => (
                  <BookListItem book={item} onPress={() => openBookFromPreview(item.id)} />
                )}
              />
            )}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={goalModalOpen} transparent animationType="fade" onRequestClose={() => setGoalModalOpen(false)}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={styles.backdrop} onPress={() => setGoalModalOpen(false)}>
            <Pressable
              style={[styles.sheet, { backgroundColor: theme.background }]}
              onPress={(event) => event.stopPropagation()}>
              <ScrollView
                style={styles.sheetScroll}
                keyboardShouldPersistTaps="always"
                contentContainerStyle={styles.sheetScrollContent}>
                <ThemedText type="smallBold">{t.settings.goalYear(year)}</ThemedText>
                <Field label={t.settings.goalCount}>
                  <Input
                    value={goalDraft}
                    onChangeText={(v) => setGoalDraft(v.replace(/[^0-9]/g, ''))}
                    keyboardType="number-pad"
                    autoFocus
                    onSubmitEditing={saveGoal}
                    returnKeyType="done"
                    returnKeyLabel={t.common.save}
                  />
                </Field>
                <View style={styles.sheetActions}>
                  <Button
                    label={t.common.cancel}
                    variant="secondary"
                    onPress={() => setGoalModalOpen(false)}
                    style={styles.flex}
                  />
                  <Button
                    label={t.common.save}
                    onPress={saveGoal}
                    style={styles.flex}
                    triggerOnPressIn
                  />
                </View>
              </ScrollView>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </ScrollView>
  );
}

function StatCard({
  label,
  value,
  color,
  onPress,
}: {
  label: string;
  value: number;
  color: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label} ${value} ${t.common.book}`}
      style={({ pressed }) => [styles.statCardPressable, { opacity: pressed ? 0.6 : 1 }]}>
      <Card style={styles.statCard}>
        <ThemedText style={[styles.statValue, { color }]}>{value}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {label}
        </ThemedText>
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { paddingVertical: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.five },
  goalCard: { alignItems: 'center', gap: Spacing.two, marginHorizontal: Spacing.three },
  achievedRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  // 圖比文字高一點才夠可愛，讓貓咪臉稍微蓋過文字的行高，靠 marginVertical 負值微調不撐開版面
  achievedCat: { width: 60, height: 32, marginVertical: -4 },
  statsRow: { flexDirection: 'row', gap: Spacing.two, paddingHorizontal: Spacing.three },
  // Pressable 負責分配寬度，Card 在裡面撐滿，才不會因為多包一層而變形
  statCardPressable: { flex: 1 },
  statCard: { flex: 1, alignItems: 'center', gap: Spacing.half },
  statValue: { fontSize: 26, lineHeight: 32, fontWeight: '700' },
  section: { gap: Spacing.one },
  shelf: { paddingHorizontal: Spacing.three, gap: Spacing.three },
  backdrop: { flex: 1, backgroundColor: '#00000088', justifyContent: 'center', padding: Spacing.three },
  sheet: { borderRadius: Radius.lg, overflow: 'hidden' },
  // ScrollView 只是為了拿到 keyboardShouldPersistTaps，內容不需要真的捲動，flexGrow 歸零避免撐開
  sheetScroll: { flexGrow: 0 },
  sheetScrollContent: { padding: Spacing.four, gap: Spacing.three },
  sheetActions: { flexDirection: 'row', gap: Spacing.two },
  // 書多的時候讓格狀清單自己捲動，彈窗不要長到滿版
  previewSheet: { maxHeight: '80%', padding: Spacing.three },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: Spacing.three,
  },
  previewList: { gap: Spacing.two },
  flex: { flex: 1 },
});
