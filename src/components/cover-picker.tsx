import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Alert } from '@/utils/alert';
import { BookCover } from '@/components/book-cover';
import { Button } from '@/components/ui-kit';
import { Spacing } from '@/constants/theme';
import { t } from '@/i18n/zh-TW';
import { deleteCover, saveCoverFromLocalUri } from '@/services/cover';
import { type ImageSource, pickImage } from '@/services/image-picker';

export interface CoverPickerProps {
  coverUri: string | null;
  title: string;
  /** 檔名前綴，通常用 ISBN 或書籍 id */
  prefix: string;
  onChange: (uri: string | null, isCustom: boolean) => void;
}

/**
 * 換封面：拍照或從相簿選，選完壓縮並存進 covers 目錄。
 * 舊的自訂封面會一併刪除，避免佔空間。
 */
export function CoverPicker({ coverUri, title, prefix, onChange }: CoverPickerProps) {
  const [busy, setBusy] = useState(false);

  const apply = async (uri: string) => {
    setBusy(true);
    try {
      const saved = await saveCoverFromLocalUri(uri, prefix);
      deleteCover(coverUri);
      onChange(saved, true);
    } catch {
      Alert.alert(t.errors.generic);
    } finally {
      setBusy(false);
    }
  };

  const pick = async (source: ImageSource) => {
    const uri = await pickImage(source);
    if (uri) await apply(uri);
  };

  const remove = () => {
    deleteCover(coverUri);
    onChange(null, false);
  };

  return (
    <View style={styles.row}>
      <BookCover uri={coverUri} title={title} width={96} />
      <View style={styles.actions}>
        <Button
          label={t.book.pickFromLibrary}
          icon="images-outline"
          variant="ghost"
          onPress={() => pick('library')}
          loading={busy}
        />
        <Button
          label={t.book.takePhoto}
          icon="camera-outline"
          variant="ghost"
          onPress={() => pick('camera')}
          disabled={busy}
        />
        {coverUri ? (
          <Button
            label={t.book.removeCover}
            icon="trash-outline"
            variant="danger"
            onPress={remove}
            disabled={busy}
          />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: Spacing.three },
  actions: { flex: 1, gap: Spacing.two, justifyContent: 'center' },
});
