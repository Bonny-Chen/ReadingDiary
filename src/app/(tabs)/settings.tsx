import { useFocusEffect } from 'expo-router';
import { SquarePen, Trash } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import {
  NestableDraggableFlatList,
  NestableScrollContainer,
  type RenderItemParams,
} from 'react-native-draggable-flatlist';

import { Alert } from '@/utils/alert';
import { CloudBackupCard } from '@/components/cloud-backup-card';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Field, IconButton, Input, SectionHeader } from '@/components/ui-kit';
import { Spacing, Radius } from '@/constants/theme';
import { useAsyncData } from '@/hooks/use-async-data';
import { bumpDataVersion } from '@/hooks/use-data-version';
import { useTheme } from '@/hooks/use-theme';
import { t } from '@/i18n/zh-TW';
import {
  categoryCounts,
  addCategory,
  deleteCategory,
  listCategories,
  renameCategory,
  reorderCategories,
} from '@/repositories/categoryRepo';
import { getGoal, setGoal } from '@/repositories/goalRepo';
import { exportBackup, importBackup } from '@/services/backup';
import { pickBackupFile, shareBackupFile } from '@/services/backup-io';
import type { Category } from '@/types/models';

export default function SettingsScreen() {
  const theme = useTheme();
  const year = new Date().getFullYear();

  const goal = useAsyncData(() => getGoal(year), [year]);
  const categories = useAsyncData(listCategories, []);
  const counts = useAsyncData(categoryCounts, []);

  const [goalDraft, setGoalDraft] = useState<string | null>(null);
  const [newCategory, setNewCategory] = useState('');
  const [busy, setBusy] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editingName, setEditingName] = useState('');
  /**
   * 拖移排序時的本地順序；跟 categories.data 同步，但拖曳中不受重新查詢干擾。
   * 用 render 期間比對來源是否變動，避免用 useEffect 觸發多一次渲染。
   */
  const [orderedCategories, setOrderedCategories] = useState<Category[]>([]);
  const [syncedFrom, setSyncedFrom] = useState(categories.data);
  if (categories.data && categories.data !== syncedFrom) {
    setSyncedFrom(categories.data);
    setOrderedCategories(categories.data);
  }

  /**
   * 存檔後不能馬上把草稿清成 null：bumpDataVersion() 觸發的重新查詢還沒回來，
   * goal.data 仍是舊值，輸入框會先閃一下舊數字。改成等新的 targetCount 真的回來
   * 了才放掉草稿（比對值而不是物件參照，這樣其他資料變動造成的重查不會把使用者
   * 正在輸入的內容洗掉）。同樣用 render 期間比對，不繞 useEffect。
   */
  const targetCount = goal.data?.targetCount ?? null;
  const [syncedTargetCount, setSyncedTargetCount] = useState(targetCount);
  if (targetCount !== syncedTargetCount) {
    setSyncedTargetCount(targetCount);
    setGoalDraft(null);
  }

  const goalValue = goalDraft ?? (targetCount ? String(targetCount) : '');

  /**
   * 離開設定頁時把沒存檔的草稿丟掉，回來就會重新顯示已儲存的目標，
   * 不會停在使用者清空、但其實沒有存下去的空白狀態。
   */
  useFocusEffect(useCallback(() => () => setGoalDraft(null), []));

  const saveGoal = async () => {
    const value = Number.parseInt(goalValue, 10);
    if (!Number.isFinite(value) || value <= 0) {
      Alert.alert(t.settings.goalRequired);
      return;
    }
    await setGoal(year, value);
    // 先把草稿換成正規化後的值（去掉前導零之類），撐過重新查詢的空窗期。
    setGoalDraft(String(value));
    bumpDataVersion();
  };

  const submitCategory = async () => {
    const name = newCategory.trim();
    if (!name) return;
    await addCategory(name);
    setNewCategory('');
    bumpDataVersion();
  };

  const startEditCategory = (category: Category) => {
    setEditingCategory(category);
    setEditingName(category.name);
  };

  const submitEditCategory = async () => {
    if (!editingCategory) return;
    const name = editingName.trim();
    if (!name) return;
    if (name === editingCategory.name) {
      setEditingCategory(null);
      return;
    }
    try {
      await renameCategory(editingCategory.id, name);
      setEditingCategory(null);
      bumpDataVersion();
    } catch {
      // categories.name 有 UNIQUE 限制，改成已存在的名稱會在這裡失敗
      Alert.alert(t.settings.categoryExists);
    }
  };

  const onDragEndCategories = async (data: Category[]) => {
    setOrderedCategories(data);
    await reorderCategories(data.map((c) => c.id));
    bumpDataVersion();
  };

  const confirmDeleteCategory = (id: number, name: string) => {
    Alert.alert(t.settings.categoryDeleteConfirm(name), undefined, [
      { text: t.common.cancel, style: 'cancel' },
      {
        text: t.common.delete,
        style: 'destructive',
        onPress: async () => {
          await deleteCategory(id);
          bumpDataVersion();
        },
      },
    ]);
  };

  const doExport = async () => {
    setBusy(true);
    try {
      const uri = await exportBackup();
      try {
        await shareBackupFile(uri);
      } catch {
        Alert.alert(t.settings.exportDone, uri);
      }
    } catch (error) {
      console.error(error);
      Alert.alert(t.errors.generic);
    } finally {
      setBusy(false);
    }
  };

  const doImport = async () => {
    const uri = await pickBackupFile();
    if (!uri) return;

    Alert.alert(t.settings.importConfirmTitle, t.settings.importConfirmBody, [
      { text: t.common.cancel, style: 'cancel' },
      {
        text: t.common.confirm,
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await importBackup(uri);
            bumpDataVersion();
            Alert.alert(t.settings.importDone);
          } catch (error) {
            console.error(error);
            Alert.alert(t.settings.importFailed);
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  return (
    <NestableScrollContainer
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.content}>
      <SectionHeader title={t.settings.goalSection} />
      <Card style={styles.card}>
        <Field label={t.settings.goalYear(year)}>
          <View style={styles.goalRow}>
            <View style={styles.flex}>
              <Input
                value={goalValue}
                onChangeText={(v) => setGoalDraft(v.replace(/[^0-9]/g, ''))}
                keyboardType="number-pad"
                placeholder="12"
                onSubmitEditing={saveGoal}
                returnKeyType="done"
                returnKeyLabel={t.common.save}
              />
            </View>
            <IconButton icon="check-bold" onPress={saveGoal} accessibilityLabel={t.common.save} />
          </View>
        </Field>
      </Card>

      <SectionHeader title={t.settings.categorySection} />
      <Card style={styles.card}>
        <View style={styles.goalRow}>
          <View style={styles.flex}>
            <Input
              value={newCategory}
              onChangeText={setNewCategory}
              placeholder={t.settings.categoryName}
              onSubmitEditing={submitCategory}
              returnKeyType="done"
              returnKeyLabel={t.common.save}
            />
          </View>
          <IconButton icon="plus-thick" onPress={submitCategory} accessibilityLabel={t.settings.addCategory} />
        </View>

        <View style={styles.categoryList}>
          <NestableDraggableFlatList
            data={orderedCategories}
            keyExtractor={(category) => String(category.id)}
            onDragEnd={({ data }) => onDragEndCategories(data)}
            renderItem={({ item: category, drag, isActive }: RenderItemParams<Category>) => (
              <Pressable
                onLongPress={drag}
                disabled={isActive}
                style={[
                  styles.categoryRow,
                  { borderBottomColor: theme.border },
                  isActive && [
                    styles.categoryRowDragging,
                    { shadowColor: theme.text },
                  ],
                ]}>
                <ThemedText>{category.name}</ThemedText>
                <View style={styles.categoryRight}>
                  <ThemedText type="small" themeColor="textMuted">
                    {counts.data?.[category.id] ?? 0} {t.common.book}
                  </ThemedText>
                  <Pressable
                    onPress={() => startEditCategory(category)}
                    hitSlop={8}
                    accessibilityLabel={t.common.edit}
                    style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
                    <SquarePen size={18} color={theme.reading} strokeWidth={2.25} />
                  </Pressable>
                  <Pressable
                    onPress={() => confirmDeleteCategory(category.id, category.name)}
                    hitSlop={8}
                    accessibilityLabel={t.common.delete}
                    style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
                    <Trash size={18} color={theme.danger} strokeWidth={2.25} />
                  </Pressable>
                </View>
              </Pressable>
            )}
          />
        </View>
      </Card>

      <SectionHeader title={t.settings.cloudSection} />
      <CloudBackupCard />

      <SectionHeader title={t.settings.dataSection} />
      <Card style={styles.card}>
        <Button
          label={t.settings.exportData}
          icon="share-outline"
          variant="ghost"
          onPress={doExport}
          loading={busy}
        />
        <Button
          label={t.settings.importData}
          icon="download-outline"
          variant="ghost"
          onPress={doImport}
          disabled={busy}
        />
        <ThemedText type="small" themeColor="textMuted">
          {t.settings.storageNote}
        </ThemedText>
      </Card>

      <Modal
        visible={editingCategory !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setEditingCategory(null)}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={styles.backdrop} onPress={() => setEditingCategory(null)}>
            <Pressable
              style={[styles.sheet, { backgroundColor: theme.background }]}
              onPress={(event) => event.stopPropagation()}>
              <ScrollView
                style={styles.sheetScroll}
                keyboardShouldPersistTaps="always"
                contentContainerStyle={styles.sheetScrollContent}>
                <ThemedText type="smallBold">{t.settings.editCategory}</ThemedText>
                <Field label={t.settings.categoryName}>
                  <Input
                    value={editingName}
                    onChangeText={setEditingName}
                    autoFocus
                    onSubmitEditing={submitEditCategory}
                    returnKeyType="done"
                    returnKeyLabel={t.common.save}
                  />
                </Field>
                <View style={styles.sheetActions}>
                  <Button
                    label={t.common.cancel}
                    variant="secondary"
                    onPress={() => setEditingCategory(null)}
                    style={styles.flex}
                  />
                  <Button
                    label={t.common.save}
                    onPress={submitEditCategory}
                    style={styles.flex}
                    triggerOnPressIn
                  />
                </View>
              </ScrollView>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </NestableScrollContainer>
  );
}

const styles = StyleSheet.create({
  content: { paddingVertical: Spacing.three, gap: Spacing.two, paddingBottom: Spacing.five },
  card: { marginHorizontal: Spacing.three, gap: Spacing.two, marginBottom: Spacing.two },
  goalRow: { flexDirection: 'row', gap: Spacing.two, alignItems: 'center' },
  flex: { flex: 1 },
  categoryList: { marginTop: Spacing.two },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  // 拖曳中不改底色，只用「浮起」的陰影表示正在拖曳；不放大，避免文字跟相鄰列擠在一起
  categoryRowDragging: {
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 10,
  },
  categoryRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  backdrop: { flex: 1, backgroundColor: '#00000088', justifyContent: 'center', padding: Spacing.three },
  sheet: { borderRadius: Radius.lg, overflow: 'hidden' },
  // ScrollView 只是為了拿到 keyboardShouldPersistTaps，內容不需要真的捲動，flexGrow 歸零避免撐開
  sheetScroll: { flexGrow: 0 },
  sheetScrollContent: { padding: Spacing.four, gap: Spacing.three },
  sheetActions: { flexDirection: 'row', gap: Spacing.two },
});
