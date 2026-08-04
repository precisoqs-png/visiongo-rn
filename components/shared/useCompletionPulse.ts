import { useRef } from 'react';
import { Animated } from 'react-native';
import * as Haptics from 'expo-haptics';

// Shared "just completed" feedback for checkbox-style toggles across the goal
// detail screen (Measurables, Milestones, step check-ins): a light haptic tap
// plus a quick scale pulse. Fires only on the false -> true transition, never
// on undo, so unchecking something never feels like a reward.
export function useCompletionPulse() {
  const scale = useRef(new Animated.Value(1)).current;

  const pulse = (nowDone: boolean) => {
    if (!nowDone) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    scale.setValue(1);
    Animated.sequence([
      Animated.timing(scale, { toValue: 1.35, duration: 110, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 4, tension: 120 }),
    ]).start();
  };

  return { scale, pulse };
}
