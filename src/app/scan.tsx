import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Alert } from '@/utils/alert';
import { CameraView, type CameraViewHandle, useCameraPermissions } from '@/components/camera-view';
import { ThemedText } from '@/components/themed-text';
import { TitleResultsModal } from '@/components/title-results-modal';
import { Button, Field, Input } from '@/components/ui-kit';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { t } from '@/i18n/zh-TW';
import { findByIsbn } from '@/repositories/bookRepo';
import { expandIsbn, isValidIsbn, normalizeIsbn } from '@/services/isbn';
import { lookupByIsbn, searchByTitle } from '@/services/metadata';
import { recognizeCoverText, recognizeIsbn } from '@/services/ocr';
import { setPendingBook } from '@/state/pending-book';
import type { BookMetadata } from '@/types/models';

/** 條碼掃不到時，過幾秒沒掃到就自動改拍版權頁做 ISBN OCR，不需要使用者手動切換模式。 */
const AUTO_OCR_DELAY_MS = 4000;

/** 查無資料時，至少把 ISBN 帶進表單，讓使用者手動補完。 */
function blankMetadata(isbn: string | null): BookMetadata {
  const parts = isbn ? expandIsbn(isbn) : { isbn13: null, isbn10: null };
  return {
    isbn13: parts.isbn13,
    isbn10: parts.isbn10,
    title: '',
    authors: null,
    publishedDate: null,
    description: null,
    coverUrl: null,
    source: 'manual',
  };
}

