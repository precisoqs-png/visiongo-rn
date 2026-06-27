import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemeKey, THEME_ORDER, THEMES, Palette } from '../theme/themes';

interface ThemeState {
  current: ThemeKey;
  palette: Palette;
  setCurrent: (key: ThemeKey) => void;
  cycleNext: () => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      current: 'warmPaper',
      palette: THEMES.warmPaper.palette,
      setCurrent: (key) => set({ current: key, palette: THEMES[key].palette }),
      cycleNext: () => {
        const idx = THEME_ORDER.indexOf(get().current);
        const next = THEME_ORDER[(idx + 1) % THEME_ORDER.length];
        set({ current: next, palette: THEMES[next].palette });
      },
    }),
    {
      name: 'visiongo-theme',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ current: state.current }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.palette = THEMES[state.current].palette;
        }
      },
    }
  )
);
