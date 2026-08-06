import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { useThemeStore } from '../store/useThemeStore';
import { useAppStore } from '../store/useAppStore';

// Keep the native splash visible until persisted data has rehydrated, so the
// first frame the user sees is their real board (not a flash of defaults).
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const palette = useThemeStore((s) => s.palette);
  const [hydrated, setHydrated] = useState(useAppStore.persist.hasHydrated());

  useEffect(() => {
    const unsub = useAppStore.persist.onFinishHydration(() => setHydrated(true));
    if (useAppStore.persist.hasHydrated()) setHydrated(true);
    // Never hold the splash forever if storage is slow or broken
    const fallback = setTimeout(() => setHydrated(true), 3000);
    return () => { unsub(); clearTimeout(fallback); };
  }, []);

  useEffect(() => {
    if (hydrated) SplashScreen.hideAsync().catch(() => {});
  }, [hydrated]);

  return (
    <GestureHandlerRootView style={styles.root}>
      <StatusBar style={palette.isDark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, animation: 'fade_from_bottom' }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="goal/[id]/index" options={{ animation: 'slide_from_bottom', presentation: 'modal' }} />
        <Stack.Screen name="goal/[id]/milestones" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="goal/[id]/measurables" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="completed" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="how-to-use" options={{ animation: 'slide_from_right' }} />
      </Stack>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
