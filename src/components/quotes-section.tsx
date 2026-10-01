import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Alert } from '@/utils/alert';
import { SwipeableQuoteRow } from '@/components/swipeable-quote-row';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Input } from '@/components/ui-kit';
import { Spacing } from '@/constants/theme';
import { useAsyncData } from '@/hooks/use-async-data';
import { bumpDataVersion } from '@/hooks/use-data-version';
import { useTheme } from '@/hooks/use-theme';
import { t } from '@/i18n/zh-TW';
import { addQuote, deleteQuote, listQuotes, updateQuote } from '@/repositories/quoteRepo';

/**
 * 金句新增／編輯／刪除，書籍詳情頁與編輯頁（僅限編輯已存在的書）共用。
 * 只吃 bookId，代表這本書已經在資料庫裡——新增書籍尚未存檔時沒有 bookId，不會用到這個元件。
 */
export function QuotesSection({ bookId }: { bookId: number }) {
  const theme = useTheme();
  const quotes = useAsyncData(() => listQuotes(bookId), [bookId]);

  const [quoteText, setQuoteText] = useState('');
  // null = 表單關閉；'new' = 新增；數字 = 正在編輯該筆金句的 id
  const [editingQuoteId, setEditingQuoteId] = useState<number | 'new' | null>(null);

  const openAddQuote = () => {
    setQuoteText('');
    setEditingQuoteId('new');
  };

  const openEditQuote = (id: number, text: string) => {
    setQuoteText(text);
    setEditingQuoteId(id);
  };

  const closeQuoteForm = () => {
    setQuoteText('');
    setEditingQuoteId(null);
  };

  const submitQuote = async () => {
    const text = quoteText.trim();
    if (!text) return;
    if (editingQuoteId === 'new') {
      await addQuote(bookId, text);
    } else if (editingQuoteId != null) {
      await updateQuote(editingQuoteId, text);
    }
    closeQuoteForm();
    // 除了這裡的金句清單，首頁跑馬燈、統計頁與自動備份也都要知道資料變了
    bumpDataVersion();
  };

  const removeQuote = (id: number) => {
    Alert.alert(t.common.delete, undefined, [
      { text: t.common.cancel, style: 'cancel' },
      {
        text: t.common.delete,
        style: 'destructive',
        onPress: async () => {
          if (editingQuoteId === id) closeQuoteForm();
          await deleteQuote(id);
          bumpDataVersion();
        },
      },
    ]);
  };

  return (
    <Card>
      <View style={styles.quotesHeader}>
        <ThemedText type="smallBold" themeColor="textSecondary">
          {t.book.quotes}
        </ThemedText>
        <Pressable
          onPress={() => (editingQuoteId === null ? openAddQuote() : closeQuoteForm())}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={editingQuoteId === null ? t.book.addQuote : t.common.cancel}>
          <Ionicons name={editingQuoteId === null ? 'add' : 'close'} size={20} color={theme.primary} />
        </Pressable>
      </View>

      {editingQuoteId !== null ? (
        <View style={styles.quoteForm}>
          <Input
            value={quoteText}
            onChangeText={setQuoteText}
            multiline
            placeholder={t.book.quotePlaceholder}
            autoFocus
          />
          <Button
            label={editingQuoteId === 'new' ? t.common.add : t.common.save}
            onPress={submitQuote}
          />
        </View>
      ) : null}

      {(quotes.data ?? []).length === 0 && editingQuoteId === null ? (
        <ThemedText type="small" themeColor="textMuted" style={styles.empty}>
          {t.book.noQuotes}
        </ThemedText>
      ) : (
        <View style={styles.quoteList}>
          {(quotes.data ?? []).map((quote) => (
            <SwipeableQuoteRow
              key={quote.id}
              text={quote.text}
              accentColor={theme.primary}
              onEdit={() => openEditQuote(quote.id, quote.text)}
              onDelete={() => removeQuote(quote.id)}
            />
          ))}
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  quotesHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  quoteForm: { gap: Spacing.two, marginTop: Spacing.two },
  quoteList: { gap: Spacing.two, marginTop: Spacing.three },
  empty: { marginTop: Spacing.two },
});
