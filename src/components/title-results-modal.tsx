import { FlatList, Modal, Pressable, StyleSheet, View } from 'react-native';

import { BookCover } from '@/components/book-cover';
import { Button } from '@/components/ui-kit';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { t } from '@/i18n/zh-TW';
import type { BookMetadata } from '@/types/models';

/**
 * 書名查詢結果的選擇清單，掃描頁（拍封面／手動輸入書名）與編輯頁（書名旁的查詢按鈕）共用。
 * manualLabel 是最後一顆按鈕的文字，交給呼叫端決定措辭（「手動建立」跟「保留原本內容」情境不同）。
 * 同名書可能有幾十筆，清單用 FlatList 撐滿 sheet 剩餘高度自己捲動，標題與底部按鈕固定不動。
 */
export function TitleResultsModal({
  visible,
  results,
  manualLabel,
  onSelect,
  onManual,
  onClose,
}: {
  visible: boolean;
  results: BookMetadata[];
  manualLabel: string;
  onSelect: (metadata: BookMetadata) => void;
  onManual: () => void;
  onClose: () => void;
}) {
  const theme = useTheme();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: theme.background }]}
          onPress={(event) => event.stopPropagation()}>
          <View style={styles.header}>
            <ThemedText type="smallBold">{t.scan.titleSearchResultsTitle}</ThemedText>
          </View>
          <FlatList
            data={results}
            keyExtractor={(item, index) => `${item.isbn13 ?? item.isbn10 ?? item.title}-${index}`}
            // ScrollView／FlatList 預設 flexGrow: 1，在直向 flex 容器裡會撐滿 sheet 剩餘的
            // maxHeight 空間，結果只有一兩筆時中間會留一大片空白；flexShrink: 1 讓筆數多時
            // 仍會被壓縮到剩餘空間內、靠內建捲動看完，不會把整個 sheet 撐爆。
            style={styles.resultsScroll}
            contentContainerStyle={styles.resultsList}
            renderItem={({ item }) => (
              <Pressable
                style={[styles.resultRow, { borderColor: theme.border }]}
                onPress={() => onSelect(item)}>
                <BookCover uri={item.coverUrl} title={item.title} width={44} showTitleFallback={false} />
                <View style={styles.resultBody}>
                  <ThemedText type="smallBold" numberOfLines={2}>
                    {item.title}
                  </ThemedText>
                  {item.authors ? (
                    <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                      {item.authors}
                    </ThemedText>
                  ) : null}
                </View>
              </Pressable>
            )}
          />
          <View style={styles.footer}>
            <Button label={manualLabel} variant="secondary" onPress={onManual} />
            <Button label={t.common.cancel} variant="ghost" onPress={onClose} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#00000088', justifyContent: 'center', padding: Spacing.three },
  sheet: { borderRadius: Radius.lg, overflow: 'hidden', maxHeight: '80%' },
  header: { padding: Spacing.four, paddingBottom: Spacing.two },
  resultsScroll: { flexGrow: 0, flexShrink: 1 },
  resultsList: { paddingHorizontal: Spacing.four, gap: Spacing.two },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: Spacing.two + 2,
    gap: Spacing.three,
  },
  resultBody: { flex: 1, gap: Spacing.half, justifyContent: 'center' },
  footer: { padding: Spacing.four, paddingTop: Spacing.three, gap: Spacing.two },
});
