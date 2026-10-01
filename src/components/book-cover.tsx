import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { CoverAspectRatio, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export interface BookCoverProps {
  uri: string | null;
  title: string;
  width: number;
  /** 沒有封面時顯示書名文字，列表小圖用 icon 就好 */
  showTitleFallback?: boolean;
}

/** 統一封面比例與圓角；沒有封面時給一個有書名的佔位卡片。 */
export function BookCover({ uri, title, width, showTitleFallback = true }: BookCoverProps) {
  const theme = useTheme();
  const height = width / CoverAspectRatio;

  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={[styles.cover, { width, height, backgroundColor: theme.backgroundElement }]}
        contentFit="cover"
        transition={150}
        accessibilityLabel={title}
      />
    );
  }

  return (
    <View
      style={[
        styles.cover,
        styles.placeholder,
        { width, height, backgroundColor: theme.primarySoft, borderColor: theme.border },
      ]}>
      {showTitleFallback && width >= 70 ? (
        <ThemedText type="smallBold" numberOfLines={4} style={styles.placeholderText}>
          {title}
        </ThemedText>
      ) : (
        <Ionicons name="book-outline" size={Math.min(width * 0.4, 28)} color={theme.textMuted} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  cover: { borderRadius: Radius.md },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.two,
  },
  placeholderText: { textAlign: 'center' },
});
