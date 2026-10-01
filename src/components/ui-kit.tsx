import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** 表單與版面的共用小元件，避免每個畫面各寫一套樣式。 */

/**
 * IconButton／accent 按鈕／浮動按鈕的圖示固定用白色，搭配 theme.primary 當底色。
 * 注意：這個組合對比度偏低（約 1.8:1，比 onPrimary 深咖啡色的 8:1 低很多），
 * 是刻意選擇維持白色圖示的視覺效果，而非疏漏。
 */
const ACCENT_ICON_COLOR = '#FFFFFF';

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  disabled,
  loading,
  style,
  triggerOnPressIn,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'accent';
  icon?: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
  loading?: boolean;
  style?: object;
  /**
   * 觸控在放開（onPress）前就被鍵盤收起動畫取消時，onPress 不會觸發，需要點兩次。
   * 鍵盤上方常駐的儲存／確認按鈕改用 onPressIn（手指碰到就觸發），避免這個問題。
   */
  triggerOnPressIn?: boolean;
}) {
  const theme = useTheme();
  const background =
    variant === 'accent' || variant === 'primary'
      ? theme.primary
      : variant === 'ghost'
        ? 'transparent'
        : theme.backgroundElement;
  const color =
    variant === 'accent'
      ? ACCENT_ICON_COLOR
      : variant === 'primary'
        ? theme.onPrimary
        : variant === 'danger'
          ? theme.danger
          : theme.text;

  return (
    <Pressable
      onPress={triggerOnPressIn ? undefined : onPress}
      onPressIn={triggerOnPressIn ? onPress : undefined}
      disabled={disabled || loading}
      accessibilityRole="button"
      android_ripple={{ color: variant === 'accent' ? 'rgba(0,0,0,0.15)' : theme.onPrimary + '33' }}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: background,
          opacity: disabled ? 0.45 : pressed ? 0.6 : 1,
          transform: [{ scale: pressed ? 0.97 : 1 }],
        },
        variant === 'ghost' && { borderWidth: 1, borderColor: theme.border },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={color} />
      ) : (
        <>
          {icon && <Ionicons name={icon} size={18} color={color} />}
          <ThemedText type="smallBold" style={{ color }}>
            {label}
          </ThemedText>
        </>
      )}
    </Pressable>
  );
}

/** 圓形圖示按鈕：搭配輸入框的「確認」類動作（存目標、加類別），比文字按鈕更輕巧。 */
export function IconButton({
  icon,
  onPress,
  disabled,
  loading,
  accessibilityLabel,
}: {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  accessibilityLabel: string;
}) {
  const theme = useTheme();
  return (
    <Pressable
      // 一定緊鄰輸入框，onPress（放開才觸發）常被鍵盤收起動畫打斷，改用 onPressIn 一碰就觸發
      onPressIn={disabled || loading ? undefined : onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      android_ripple={{ color: 'rgba(0,0,0,0.15)', borderless: false }}
      style={({ pressed }) => [
        styles.iconButton,
        {
          backgroundColor: theme.primary,
          opacity: disabled ? 0.45 : pressed ? 0.6 : 1,
          transform: [{ scale: pressed ? 0.94 : 1 }],
        },
      ]}>
      {loading ? (
        <ActivityIndicator color={ACCENT_ICON_COLOR} size="small" />
      ) : (
        // Ionicons 的 checkmark/add 線條偏細，這裡改用 MaterialCommunityIcons 真正的粗體筆畫圖示
        <MaterialCommunityIcons name={icon} size={22} color={ACCENT_ICON_COLOR} />
      )}
    </Pressable>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.field}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        {label}
      </ThemedText>
      {children}
      {hint ? (
        <ThemedText type="small" themeColor="textMuted">
          {hint}
        </ThemedText>
      ) : null}
    </View>
  );
}

export function Input(props: TextInputProps) {
  const theme = useTheme();
  return (
    <TextInput
      placeholderTextColor={theme.textMuted}
      {...props}
      style={[
        styles.input,
        { backgroundColor: theme.card, borderColor: theme.border, color: theme.text },
        props.multiline && styles.inputMultiline,
        props.style,
      ]}
    />
  );
}

export function Card({ children, style }: { children: ReactNode; style?: object }) {
  const theme = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }, style]}>
      {children}
    </View>
  );
}

export function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <View style={styles.sectionHeader}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        {title}
      </ThemedText>
      {action}
    </View>
  );
}

export function EmptyState({
  icon = 'book-outline',
  title,
  body,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  body?: string;
}) {
  const theme = useTheme();
  return (
    <View style={styles.empty}>
      <Ionicons name={icon} size={44} color={theme.textMuted} />
      <ThemedText type="smallBold" themeColor="textSecondary" style={styles.centerText}>
        {title}
      </ThemedText>
      {body ? (
        <ThemedText type="small" themeColor="textMuted" style={styles.centerText}>
          {body}
        </ThemedText>
      ) : null}
    </View>
  );
}

export function LoadingView() {
  const theme = useTheme();
  return (
    <View style={styles.empty}>
      <ActivityIndicator color={theme.primary} />
    </View>
  );
}

/** 右下角浮動按鈕（書庫的「新增書籍」入口）。 */
export function FloatingButton({
  icon,
  onPress,
  label,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  label: string;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      android_ripple={{ color: 'rgba(0,0,0,0.15)' }}
      style={({ pressed }) => [
        styles.fab,
        {
          backgroundColor: theme.primary,
          opacity: pressed ? 0.6 : 1,
          transform: [{ scale: pressed ? 0.94 : 1 }],
        },
      ]}>
      <Ionicons name={icon} size={26} color={ACCENT_ICON_COLOR} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.three - 2,
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.md,
    minHeight: 46,
  },
  iconButton: {
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.md,
  },
  field: { gap: Spacing.one + 2 },
  input: {
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
    fontSize: 16,
    minHeight: 46,
    // Android 單行 TextInput 預設文字貼頂，框高比文字高時上方留白明顯，需明講置中
    textAlignVertical: 'center',
  },
  // 明講的 lineHeight 在 iOS 單行輸入框裡會讓行框留白偏下方，導致文字看起來貼頂；
  // 多行才需要固定行距方便閱讀，且此時是從頂部排版，不受這個問題影響。
  inputMultiline: { minHeight: 110, lineHeight: 24, textAlignVertical: 'top', paddingTop: Spacing.two + 2 },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.lg,
    padding: Spacing.three,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    marginBottom: Spacing.two,
  },
  empty: { alignItems: 'center', justifyContent: 'center', gap: Spacing.two, padding: Spacing.five },
  centerText: { textAlign: 'center' },
  fab: {
    position: 'absolute',
    right: Spacing.three,
    bottom: Spacing.four,
    width: 58,
    height: 58,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
});
