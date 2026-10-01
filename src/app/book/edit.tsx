import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Alert } from '@/utils/alert';
import { CategoryPicker } from '@/components/category-picker';
import { CoverPicker } from '@/components/cover-picker';
import { DateField } from '@/components/date-field';
import { QuotesSection } from '@/components/quotes-section';
import { StarRating, formatRating } from '@/components/star-rating';
import { StatusPicker } from '@/components/status-chip';
import { ThemedText } from '@/components/themed-text';
import { TitleResultsModal } from '@/components/title-results-modal';
import { Field, IconButton, Input, LoadingView } from '@/components/ui-kit';
import { Radius, Spacing } from '@/constants/theme';
import { useAsyncData } from '@/hooks/use-async-data';
import { useTheme } from '@/hooks/use-theme';
import { bumpDataVersion } from '@/hooks/use-data-version';
import { t } from '@/i18n/zh-TW';
import { createBook, findByIsbn, getBook, updateBook } from '@/repositories/bookRepo';
import { listCategories } from '@/repositories/categoryRepo';
import { deleteCover, saveCoverFromUrl } from '@/services/cover';
import { expandIsbn } from '@/services/isbn';
import { searchByTitle } from '@/services/metadata';
import { takePendingBook } from '@/state/pending-book';
import type { BookInput, BookMetadata, MetadataSource, ReadingStatus } from '@/types/models';
import { todayIso } from '@/utils/date';

interface FormState {
  isbn: string;
  title: string;
  authors: string;
  country: string;
  publishedDate: string;
  description: string;
  coverUri: string | null;
  coverIsCustom: boolean;
  status: ReadingStatus;
  startedAt: string | null;
  finishedAt: string | null;
  rating: number | null;
  notes: string;
  metadataSource: MetadataSource | null;
}

const EMPTY_FORM: FormState = {
  isbn: '',
  title: '',
  authors: '',
  country: '',
  publishedDate: '',
  description: '',
  coverUri: null,
  coverIsCustom: false,
  status: 'unread',
  startedAt: null,
  finishedAt: null,
  rating: null,
  notes: '',
  metadataSource: 'manual',
};

