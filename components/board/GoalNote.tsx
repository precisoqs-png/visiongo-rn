import React, { useEffect, useRef } from 'react';
import { Animated, Text, TouchableOpacity, View, StyleSheet, Platform } from 'react-native';
import { Goal, goalProgress, goalProgressPercent, milestoneCheckpoints } from '../../store/models';
import { Palette, GOAL_NOTE_COLORS, hexAlpha, FONTS } from '../../theme/themes';

interface Props {
  goal: Goal;
  size: number;
  palette: Palette;
  onPress: () => void;
  onLongPress?: () => void;
  onPressOut?: () => void;
  animDelay?: number;
}

const MAX_DOTS = 6;

export function GoalNote({ goal, size, palette, onPress, onLongPress, onPressOut, animDelay = 0 }: Props) {
  const scale = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const noteColor = GOAL_NOTE_COLORS[goal.colorIndex % GOAL_NOTE_COLORS.length];
  const progress = goalProgress(goal);
  const pct = goalProgressPercent(goal);
  // Milestones now blend into the fill too (see goalProgress), but they're
  // still surfaced separately as a small tick-mark row of discrete
  // checkpoints. Capped at MAX_DOTS so a goal with a dozen milestones
  // doesn't overrun a small bubble; the rest just count toward the label
  // past that point.
  const { done: milestonesDone, total: milestonesTotal } = milestoneCheckpoints(goal);

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, {
        toValue: 1,
        delay: animDelay,
        useNativeDriver: true,
        damping: 10,
        stiffness: 120,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 300,
        delay: animDelay,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const fillHeight = size * progress;

  return (
    <Animated.View style={[{ transform: [{ scale }], opacity }, styles.wrapper]}>
      <TouchableOpacity
        onPress={onPress}
        onLongPress={onLongPress}
        onPressOut={onPressOut}
        delayLongPress={400}
        activeOpacity={0.8}
        style={Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : undefined}
      >
        <View
          style={[
            styles.circle,
            {
              width: size, height: size, borderRadius: size / 2,
              backgroundColor: hexAlpha(noteColor, 0.25),
              borderColor: noteColor,
              borderWidth: 1.5,
              overflow: 'hidden',
            },
          ]}
        >
          <View
            style={{
              position: 'absolute',
              bottom: 0, left: 0, right: 0,
              height: fillHeight,
              backgroundColor: hexAlpha(noteColor, 0.72),
            }}
          />
          <View style={styles.labelContainer}>
            <Text style={[styles.pct, { color: palette.text, fontSize: size * 0.18 }]}>
              {pct}%
            </Text>
            <Text
              style={[styles.title, { color: palette.text, fontSize: size * 0.13 }]}
              numberOfLines={2}
            >
              {goal.title}
            </Text>
            {milestonesTotal > 0 && (
              <View style={styles.checkpointRow}>
                {Array.from({ length: Math.min(milestonesTotal, MAX_DOTS) }, (_, i) => (
                  <View
                    key={i}
                    style={[
                      styles.checkpointDot,
                      {
                        width: Math.max(3, size * 0.045), height: Math.max(3, size * 0.045),
                        borderRadius: Math.max(3, size * 0.045) / 2,
                        backgroundColor: i < milestonesDone ? noteColor : 'transparent',
                        borderColor: noteColor,
                      },
                    ]}
                  />
                ))}
                {milestonesTotal > MAX_DOTS && (
                  <Text style={[styles.checkpointOverflow, { color: palette.text, fontSize: size * 0.08 }]}>
                    +{milestonesTotal - MAX_DOTS}
                  </Text>
                )}
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: { alignItems: 'center', justifyContent: 'center' },
  circle: { alignItems: 'center', justifyContent: 'center' },
  labelContainer: { alignItems: 'center', paddingHorizontal: 4, zIndex: 1 },
  pct: { fontWeight: '700', textAlign: 'center' },
  title: { textAlign: 'center', marginTop: 1 },
  checkpointRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 4 },
  checkpointDot: { borderWidth: 1 },
  checkpointOverflow: { fontWeight: '700', marginLeft: 1 },
});
