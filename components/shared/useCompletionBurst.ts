import { useRef } from 'react';
import { Animated } from 'react-native';
import * as Haptics from 'expo-haptics';

// A brief celebratory ring burst — expands and fades out around whatever it's
// laid over, for the moment a measurable (or a whole goal) actually finishes,
// as distinct from useCompletionPulse's small per-tap scale bounce. Built on
// bare Animated (no new deps) to match the rest of the app's animation style.
export function useCompletionBurst() {
  const scale = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  const fire = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    scale.setValue(0);
    opacity.setValue(1);
    Animated.parallel([
      Animated.timing(scale, { toValue: 1, duration: 550, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0, duration: 550, useNativeDriver: true }),
    ]).start();
  };

  return { scale, opacity, fire };
}
