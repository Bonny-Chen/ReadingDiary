import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { memo, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BookGridItem, BookListItem } from '@/components/book-items';
import { CategoryFilterBar } from '@/components/category-filter-bar';
import { ThemedText } from '@/components/themed-text';
import { EmptyState, FloatingButton, Input, LoadingView } from '@/components/ui-kit';
import { Radius, Spacing } from '@/constants/theme';
import { useAsyncData } from '@/hooks/use-async-data';
import { useTheme } from '@/hooks/use-theme';
import { t } from '@/i18n/zh-TW';
import { listBookYears, listBooks, type BookSort } from '@/repositories/bookRepo';
import { listCategories } from '@/repositories/categoryRepo';
import { READING_STATUSES, type ReadingStatus } from '@/types/models';

const GRID_GAP = Spacing.three;
const GRID_MIN_WIDTH = 104;
const SORT_ORDER: BookSort[] = ['createdDesc', 'titleAsc', 'authorAsc', 'finishedDesc', 'ratingDesc'];

/**
 * 狀態列與年份列共用的單選標籤。用 memo 包住：切換篩選時只有真的變動選中狀態的
 * 那一兩個標籤會重新渲染，不會整排標籤同時重新排版（同一瞬間全部重新量測文字寬度
 * 會有短暫疊字的問題）。setStatus／setYear 本身是 useState 給的穩定參照，不用額外包 useCallback。
 */
function createFilterChip<T>() {
  return memo(function FilterChip({
    value,
    label,
    selected,
    onSelect,
  }: {
    value: T;
    label: string;
    selected: boolean;
    onSelect: (value: T) => void;
  }) {
    const theme = useTheme();

    return (
      <Pressable
        onPress={() => onSelect(value)}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        style={[
          styles.chip,
          {
            backgroundColor: selected ? theme.filterSelected : 'transparent',
            borderColor: selected ? theme.filterSelected : theme.border,
          },
        ]}>
        <ThemedText
          type="small"
          numberOfLines={1}
          style={{ color: selected ? '#FFFFFF' : theme.textSecondary }}>
          {label}
        </ThemedText>
      </Pressable>
    );
  });
}

const StatusChip = createFilterChip<ReadingStatus | null>();
const YearChip = createFilterChip<number | null>();

