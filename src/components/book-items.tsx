import { Pressable, StyleSheet, View } from 'react-native';

import { BookCover } from '@/components/book-cover';
import { StarRating, formatRating } from '@/components/star-rating';
import { StatusChip, statusColor } from '@/components/status-chip';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { t } from '@/i18n/zh-TW';
import type { Book } from '@/types/models';
import { formatDisplayDate } from '@/utils/date';

/** 排行榜名次徽章：金牌、銀牌、銅牌 emoji；超出範圍就直接顯示數字。 */
const MEDAL_EMOJI = ['🥇', '🥈', '🥉'];

/**
 * 封面牆的一格：封面為主，底下用小字補書名與狀態點。
 * rank 會在封面左上角加名次徽章，showRating 在書名下方顯示星等（排行榜用）。
 */
export function BookGridItem({
  book,
  width,
  onPress,
  rank,
  showRating = false,
}: {
  book: Book;
  width: number;
  onPress: () => void;
  rank?: number;
  showRating?: boolean;
}) {
  const theme = useTheme();
  const ratingLabel = formatRating(book.rating);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={rank != null ? `第 ${rank} 名 ${book.title}` : book.title}
      style={({ pressed }) => [{ width, opacity: pressed ? 0.75 : 1 }, styles.gridItem]}>
      <View>
        <BookCover uri={book.coverUri} title={book.title} width={width} />
        {rank != null && (
          <ThemedText style={styles.rankBadge}>{MEDAL_EMOJI[rank - 1] ?? String(rank)}</ThemedText>
        )}
      </View>
      <View style={styles.gridMeta}>
        <View style={[styles.statusDot, { backgroundColor: statusColor(book.status, theme) }]} />
        <ThemedText type="smallBold" numberOfLines={1} style={styles.gridTitle}>
          {book.title}
        </ThemedText>
      </View>
      {showRating && book.rating != null ? (
        <View style={styles.ratingRow}>
          <StarRating value={book.rating} size={12} />
          <ThemedText type="small" themeColor="textMuted">
            {ratingLabel}
          </ThemedText>
        </View>
      ) : book.authors ? (
        <ThemedText type="small" themeColor="textMuted" numberOfLines={1}>
          {book.authors}
        </ThemedText>
      ) : null}
    </Pressable>
  );
}

/** 列表模式的一列：資訊密度高，含評分與日期。 */
export function BookListItem({ book, onPress }: { book: Book; onPress: () => void }) {
  const theme = useTheme();

  const dateLabel =
    book.status === 'read' && book.finishedAt
      ? `${formatDisplayDate(book.finishedAt)} 讀完`
      : book.startedAt
        ? `${formatDisplayDate(book.startedAt)} 開始`
        : '';

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.listItem,
        { backgroundColor: theme.card, borderColor: theme.border, opacity: pressed ? 0.8 : 1 },
      ]}>
      <BookCover uri={book.coverUri} title={book.title} width={52} showTitleFallback={false} />
      <View style={styles.listBody}>
        <ThemedText type="smallBold" numberOfLines={2}>
          {book.title}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {book.authors ?? t.common.unknown}
        </ThemedText>
        <View style={styles.listFooter}>
          <StatusChip status={book.status} small />
          {book.rating != null && (
            <View style={styles.ratingRow}>
              <StarRating value={book.rating} size={12} />
              <ThemedText type="small" themeColor="textMuted">
                {formatRating(book.rating)}
              </ThemedText>
            </View>
          )}
          {dateLabel ? (
            <ThemedText type="small" themeColor="textMuted">
              {dateLabel}
            </ThemedText>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  gridItem: { gap: Spacing.one },
  gridMeta: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one + 2, marginTop: Spacing.one },
  statusDot: { width: 7, height: 7, borderRadius: Radius.pill },
  gridTitle: { flex: 1 },
  rankBadge: { position: 'absolute', top: -Spacing.one, left: -Spacing.one, fontSize: 28, lineHeight: 34 },
  listItem: {
    flexDirection: 'row',
    gap: Spacing.three,
    padding: Spacing.two + 2,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  listBody: { flex: 1, gap: Spacing.half, justifyContent: 'center' },
  listFooter: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flexWrap: 'wrap', marginTop: Spacing.half },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
});
