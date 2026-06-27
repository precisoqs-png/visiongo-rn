import { Platform } from 'react-native';

export const GOAL_NOTE_COLORS = [
  '#f0cf7e',
  '#abc6a1',
  '#e3a48c',
  '#9fbcd6',
  '#c9b3da',
  '#e6acae',
  '#d8c69a',
  '#8fc2b4',
];

export interface Palette {
  bg: string;
  bgGradient: string[];
  surface: string;
  text: string;
  textSecondary: string;
  muted: string;
  line: string;
  ink: string;
  accent: string;
  isDark: boolean;
}

export type ThemeKey = 'warmPaper' | 'blackPlum' | 'charcoal' | 'deepSea' | 'softBlush';

export const THEMES: Record<ThemeKey, { label: string; palette: Palette }> = {
  warmPaper: {
    label: 'Warm Paper',
    palette: {
      bg: '#f3ecdd',
      bgGradient: ['#efe7d6', '#e7ddc8', '#ded2b8'],
      surface: '#fbf7ec',
      text: '#2f2a23',
      textSecondary: '#3a342a',
      muted: '#6e6453',
      line: '#e6dcc4',
      ink: '#3a342a',
      accent: '#5f9e5a',
      isDark: false,
    },
  },
  blackPlum: {
    label: 'Black Plum',
    palette: {
      bg: '#15131c',
      bgGradient: ['#15131c', '#1a1724', '#1e1a2b'],
      surface: '#211d2b',
      text: '#efeaf6',
      textSecondary: '#efeaf6',
      muted: '#9a90ab',
      line: '#332c40',
      ink: '#efeaf6',
      accent: '#a78bfa',
      isDark: true,
    },
  },
  charcoal: {
    label: 'Charcoal',
    palette: {
      bg: '#1a1a1c',
      bgGradient: ['#1a1a1c', '#1f1f21', '#222224'],
      surface: '#262628',
      text: '#ededee',
      textSecondary: '#ededee',
      muted: '#9a9a9e',
      line: '#383839',
      ink: '#ededee',
      accent: '#5fd08a',
      isDark: true,
    },
  },
  deepSea: {
    label: 'Deep Sea',
    palette: {
      bg: '#0f1e2a',
      bgGradient: ['#0f1e2a', '#122233', '#14263b'],
      surface: '#16293a',
      text: '#e6f0f6',
      textSecondary: '#e6f0f6',
      muted: '#85a0b2',
      line: '#214055',
      ink: '#e6f0f6',
      accent: '#4fd0c0',
      isDark: true,
    },
  },
  softBlush: {
    label: 'Soft Blush',
    palette: {
      bg: '#f6ebe8',
      bgGradient: ['#f6ebe8', '#f2e5e1', '#eededa'],
      surface: '#fdf5f2',
      text: '#3a2e2b',
      textSecondary: '#3a2e2b',
      muted: '#ab948c',
      line: '#ecdbd5',
      ink: '#3a2e2b',
      accent: '#cf7a7a',
      isDark: false,
    },
  },
};

export const THEME_ORDER: ThemeKey[] = [
  'warmPaper',
  'blackPlum',
  'charcoal',
  'deepSea',
  'softBlush',
];

export const FONTS = {
  display: Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' }) as string,
  displayItalic: Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' }) as string,
  body: Platform.select({ ios: 'System', android: 'sans-serif', default: 'System' }) as string,
  bodyMedium: Platform.select({
    ios: 'System',
    android: 'sans-serif-medium',
    default: 'System',
  }) as string,
  bodyBold: Platform.select({
    ios: 'System',
    android: 'sans-serif-bold',
    default: 'System',
  }) as string,
};

/** Hex color with alpha (0–1) → rgba string for RN */
export function hexAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