export default function LibraryScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { width } = useWindowDimensions();

  const [mode, setMode] = useState<'grid' | 'list'>('grid');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<ReadingStatus | null>(null);
  const [categoryIds, setCategoryIds] = useState<number[]>([]);
  const [year, setYear] = useState<number | null>(null);
  const [sort, setSort] = useState<BookSort>('createdDesc');

  const categories = useAsyncData(listCategories, []);
  const years = useAsyncData(listBookYears, []);
  const books = useAsyncData(
    () => listBooks({ status, categoryIds, year: year ?? undefined, search, sort }),
    [status, categoryIds.join(','), year, search, sort],
  );

  const columns = Math.max(2, Math.floor((width - GRID_GAP) / (GRID_MIN_WIDTH + GRID_GAP)));
  const itemWidth = useMemo(
    () => Math.floor((width - GRID_GAP * (columns + 1)) / columns),
    [width, columns],
  );

  const isFiltered =
    Boolean(search.trim()) || status !== null || categoryIds.length > 0 || year !== null;
  const list = books.data ?? [];

  const cycleSort = () => {
    const next = SORT_ORDER[(SORT_ORDER.indexOf(sort) + 1) % SORT_ORDER.length];
    setSort(next);
  };

  return (
    <SafeAreaView edges={['bottom']} style={[styles.screen, { backgroundColor: theme.background }]}>
      <View style={styles.toolbar}>
        <View style={styles.searchWrapper}>
          <Ionicons name="search" size={16} color={theme.textMuted} style={styles.searchIcon} />
          <Input
            value={search}
            onChangeText={setSearch}
            placeholder={t.library.searchPlaceholder}
            style={styles.searchInput}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
        </View>
        <Pressable
          onPress={() => setMode(mode === 'grid' ? 'list' : 'grid')}
          accessibilityRole="button"
          accessibilityLabel={mode === 'grid' ? t.library.listMode : t.library.gridMode}
          style={[styles.iconButton, { backgroundColor: theme.backgroundElement }]}>
          <Ionicons name={mode === 'grid' ? 'list' : 'grid'} size={20} color={theme.text} />
        </Pressable>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.yearScroll}
        contentContainerStyle={styles.yearRow}>
        {[null, ...(years.data ?? [])].map((value) => (
          <YearChip
            key={value ?? 'all'}
            value={value}
            label={value ? t.library.yearLabel(value) : t.common.all}
            selected={year === value}
            onSelect={setYear}
          />
        ))}
      </ScrollView>

      <View style={styles.statusRow}>
        {[null, ...READING_STATUSES].map((value) => (
          <StatusChip
            key={value ?? 'all'}
            value={value}
            label={value ? t.status[value] : t.common.all}
            selected={status === value}
            onSelect={setStatus}
          />
        ))}
      </View>

      <CategoryFilterBar
        categories={categories.data ?? []}
        selectedIds={categoryIds}
        onChange={setCategoryIds}
      />

      <View style={styles.metaRow}>
        <ThemedText type="small" themeColor="textMuted">
          {t.library.countLabel(list.length)}
        </ThemedText>
        <Pressable onPress={cycleSort} accessibilityRole="button" style={styles.sortButton}>
          <Ionicons name="swap-vertical" size={14} color={theme.primary} />
          <ThemedText type="small" style={{ color: theme.primary }}>
            {t.library.sort[sort]}
          </ThemedText>
        </Pressable>
      </View>

      {books.loading && list.length === 0 ? (
        <LoadingView />
      ) : list.length === 0 ? (
        <EmptyState
          title={isFiltered ? t.library.emptyFiltered : t.library.empty}
          body={isFiltered ? undefined : t.library.emptyHint}
        />
      ) : mode === 'grid' ? (
        <FlatList
          key={`grid-${columns}`}
          data={list}
          keyExtractor={(item) => String(item.id)}
          numColumns={columns}
          columnWrapperStyle={{ gap: GRID_GAP }}
          contentContainerStyle={styles.gridContent}
          renderItem={({ item }) => (
            <BookGridItem
              book={item}
              width={itemWidth}
              onPress={() => router.push(`/book/${item.id}`)}
            />
          )}
        />
      ) : (
        <FlatList
          key="list"
          data={list}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <BookListItem book={item} onPress={() => router.push(`/book/${item.id}`)} />
          )}
        />
      )}

      <FloatingButton icon="add" label={t.common.add} onPress={() => router.push('/scan')} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  toolbar: {
    flexDirection: 'row',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
  },
  searchWrapper: { flex: 1, justifyContent: 'center' },
  searchIcon: { position: 'absolute', left: Spacing.three, zIndex: 1 },
  searchInput: { paddingLeft: Spacing.five + 2 },
  iconButton: {
    width: 46,
    height: 46,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two + 2,
  },
  // 年份列跟類別列一樣是橫向 ScrollView，flexGrow/flexShrink 歸零的理由見 category-filter-bar.tsx
  yearScroll: { flexGrow: 0, flexShrink: 0 },
  yearRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two + 2,
  },
  chip: {
    flexShrink: 0,
    borderWidth: 1,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one + 1,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.two,
  },
  sortButton: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  gridContent: { padding: GRID_GAP, gap: GRID_GAP, paddingBottom: Spacing.six + Spacing.four },
  listContent: {
    paddingHorizontal: Spacing.three,
    gap: Spacing.two,
    paddingBottom: Spacing.six + Spacing.four,
  },
});