export default function ScanScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraViewHandle>(null);

  const [busy, setBusy] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualIsbn, setManualIsbn] = useState('');
  const [titleGuess, setTitleGuess] = useState('');
  const [titleResults, setTitleResults] = useState<BookMetadata[] | null>(null);
  /** 掃到後先鎖住，避免相機連續觸發同一本書；也用來暫停自動 OCR 迴圈 */
  const lockedRef = useRef(false);

  const goToForm = useCallback(
    (metadata: BookMetadata) => {
      setPendingBook(metadata);
      router.replace('/book/edit');
    },
    [router],
  );

  /** 查無書目資料時的備援：拍書封，用中文 OCR 猜書名／作者後帶入表單，交由使用者確認。 */
  const scanCoverForMetadata = useCallback(
    async (isbn: string) => {
      const base = blankMetadata(isbn);
      if (!cameraRef.current) {
        goToForm(base);
        return;
      }

      setBusy(true);
      try {
        const photo = await cameraRef.current.takePictureAsync({ quality: 1 });
        if (!photo?.uri) {
          goToForm(base);
          return;
        }
        const { titleGuess: guess, authorGuess } = await recognizeCoverText(photo.uri);
        goToForm({ ...base, title: guess ?? '', authors: authorGuess });
      } finally {
        setBusy(false);
        lockedRef.current = false;
      }
    },
    [goToForm],
  );

  const handleIsbn = useCallback(
    async (rawIsbn: string) => {
      const isbn = normalizeIsbn(rawIsbn);
      if (!isValidIsbn(isbn)) {
        Alert.alert(t.scan.invalidIsbn);
        lockedRef.current = false;
        return;
      }

      setBusy(true);
      try {
        const existing = await findByIsbn(isbn);
        if (existing) {
          Alert.alert(t.scan.duplicateTitle, t.scan.duplicateBody(existing.title), [
            {
              text: t.common.cancel,
              style: 'cancel',
              onPress: () => {
                lockedRef.current = false;
              },
            },
            { text: t.scan.viewBook, onPress: () => router.replace(`/book/${existing.id}`) },
          ]);
          return;
        }

        const { metadata, failedReason } = await lookupByIsbn(isbn);
        if (metadata) {
          goToForm(metadata);
          return;
        }

        Alert.alert(
          failedReason === 'network' ? t.errors.network : t.scan.lookupFailed,
          failedReason === 'network' ? t.scan.offlineNotice : t.scan.lookupFailedBody,
          [
            {
              text: t.common.cancel,
              style: 'cancel',
              onPress: () => {
                lockedRef.current = false;
              },
            },
            { text: t.scan.scanCover, onPress: () => scanCoverForMetadata(isbn) },
            { text: t.scan.createManually, onPress: () => goToForm(blankMetadata(isbn)) },
          ],
        );
      } finally {
        setBusy(false);
      }
    },
    [goToForm, router, scanCoverForMetadata],
  );

  const onBarcodeScanned = useCallback(
    ({ data }: { data: string }) => {
      if (lockedRef.current || busy) return;
      lockedRef.current = true;
      handleIsbn(data);
    },
    [busy, handleIsbn],
  );

  /** 條碼持續掃不到時的自動備援：定時拍照試著用 OCR 讀版權頁 ISBN，失敗就靜靜重試，不打擾使用者。 */
  useEffect(() => {
    if (!permission?.granted || busy || manualOpen || titleResults) return;

    const timer = setTimeout(async () => {
      if (lockedRef.current || !cameraRef.current) return;
      setBusy(true);
      try {
        const photo = await cameraRef.current.takePictureAsync({ quality: 1 });
        if (!photo?.uri || lockedRef.current) return;
        const { candidates } = await recognizeIsbn(photo.uri);
        if (candidates.length > 0 && !lockedRef.current) {
          lockedRef.current = true;
          await handleIsbn(candidates[0]);
        }
      } finally {
        setBusy(false);
      }
    }, AUTO_OCR_DELAY_MS);

    return () => clearTimeout(timer);
  }, [permission?.granted, busy, manualOpen, titleResults, handleIsbn]);

  /** 選了搜尋結果其中一筆：若有 ISBN 先查重複，避免建立到已存在的書。 */
  const selectTitleResult = useCallback(
    async (metadata: BookMetadata) => {
      setTitleResults(null);
      lockedRef.current = false;

      if (metadata.isbn13) {
        const existing = await findByIsbn(metadata.isbn13);
        if (existing) {
          Alert.alert(t.scan.duplicateTitle, t.scan.duplicateBody(existing.title), [
            { text: t.common.cancel, style: 'cancel' },
            { text: t.scan.viewBook, onPress: () => router.replace(`/book/${existing.id}`) },
          ]);
          return;
        }
      }
      goToForm(metadata);
    },
    [goToForm, router],
  );

  /** 條碼／ISBN 都拿不到時：拍書封辨識書名，直接用書名查書目，列出候選讓使用者挑一筆。 */
  const searchTitleForMetadata = useCallback(async () => {
    if (busy || !cameraRef.current) return;
    lockedRef.current = true;
    setBusy(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 1 });
      if (!photo?.uri) return;

      const { titleGuess: guess } = await recognizeCoverText(photo.uri);
      if (!guess) {
        Alert.alert(t.scan.titleOcrFailed);
        return;
      }

      const results = await searchByTitle(guess);
      setTitleGuess(guess);
      if (results.length === 0) {
        Alert.alert(t.scan.foundTitle, t.scan.titleNoMatches);
        goToForm({ ...blankMetadata(null), title: guess });
        return;
      }
      setTitleResults(results);
    } finally {
      setBusy(false);
      lockedRef.current = false;
    }
  }, [busy, goToForm]);

  const submitManual = () => {
    const isbn = normalizeIsbn(manualIsbn);
    if (!isValidIsbn(isbn)) {
      Alert.alert(t.scan.invalidIsbn);
      return;
    }
    setManualOpen(false);
    setManualIsbn('');
    handleIsbn(isbn);
  };

  if (!permission) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.primary} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}>
        <Ionicons name="camera-outline" size={44} color={theme.textMuted} />
        <ThemedText type="smallBold">{t.scan.permissionTitle}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.centerText}>
          {t.scan.permissionBody}
        </ThemedText>
        <Button label={t.scan.grantPermission} onPress={requestPermission} />
        <Button
          label={t.scan.manualEntry}
          variant="ghost"
          onPress={() => setManualOpen(true)}
        />
        <Button
          label={t.scan.manualAdd}
          variant="accent"
          onPress={() => goToForm(blankMetadata(null))}
        />
        <ManualIsbnModal
          visible={manualOpen}
          value={manualIsbn}
          onChangeText={setManualIsbn}
          onSubmit={submitManual}
          onClose={() => setManualOpen(false)}
        />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8'] }}
        onBarcodeScanned={onBarcodeScanned}
      />

      <SafeAreaView style={styles.overlay} edges={['top', 'bottom']}>
        <View style={styles.frameArea}>
          <View style={styles.frame} />
          <ThemedText style={styles.hint}>{t.scan.hintBarcode}</ThemedText>
        </View>

        <View style={styles.controls}>
          {busy ? (
            <View style={styles.busy}>
              <ActivityIndicator color="#fff" />
              <ThemedText style={styles.hint}>{t.scan.lookingUp}</ThemedText>
            </View>
          ) : null}

          <Button
            label={t.scan.searchByTitle}
            icon="text-outline"
            variant="secondary"
            onPress={searchTitleForMetadata}
            disabled={busy}
          />

          <Button
            label={t.scan.manualEntry}
            icon="create-outline"
            variant="secondary"
            onPress={() => setManualOpen(true)}
          />

          <Button
            label={t.scan.manualAdd}
            icon="add-outline"
            variant="accent"
            onPress={() => goToForm(blankMetadata(null))}
          />
        </View>
      </SafeAreaView>

      <ManualIsbnModal
        visible={manualOpen}
        value={manualIsbn}
        onChangeText={setManualIsbn}
        onSubmit={submitManual}
        onClose={() => setManualOpen(false)}
      />

      <TitleResultsModal
        visible={titleResults !== null}
        results={titleResults ?? []}
        manualLabel={t.scan.titleSearchManualOption(titleGuess)}
        onSelect={selectTitleResult}
        onManual={() => {
          setTitleResults(null);
          lockedRef.current = false;
          goToForm({ ...blankMetadata(null), title: titleGuess });
        }}
        onClose={() => {
          setTitleResults(null);
          lockedRef.current = false;
        }}
      />
    </View>
  );
}

