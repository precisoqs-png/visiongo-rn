import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import type { Point } from '../board/RadialBoard';

const CONFETTI_COUNT = 8;
// How long the pop + confetti burst plays before the bubble starts flying to
// the column — long enough to read as its own beat, not just a blip before
// the motion starts.
const POP_MS = 620;
const FLY_MS = 480;

// Generic version of the pop/confetti/fly-to-column animation RadialBoard
// built for a completing goal (PR #25) — lifted out so the per-goal canvas
// can play the exact same beat for a completing measurable/milestone
// instead of reimplementing it. Callers own their own layout (where "from"
// and "target" are) and their own color/id; this only owns the motion.
export function CompletionFlight({
  id, color, from, size, target, chipSize, onDone,
}: {
  id: string; color: string; from: Point; size: number; target: Point; chipSize: number;
  onDone: () => void;
}) {
  const pop = useRef(new Animated.Value(0.7)).current;
  const flyX = useRef(new Animated.Value(0)).current;
  const flyY = useRef(new Animated.Value(0)).current;
  const flyScale = useRef(new Animated.Value(1)).current;
  const confetti = useRef(
    Array.from({ length: CONFETTI_COUNT }, (_, i) => ({
      progress: new Animated.Value(0),
      angle: (i / CONFETTI_COUNT) * Math.PI * 2 + Math.random() * 0.4,
    })),
  ).current;

  useEffect(() => {
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
    // Pop: overshoot past full size, then settle — the "pop" itself.
    Animated.sequence([
      Animated.timing(pop, { toValue: 1.3, duration: 200, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.spring(pop, { toValue: 1, useNativeDriver: true, damping: 8, stiffness: 180 }),
    ]).start();
    Animated.parallel(
      confetti.map((c) => Animated.timing(c.progress, {
        toValue: 1, duration: 560, easing: Easing.out(Easing.quad), useNativeDriver: true,
      })),
    ).start();

    const dx = target.x - from.x;
    const dy = target.y - from.y;
    const targetScale = chipSize / size;
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(flyX, { toValue: dx, duration: FLY_MS, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
        Animated.timing(flyY, { toValue: dy, duration: FLY_MS, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
        Animated.timing(flyScale, { toValue: targetScale, duration: FLY_MS, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
      ]).start(() => onDone());
    }, POP_MS);
    return () => clearTimeout(timer);
    // Deliberately runs once — from/target/size are the values captured at
    // the moment the transition was detected and never change mid-flight.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', left: from.x - size / 2, top: from.y - size / 2, width: size, height: size }}
    >
      <Animated.View
        style={{
          width: size, height: size, borderRadius: size / 2,
          transform: [{ translateX: flyX }, { translateY: flyY }, { scale: Animated.multiply(pop, flyScale) }],
        }}
      >
        <View
          style={{
            width: size, height: size, borderRadius: size / 2,
            // Solid, not a wash — a translucent fill read as "empty" at a
            // glance, indistinguishable from an in-progress bubble that
            // just happens to be light. A finished thing should look
            // unambiguously finished.
            backgroundColor: color,
            borderColor: color, borderWidth: 1.5,
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Ionicons
            name="checkmark"
            size={size * 0.32}
            color="#fff"
            style={checkmarkShadow}
          />
        </View>
      </Animated.View>
      {confetti.map((c, i) => {
        const dist = size * 0.85;
        const tx = Math.cos(c.angle) * dist;
        const ty = Math.sin(c.angle) * dist;
        return (
          <Animated.View
            key={i}
            style={{
              position: 'absolute', left: size / 2 - 4, top: size / 2 - 4,
              width: 7, height: 7, borderRadius: 2,
              backgroundColor: color,
              opacity: c.progress.interpolate({ inputRange: [0, 0.65, 1], outputRange: [1, 1, 0] }),
              transform: [
                { translateX: c.progress.interpolate({ inputRange: [0, 1], outputRange: [0, tx] }) },
                { translateY: c.progress.interpolate({ inputRange: [0, 1], outputRange: [0, ty] }) },
                { rotate: c.progress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '200deg'] }) },
              ],
            }}
          />
        );
      })}
    </View>
  );
}

// A labeled resting chip in a completed column — shared between the board's
// whole-goal column and the per-goal canvas's measurable/milestone column.
// Unlike the small unlabeled circle this replaces, it always shows its own
// name so a glance at the column says WHAT finished, not just how many.
// GOAL_NOTE_COLORS (theme/themes.ts) are all pale pastels, and are the same
// fixed set regardless of which theme/palette is active — so the label
// color that reads against them is fixed too, not theme-derived. Tried
// `p.ink` first, but ink itself flips light/dark per theme (it's a button
// background color, not a guaranteed-dark text color), so on a dark theme
// it can be just as pale as the pastel it would sit on. A dedicated
// constant is the only thing that's actually reliable here.
const CHIP_LABEL_COLOR = '#2b2b2b';

export function CompletedChip({
  label, color, size, left, top, onPress,
}: {
  label: string; color: string; size: number; left: number; top: number; onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityLabel={`${label}, completed`}
      style={[
        styles.chip,
        {
          left, top, width: size, height: size, borderRadius: size / 2,
          // Solid fill (not the old 35% wash) so a finished chip is
          // unmistakably distinct from an in-progress bubble at a glance —
          // white text/icon on top needs the fill to actually be dark/
          // saturated enough to read against, which a translucent tint
          // over the page background couldn't guarantee for every note
          // color (some GOAL_NOTE_COLORS are pale pastels).
          backgroundColor: color,
          borderColor: color,
        },
        Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : undefined,
      ]}
    >
      <Ionicons
        name="checkmark"
        size={Math.max(11, size * 0.22)}
        color="#fff"
        style={checkmarkShadow}
      />
      <Text
        numberOfLines={1}
        style={[styles.chipLabel, { color: CHIP_LABEL_COLOR, fontSize: Math.max(9, size * 0.15) }]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

// A pale GOAL_NOTE_COLORS pastel behind a pure-white glyph can still read
// low-contrast — this subtle dark shadow keeps the tick/label legible
// against every note color without needing a per-color contrast branch.
const checkmarkShadow = {
  textShadowColor: 'rgba(0,0,0,0.35)',
  textShadowOffset: { width: 0, height: 1 },
  textShadowRadius: 2,
};

const styles = StyleSheet.create({
  chip: {
    position: 'absolute', borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
  },
  chipLabel: { fontWeight: '700', textAlign: 'center', marginTop: 2 },
});
