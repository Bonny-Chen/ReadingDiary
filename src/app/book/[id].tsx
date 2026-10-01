import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Alert } from '@/utils/alert';
import { BookCover } from '@/components/book-cover';
import { QuotesSection } from '@/components/quotes-section';
import { StarRating, formatRating } from '@/components/star-rating';
import { StatusPicker } from '@/components/status-chip';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, EmptyState, LoadingView } from '@/components/ui-kit';
import { Radius, Spacing } from '@/constants/theme';
import { useAsyncData } from '@/hooks/use-async-data';
import { bumpDataVersion } from '@/hooks/use-data-version';
import { useTheme } from '@/hooks/use-theme';
import { t } from '@/i18n/zh-TW';
import { deleteBook, getBook } from '@/repositories/bookRepo';
import { listCategories } from '@/repositories/categoryRepo';
import { countDaysForBook } from '@/repositories/readingLogRepo';
import { deleteCover } from '@/services/cover';
import { formatDisplayDate } from '@/utils/date';

export default function BookDetailScreen() {
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const bookId = Number(params.id);

  const book = useAsyncData(() => getBook(bookId), [bookId]);
  const readingDays = useAsyncData(() => countDaysForBook(bookId), [bookId]);
  const categories = useAsyncData(listCategories, []);

  const confirmDelete = () => {
    Alert.alert(t.book.deleteConfirmTitle, t.book.deleteConfirmBody, [
      { text: t.common.cancel, style: 'cancel' },
      {
        text: t.common.delete,
        style: 'destructive',
        onPress: async () => {
          deleteCover(book.data?.coverUri);
          await deleteBook(bookId);
          bumpDataVersion();
          router.back();
        },
      },
    ]);
  };

  if (book.loading && !book.data) return <LoadingView />;
  if (!book.data) return <EmptyState icon="alert-circle-outline" title="找不到這本書" />;

  const current = book.data;
  const categoryNames = (categories.data ?? [])
    .filter((category) => current.categoryIds.includes(category.id))
    .map((category) => category.name);

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      // 金句表單在頁面下方，展開輸入框打字時鍵盤會整個蓋住，讓 ScrollView 依鍵盤
      // 高度自動調整內距才捲得上去；做法跟 book/edit.tsx 的表單一致。
      automaticallyAdjustKeyboardInsets>
      <Stack.Screen
        options={{
          title: current.title,
          headerRight: () => (
            <Pressable
              onPress={() => router.push({ pathname: '/book/edit', params: { id: String(bookId) } })}
              accessibilityLabel={t.common.edit}
              hitSlop={8}>
              <Ionicons name="create-outline" size={22} color={theme.primary} />
            </Pressable>
          ),
        }}
      />

      <View style={styles.header}>
        <BookCover uri={current.coverUri} title={current.title} width={110} />
        <View style={styles.headerBody}>
          <ThemedText type="smallBold" style={styles.title}>
            {current.title}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {current.authors ?? t.common.unknown}
          </ThemedText>
          {current.country || current.publishedDate ? (
            <ThemedText type="small" themeColor="textMuted">
              {[current.country, current.publishedDate].filter(Boolean).join(' · ')}
            </ThemedText>
          ) : null}
          {categoryNames.length > 0 ? (
            <View style={styles.tagRow}>
              {categoryNames.map((name) => (
                <View key={name} style={[styles.tag, { backgroundColor: theme.primarySoft }]}>
                  <ThemedText type="small" style={{ color: theme.primary }}>
                    {name}
                  </ThemedText>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      </View>

      <StatusPicker value={current.status} />

      <Card>
        <View style={styles.metaRow}>
          <MetaItem label={t.book.startedAt} value={formatDisplayDate(current.startedAt) || '—'} />
          <MetaItem label={t.book.finishedAt} value={formatDisplayDate(current.finishedAt) || '—'} />
          <MetaItem
            label="閱讀天數"
            value={readingDays.data != null ? `${readingDays.data} 天` : '—'}
          />
        </View>
      </Card>

      <Card>
        <ThemedText type="smallBold" themeColor="textSecondary">
          {t.book.rating}
        </ThemedText>
        <View style={styles.ratingRow}>
          <StarRating value={current.rating} />
          <ThemedText themeColor="textSecondary">{formatRating(current.rating)}</ThemedText>
        </View>
      </Card>

      <Card>
        <ThemedText type="smallBold" themeColor="textSecondary">
          {t.book.description}
        </ThemedText>
        <ThemedText style={styles.paragraph} themeColor={current.description ? 'text' : 'textMuted'}>
          {current.description ?? t.book.noDescription}
        </ThemedText>
      </Card>

      <Card>
        <ThemedText type="smallBold" themeColor="textSecondary">
          {t.book.notes}
        </ThemedText>
        <ThemedText style={styles.paragraph} themeColor={current.notes ? 'text' : 'textMuted'}>
          {current.notes ?? t.book.noNotes}
        </ThemedText>
      </Card>

      <QuotesSection bookId={bookId} />

      <Button
        label={t.common.delete}
        icon="trash-outline"
        variant="danger"
        onPress={confirmDelete}
      />
    </ScrollView>
  );
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaItem}>
      <ThemedText type="small" themeColor="textMuted">
        {label}
      </ThemedText>
      <ThemedText type="smallBold">{value}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six },
  header: { flexDirection: 'row', gap: Spacing.three },
  headerBody: { flex: 1, gap: Spacing.half },
  title: { fontSize: 18, lineHeight: 26 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one, marginTop: Spacing.one },
  tag: { borderRadius: Radius.pill, paddingHorizontal: Spacing.two, paddingVertical: 2 },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between' },
  metaItem: { gap: Spacing.half },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, marginTop: Spacing.two },
  paragraph: { marginTop: Spacing.two },
});
