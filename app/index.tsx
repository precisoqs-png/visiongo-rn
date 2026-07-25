import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Redirect } from 'expo-router';
import { useAppStore } from '../store/useAppStore';
import { useThemeStore } from '../store/useThemeStore';

export default function Index() {
  const hasCompletedOnboarding = useAppStore((s) => s.hasCompletedOnboarding);
  const bg = useThemeStore((s) => s.palette.bg);
  const [hydrated, setHydrated] = useState(useAppStore.persist.hasHydrated());

  useEffect(() => {
    const unsub = useAppStore.persist.onFinishHydration(() => setHydrated(true));
    if (useAppStore.persist.hasHydrated()) setHydrated(true);
    return unsub;
  }, []);

  // Don't route until storage has rehydrated — otherwise returning users
  // briefly land in onboarding before their saved flag loads.
  if (!hydrated) return <View style={{ flex: 1, backgroundColor: bg }} />;

  return hasCompletedOnboarding
    ? <Redirect href="/(tabs)/board" />
    : <Redirect href="/onboarding" />;
}