export default function BookEditScreen() {
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const bookId = params.id ? Number(params.id) : null;

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [categoryIds, setCategoryIds] = useState<number[]>([]);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  /** 尚未下載的遠端封面，儲存時才落地，避免使用者取消也留下檔案 */
  const [pendingCoverUrl, setPendingCoverUrl] = useState<string | null>(null);
  /** 書名旁的查詢按鈕：查詢中的讀取狀態，以及同名多筆時讓使用者挑選的候選清單 */
  const [titleSearching, setTitleSearching] = useState(false);
  const [titleSearchResults, setTitleSearchResults] = useState<BookMetadata[] | null>(null);

  const categories = useAsyncData(listCategories, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (bookId) {
        const book = await getBook(bookId);
        if (cancelled || !book) return;
        setForm({
          isbn: book.isbn13 ?? book.isbn10 ?? '',
          title: book.title,
          authors: book.authors ?? '',
          country: book.country ?? '',
          publishedDate: book.publishedDate ?? '',
          description: book.description ?? '',
          coverUri: book.coverUri,
          coverIsCustom: book.coverIsCustom,
          status: book.status,
          startedAt: book.startedAt,
          finishedAt: book.finishedAt,
          rating: book.rating,
          notes: book.notes ?? '',
          metadataSource: book.metadataSource,
        });
        setCategoryIds(book.categoryIds);
      } else {
        // 由掃描／查詢流程帶進來的資料（可能為 null，代表純手動新增）
        const pending = takePendingBook();
        if (cancelled) return;
        if (pending) {
          setForm({
            ...EMPTY_FORM,
            isbn: pending.isbn13 ?? pending.isbn10 ?? '',
            title: pending.title,
            authors: pending.authors ?? '',
            publishedDate: pending.publishedDate ?? '',
            description: pending.description ?? '',
            metadataSource: pending.source,
          });
          setPendingCoverUrl(pending.coverUrl);
        }
      }
      if (!cancelled) setReady(true);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [bookId]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  /**
   * 選完開始或完成日期就立刻檢查兩者順序，不必等到按儲存才發現選錯。
   * 選出不合理的組合時跳警告並直接擋下這次選擇，維持表單一直是合法狀態。
   */
  const changeStartedAt = (value: string | null) => {
    // 完成日期還跟開始日期同一天，代表使用者還沒特別改過完成日期（例如標記已讀時
    // 兩個日期一起被自動帶成今天）——這種情況下改開始日期，完成日期跟著一起換，
    // 不用使用者自己先清空完成日期才會重新對齊。完成日期已經被改成別的日子就不再連動。
    const linked = form.finishedAt === form.startedAt;
    if (!linked && value && form.finishedAt && value > form.finishedAt) {
      Alert.alert(t.book.finishedBeforeStarted);
      return;
    }
    setForm((prev) => ({
      ...prev,
      startedAt: value,
      finishedAt: linked ? value : prev.finishedAt,
    }));
  };

  const changeFinishedAt = (value: string | null) => {
    if (value && form.startedAt && value < form.startedAt) {
      Alert.alert(t.book.finishedBeforeStarted);
      return;
    }
    set('finishedAt', value);
  };

  /** 狀態切換時順手補日期，讓「標記已讀」不必再手動選日期 */
  const changeStatus = (status: ReadingStatus) => {
    setForm((prev) => {
      const today = todayIso();
      if (status === 'unread') return { ...prev, status, startedAt: null, finishedAt: null };
      if (status === 'reading') return { ...prev, status, startedAt: prev.startedAt ?? today };
      return {
        ...prev,
        status,
        startedAt: prev.startedAt ?? today,
        finishedAt: prev.finishedAt ?? today,
      };
    });
  };

  const isbnParts = useMemo(() => expandIsbn(form.isbn), [form.isbn]);

  /**
   * 套用查到的書目資料：已有 ISBN 且書庫已存在同一本書時（排除正在編輯的這本自己），
   * 提醒使用者改去看那本書，避免建出兩筆重複資料。
   * 封面只有在使用者自己手動選過（coverIsCustom）才不覆蓋——不然重新查詢換成別本書時，
   * 書名作者都換了，封面卻還留著上一次查到的那本，對不起來。
   */
  const applyTitleMetadata = async (metadata: BookMetadata) => {
    if (metadata.isbn13) {
      const existing = await findByIsbn(metadata.isbn13);
      if (existing && existing.id !== bookId) {
        Alert.alert(t.scan.duplicateTitle, t.scan.duplicateBody(existing.title), [
          { text: t.common.cancel, style: 'cancel' },
          { text: t.scan.viewBook, onPress: () => router.replace(`/book/${existing.id}`) },
        ]);
        return;
      }
    }

    const replaceCover = !form.coverIsCustom;
    if (replaceCover) deleteCover(form.coverUri);

    setForm((prev) => ({
      ...prev,
      isbn: metadata.isbn13 ?? metadata.isbn10 ?? prev.isbn,
      title: metadata.title || prev.title,
      authors: metadata.authors ?? prev.authors,
      publishedDate: metadata.publishedDate ?? prev.publishedDate,
      description: metadata.description ?? prev.description,
      metadataSource: metadata.source,
      coverUri: replaceCover ? null : prev.coverUri,
    }));
    if (replaceCover) {
      setPendingCoverUrl(metadata.coverUrl);
    }
  };

  /** 書名旁的查詢按鈕：用目前打的書名查書目，只有一筆就直接帶入，多筆才讓使用者挑。 */
  const searchByTypedTitle = async () => {
    const query = form.title.trim();
    if (!query) {
      Alert.alert(t.book.titleRequired);
      return;
    }
    setTitleSearching(true);
    try {
      const results = await searchByTitle(query);
      if (results.length === 0) {
        Alert.alert(t.book.titleSearchNoMatch);
        return;
      }
      if (results.length === 1) {
        await applyTitleMetadata(results[0]);
        return;
      }
      setTitleSearchResults(results);
    } finally {
      setTitleSearching(false);
    }
  };

  const save = async () => {
    const title = form.title.trim();
    if (!title) {
      Alert.alert(t.book.titleRequired);
      return;
    }
    if (form.status === 'read' && (!form.startedAt || !form.finishedAt)) {
      Alert.alert(t.book.readDatesRequired);
      return;
    }
    if (form.status === 'read' && !form.rating) {
      Alert.alert(t.book.readRatingRequired);
      return;
    }
    if (form.startedAt && form.finishedAt && form.startedAt > form.finishedAt) {
      Alert.alert(t.book.finishedBeforeStarted);
      return;
    }

    setSaving(true);
    try {
      let coverUri = form.coverUri;
      let coverIsCustom = form.coverIsCustom;

      // 網路封面在此時才下載落地，確保之後離線也看得到
      if (!coverUri && pendingCoverUrl) {
        coverUri = await saveCoverFromUrl(pendingCoverUrl, isbnParts.isbn13 ?? 'cover');
        coverIsCustom = false;
      }

      const input: BookInput = {
        isbn13: isbnParts.isbn13,
        isbn10: isbnParts.isbn10,
        title,
        authors: form.authors.trim() || null,
        country: form.country.trim() || null,
        publishedDate: form.publishedDate.trim() || null,
        description: form.description.trim() || null,
        coverUri,
        coverIsCustom,
        status: form.status,
        startedAt: form.startedAt,
        finishedAt: form.status === 'read' ? form.finishedAt : null,
        rating: form.rating,
        notes: form.notes.trim() || null,
        metadataSource: form.metadataSource,
      };

      if (bookId) {
        await updateBook(bookId, input, categoryIds);
        bumpDataVersion();
        router.back();
      } else {
        const newId = await createBook(input, categoryIds);
        bumpDataVersion();
        router.replace(`/book/${newId}`);
      }
    } catch (error) {
      console.error(error);
      Alert.alert(t.errors.saveFailed);
    } finally {
      setSaving(false);
    }
  };

  if (!ready) return <LoadingView />;

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <Stack.Screen
        options={{
          title: bookId ? t.book.editTitle : t.book.newTitle,
          headerRight: () =>
            saving ? (
              <ActivityIndicator color={theme.primary} />
            ) : (
              <Pressable onPress={save} accessibilityRole="button" hitSlop={8}>
                <ThemedText type="smallBold" style={{ color: theme.primary }}>
                  {t.common.save}
                </ThemedText>
              </Pressable>
            ),
        }}
      />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        // 取代 KeyboardAvoidingView：讓 ScrollView 自己依鍵盤高度調整內距，
        // 才不會像先前 KeyboardAvoidingView + ScrollView 疊加出一大片多餘空白，
        // 同時保留「捲到最後一個欄位時鍵盤不會整個蓋住」的空間。
        automaticallyAdjustKeyboardInsets>
        <CoverPicker
          coverUri={form.coverUri ?? pendingCoverUrl}
          title={form.title || t.book.newTitle}
          prefix={isbnParts.isbn13 ?? String(bookId ?? 'book')}
          onChange={(uri, isCustom) => {
            setForm((prev) => ({ ...prev, coverUri: uri, coverIsCustom: isCustom }));
            // 選了自訂封面或按下移除，都不再沿用查詢帶回來的網路封面
            setPendingCoverUrl(null);
          }}
        />
        {!form.coverUri && pendingCoverUrl ? (
          <ThemedText type="small" themeColor="textMuted">
            儲存時會自動下載網路封面
          </ThemedText>
        ) : null}

        <Field label={`${t.book.bookTitle} *`}>
          <View style={styles.titleRow}>
            <View style={styles.flex}>
              <Input value={form.title} onChangeText={(v) => set('title', v)} />
            </View>
            <IconButton
              icon="book-search-outline"
              onPress={searchByTypedTitle}
              loading={titleSearching}
              accessibilityLabel={t.book.titleSearchAction}
            />
          </View>
        </Field>

        <Field label={t.book.authors} hint={t.book.authorsHint}>
          <Input value={form.authors} onChangeText={(v) => set('authors', v)} />
        </Field>

        <Field label={t.book.country}>
          <View style={styles.countryPresets}>
            {t.book.countryPresets.map((preset) => {
              const selected = form.country.trim() === preset;
              return (
                <Pressable
                  key={preset}
                  onPress={() => set('country', preset)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  style={[
                    styles.countryChip,
                    {
                      backgroundColor: selected ? theme.filterSelected : 'transparent',
                      borderColor: selected ? theme.filterSelected : theme.border,
                    },
                  ]}>
                  <ThemedText type="small" style={{ color: selected ? '#FFFFFF' : theme.textSecondary }}>
                    {preset}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>
          <Input value={form.country} onChangeText={(v) => set('country', v)} />
        </Field>

        <Field label={t.book.publishedDate}>
          <Input
            value={form.publishedDate}
            onChangeText={(v) => set('publishedDate', v)}
            placeholder="2026-01"
          />
        </Field>

        <Field
          label={t.book.isbn}
          hint={form.isbn && !isbnParts.isbn13 ? t.scan.invalidIsbn : undefined}>
          <Input
            value={form.isbn}
            onChangeText={(v) => set('isbn', v)}
            keyboardType="numbers-and-punctuation"
            autoCapitalize="characters"
          />
        </Field>

        <Field label={t.book.categories}>
          <CategoryPicker
            categories={categories.data ?? []}
            selectedIds={categoryIds}
            onChange={setCategoryIds}
          />
        </Field>

        <Field label={t.book.status}>
          <StatusPicker value={form.status} onChange={changeStatus} />
        </Field>

        <Field label={t.book.startedAt}>
          <DateField value={form.startedAt} onChange={changeStartedAt} />
        </Field>

        {form.status === 'read' ? (
          <Field label={t.book.finishedAt}>
            <DateField value={form.finishedAt} onChange={changeFinishedAt} />
          </Field>
        ) : null}

        <Field label={t.book.rating}>
          <View style={styles.ratingRow}>
            <StarRating value={form.rating} onChange={(v) => set('rating', v)} />
            <ThemedText themeColor="textSecondary">{formatRating(form.rating)}</ThemedText>
          </View>
        </Field>

        <Field label={t.book.description}>
          <Input value={form.description} onChangeText={(v) => set('description', v)} multiline />
        </Field>

        <Field label={t.book.notes}>
          <Input
            value={form.notes}
            onChangeText={(v) => set('notes', v)}
            multiline
            placeholder={t.book.notesPlaceholder}
          />
        </Field>

        {/* 新增書籍時還沒存進資料庫、沒有 bookId 可以掛金句，只有編輯已存在的書才顯示 */}
        {bookId ? <QuotesSection bookId={bookId} /> : null}
      </ScrollView>

      <TitleResultsModal
        visible={titleSearchResults !== null}
        results={titleSearchResults ?? []}
        manualLabel={t.book.titleSearchKeepCurrent}
        onSelect={(metadata) => {
          setTitleSearchResults(null);
          applyTitleMetadata(metadata);
        }}
        onManual={() => setTitleSearchResults(null)}
        onClose={() => setTitleSearchResults(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  flex: { flex: 1 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  countryPresets: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  // 尺寸與類別標籤（category-picker.tsx）刻意保持一致，同一張表單裡不要有兩種高度
  countryChip: {
    borderRadius: Radius.pill,
    borderWidth: 1,
    paddingHorizontal: Spacing.three - 2,
    paddingVertical: Spacing.two,
  },
});
