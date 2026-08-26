import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet, View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { Ionicons } from '@expo/vector-icons';
import { useThemeStore } from '../store/useThemeStore';
import { useAppStore } from '../store/useAppStore';

// Keep the native splash visible until persisted data has rehydrated, so the
// first frame the user sees is their real board (not a flash of defaults).
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const palette = useThemeStore((s) => s.palette);
  const [hydrated, setHydrated] = useState(useAppStore.persist.hasHydrated());
  // Every screen in the app renders Ionicons before anything else is
  // interactive — without preloading its font, the glyph font loads
  // asynchronously and every icon briefly renders as a placeholder □ box on
  // a cold load. Gating on the same `hydrated` flag the rest of this file
  // already uses means icons are guaranteed ready before the first real
  // screen ever mounts, not just "loading eventually".
  const [iconsLoaded] = useFonts(Ionicons.font);
  const ready = hydrated && iconsLoaded;

  useEffect(() => {
    const unsub = useAppStore.persist.onFinishHydration(() => setHydrated(true));
    if (useAppStore.persist.hasHydrated()) setHydrated(true);
    // Kick off the actual storage read — the store was created with
    // skipHydration so this is the ONLY place rehydrate() gets called. Doing
    // it here, guarded by the `!hydrated` route tree below, guarantees
    // nothing can mount a store-mutating action before real data has loaded.
    else useAppStore.persist.rehydrate();
    // Never hold the splash forever if storage is slow or broken
    const fallback = setTimeout(() => setHydrated(true), 3000);
    return () => { unsub(); clearTimeout(fallback); };
  }, []);

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  return (
    <GestureHandlerRootView style={styles.root}>
      <StatusBar style={palette.isDark ? 'light' : 'dark'} />
      {!ready ? (
        // Deliberately renders nothing route-related until rehydration has
        // resolved. This is what actually closes the data-loss race: the
        // route tree (and every effect/action a screen could fire on mount)
        // simply does not exist yet. It also keeps the very first client
        // render identical to the SSR render (server has no localStorage, so
        // it renders this same empty branch), avoiding the hydration
        // mismatch that used to show up as React errors #418/#422.
        <View style={[styles.root, { backgroundColor: palette.bg }]} />
      ) : (
        <Stack screenOptions={{ headerShown: false, animation: 'fade_from_bottom' }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
          {/* Goal screens (goal/[id]/*) now live inside this — nested under
              the Board tab's own stack (app/(tabs)/board/_layout.tsx) so the
              bottom tab bar stays visible while a goal is open. Their
              per-screen animations moved there with them. */}
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="completed" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="how-to-use" options={{ animation: 'slide_from_right' }} />
        </Stack>
      )}
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
