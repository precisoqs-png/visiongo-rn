import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet, View } from 'react-native';
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
    if (hydrated) SplashScreen.hideAsync().catch(() => {});
  }, [hydrated]);

  return (
    <GestureHandlerRootView style={styles.root}>
      <StatusBar style={palette.isDark ? 'light' : 'dark'} />
      {!hydrated ? (
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
          <Stack.Screen name="(tabs)" />
          {/* Not a modal: the canvas grows out of the tapped bubble (see
              RadialBoard's onPress) and shrinks back into it on the way out
              (see the goal canvas's handleBackToBoard) — a swipe-down
              dismissal would fight that illusion, so it's off entirely
              rather than just discouraged. A plain fade lets those two
              local scale animations carry the transition instead of a
              slide competing with them. */}
          <Stack.Screen
            name="goal/[id]/index"
            options={{ animation: 'fade', gestureEnabled: false }}
          />
          <Stack.Screen name="goal/[id]/milestones" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="goal/[id]/measurables" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="completed" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="how-to-use" options={{ animation: 'slide_from_right' }} />
        </Stack>
      )}
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