function ManualIsbnModal({
  visible,
  value,
  onChangeText,
  onSubmit,
  onClose,
}: {
  visible: boolean;
  value: string;
  onChangeText: (value: string) => void;
  onSubmit: () => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const valid = value.length === 0 || isValidIsbn(value);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.backdrop} onPress={onClose}>
          <Pressable
            style={[styles.sheet, { backgroundColor: theme.background }]}
            onPress={(event) => event.stopPropagation()}>
            <ScrollView
              style={styles.sheetScroll}
              keyboardShouldPersistTaps="always"
              contentContainerStyle={styles.sheetScrollContent}>
              <ThemedText type="smallBold">{t.scan.manualTitle}</ThemedText>
              <Field label={t.book.isbn} hint={valid ? undefined : t.scan.invalidIsbn}>
                <Input
                  value={value}
                  onChangeText={onChangeText}
                  placeholder={t.scan.manualPlaceholder}
                  keyboardType="numbers-and-punctuation"
                  autoCapitalize="characters"
                  autoFocus
                  onSubmitEditing={onSubmit}
                  returnKeyType="done"
                  returnKeyLabel={t.common.confirm}
                />
              </Field>
              <View style={styles.sheetActions}>
                <Button label={t.common.cancel} variant="secondary" onPress={onClose} style={styles.flex} />
                <Button
                  label={t.common.confirm}
                  onPress={onSubmit}
                  disabled={!isValidIsbn(value)}
                  style={styles.flex}
                  triggerOnPressIn
                />
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
  },
  centerText: { textAlign: 'center' },
  overlay: { flex: 1, justifyContent: 'space-between' },
  frameArea: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.three },
  frame: {
    width: '78%',
    aspectRatio: 1.9,
    borderWidth: 2,
    borderColor: '#ffffffcc',
    borderRadius: Radius.md,
  },
  hint: { color: '#fff', textAlign: 'center' },
  controls: { padding: Spacing.three, gap: Spacing.two },
  busy: { alignItems: 'center', gap: Spacing.two, paddingBottom: Spacing.two },
  backdrop: { flex: 1, backgroundColor: '#00000088', justifyContent: 'center', padding: Spacing.three },
  sheet: { borderRadius: Radius.lg, overflow: 'hidden' },
  // ScrollView 只是為了拿到 keyboardShouldPersistTaps，內容不需要真的捲動，flexGrow 歸零避免撐開
  sheetScroll: { flexGrow: 0 },
  sheetScrollContent: { padding: Spacing.four, gap: Spacing.three },
  sheetActions: { flexDirection: 'row', gap: Spacing.two },
  flex: { flex: 1 },
});
