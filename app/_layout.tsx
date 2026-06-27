import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet } from 'react-native';
import { useThemeStore } from '../store/useThemeStore';
import { useAppStore } from '../store/useAppStore';
import { buildSeedData } from '../store/models';

export default function RootLayout() {
  const palette = useThemeStore((s) => s.palette);
  const years = useAppStore((s) => s.years);

  // Seed data on first run if empty after rehydration
  useEffect(() => {
    if (years.length === 0) {
      useAppStore.setState({ years: buildSeedData() });
    }
  }, []);

  return (
    <GestureHandlerRootView style={styles.root}>
      <StatusBar style={palette.isDark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, animation: 'fade_from_bottom' }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="goal/[id]" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="completed" options={{ animation: 'slide_from_right' }} />
      </Stack>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
