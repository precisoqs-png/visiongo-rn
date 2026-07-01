import React, { useEffect, useRef } from 'react';
import { Animated, Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import { Goal, goalProgress, goalProgressPercent } from '../../store/models';
import { Palette, GOAL_NOTE_COLORS, hexAlpha, FONTS } from '../../theme/themes';

interface Props {
  goal: Goal;
  size: number;
  palette: Palette;
  onPress: () => void;
  animDelay?: number;
}

export function GoalNote({ goal, size, palette, onPress, animDelay = 0 }: Props) {
  const scale = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const noteColor = GOAL_NOTE_COLORS[goal.colorIndex % GOAL_NOTE_COLORS.length];
  const progress = goalProgress(goal);
  const pct = goalProgressPercent(goal);

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
      <TouchableOpacity onPress={onPress} activeOpacity={0.8}>
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
          {/* Bottom fill — use the bubble's own color, not global accent */}
          <View
            style={{
              position: 'absolute',
              bottom: 0, left: 0, right: 0,
              height: fillHeight,
              backgroundColor: hexAlpha(noteColor, 0.72),
            }}
          />
          {/* Label */}
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
});
