/**
 * App 主題：色彩、字體、間距。
 * Colors.light / Colors.dark 的 key 必須一致，ThemeColor 由此推導。
 *
 * 設計概念：背景維持乾淨的近中性色（不整片染黃），主色是飽和的黃橘／琥珀色，
 * 只用在行動點（按鈕、進度環、選中狀態），跟背景拉開對比才會跳出來。三種閱讀
 * 狀態刻意跳出黃橘色系（灰／藍／綠），避免整頁糊成一片。
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#241C0A',
    textSecondary: '#6E6248',
    textMuted: '#9C9478',
    background: '#FCFBF5',
    backgroundElement: '#F3F0E3',
    backgroundSelected: '#E9E3CC',
    card: '#FFFFFF',
    border: '#E6E0CC',
    primary: '#E3A900',
    primarySoft: '#FBEFC0',
    onPrimary: '#2E2205',
    /** 篩選列選中樣式專用色，跟 primary 分開設定（目前剛好同值）。 */
    filterSelected: '#E3A900',
    star: '#F0B429',
    success: '#4C8F52',
    danger: '#C0392B',
    unread: '#9C9478',
    reading: '#3D7EA6',
    read: '#4C8F52',
  },
  dark: {
    text: '#F5EDD6',
    textSecondary: '#C7BB98',
    textMuted: '#8F8567',
    background: '#18150E',
    backgroundElement: '#241F14',
    backgroundSelected: '#332B1A',
    card: '#1F1B11',
    border: '#3A331F',
    primary: '#E3A900',
    primarySoft: '#4A3B12',
    onPrimary: '#2A2005',
    filterSelected: '#E3A900',
    star: '#F4C752',
    success: '#63A868',
    danger: '#D9695A',
    unread: '#8F8567',
    reading: '#5FA0C4',
    read: '#5FBE84',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;
export type ThemePalette = typeof Colors.light;

/**
 * 月曆用來區分「同一天讀了不同書」的點點色票，依書籍 id 迴圈取色
 * （同一本書在任何一天都是同一個顏色）。跟上面的語意色（primary／read…）分開，
 * 純粹是給任意數量的書輪流上色用。
 */
export const CalendarDotPalette = {
  light: ['#E3A900', '#3D7EA6', '#4C8F52', '#C0392B', '#8E44AD', '#16A085', '#D35400'],
  dark: ['#F4C752', '#5FA0C4', '#5FBE84', '#D9695A', '#B07CC6', '#48C9B0', '#E67E22'],
} as const;

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radius = {
  sm: 6,
  md: 10,
  lg: 16,
  pill: 999,
} as const;

/** 封面統一比例（寬:高），書籍常見約 2:3 */
export const CoverAspectRatio = 2 / 3;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
