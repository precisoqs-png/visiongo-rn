import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { YearData, yearOverallProgress, isCompleted, goalProgress } from '../../store/models';
import { Palette, FONTS } from '../../theme/themes';
import { ProgressRing } from '../shared/ProgressRing';
import { GoalNote } from './GoalNote';

interface Props {
  yearData: YearData;
  palette: Palette;
  onGoalPress: (id: string) => void;
  onAddGoal: () => void;
  onCompletedPress: () => void;
}

const CENTER_SIZE = 132;
const MIN_BUBBLE = 70;
const MAX_BUBBLE = 102;

// Deterministic scatter — reproducible per index so bubbles don't jump on re-render
function seededRand(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function bubbleLayout(
  idx: number,
  total: number,
  cx: number,
  cy: number,
  minR: number,
  maxR: number,
) {
  const base = -90 + idx * (360 / Math.max(total, 1));
  // ±30° jitter per bubble, deterministic
  const jitter = (seededRand(idx * 3 + 1) - 0.5) * 60;
  const angle = ((base + jitter) * Math.PI) / 180;
  const r = minR + seededRand(idx * 7 + 5) * (maxR - minR);
  return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
}

export function RadialBoard({ yearData, palette, onGoalPress, onAddGoal, onCompletedPress }: Props) {
  const [size, setSize] = useState({ w: 390, h: 420 });

  const activeGoals = yearData.goals.filter((g) => !isCompleted(g));
  const completedCount = yearData.goals.filter((g) => isCompleted(g)).length;
  const overallProg = yearOverallProgress(yearData);
  const pct = Math.round(overallProg * 100);

  const cx = size.w / 2;
  // Nudge center slightly above midpoint so bubbles don't clip bottom nav
  const cy = size.h * 0.45;
  const minR = size.w * 0.27;
  const maxR = size.w * 0.43;

  return (
    <View
      style={{ flex: 1 }}
      onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
    >
      {/* Center circle */}
      <View
        style={[
          styles.centerWrap,
          { left: cx - CENTER_SIZE / 2, top: cy - CENTER_SIZE / 2 },
        ]}
      >
        <ProgressRing
          size={CENTER_SIZE}
          progress={overallProg}
          trackColor={palette.line}
          fillColor={palette.accent}
          strokeWidth={5}
        />
        <View
          style={[
            styles.centerInner,
            {
              width: CENTER_SIZE - 12,
              height: CENTER_SIZE - 12,
              borderRadius: (CENTER_SIZE - 12) / 2,
              backgroundColor: palette.surface,
            },
          ]}
        >
          <Text style={[styles.yearText, { color: palette.text }]}>{yearData.year}</Text>
          <Text style={[styles.pctNum, { color: palette.accent }]}>{pct}%</Text>
          <Text style={[styles.thereLabel, { color: palette.muted }]}>there</Text>
        </View>
      </View>

      {/* Goal bubbles — scattered organically around center */}
      {activeGoals.map((goal, idx) => {
        const prog = goalProgress(goal);
        // Bigger bubble = more progress (shows movement toward goal)
        const bubbleSize = Math.round(MIN_BUBBLE + prog * (MAX_BUBBLE - MIN_BUBBLE));
        const { x, y } = bubbleLayout(idx, activeGoals.length, cx, cy, minR, maxR);
        return (
          <View
            key={goal.id}
            style={{
              position: 'absolute',
              left: x - bubbleSize / 2,
              top: y - bubbleSize / 2,
            }}
          >
            <GoalNote
              goal={goal}
              size={bubbleSize}
              palette={palette}
              onPress={() => onGoalPress(goal.id)}
              animDelay={idx * 70}
            />
          </View>
        );
      })}

      {/* Completed badge — bottom left */}
      {completedCount > 0 && (
        <TouchableOpacity
          style={[styles.completedPill, { backgroundColor: palette.accent }]}
          onPress={onCompletedPress}
          activeOpacity={0.8}
        >
          <Ionicons name="checkmark-circle" size={14} color={palette.surface} style={{ marginRight: 5 }} />
          <Text style={[styles.pillText, { color: palette.surface }]}>
            Completed {completedCount}
          </Text>
        </TouchableOpacity>
      )}

      {/* FAB — bottom right */}
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: palette.ink }]}
        onPress={onAddGoal}
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={26} color={palette.isDark ? palette.bg : '#fff'} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  centerWrap: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerInner: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  yearText: {
    fontSize: 30,
    fontWeight: '700',
    fontFamily: FONTS.display,
    lineHeight: 34,
  },
  pctNum: {
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 18,
  },
  thereLabel: {
    fontSize: 10,
    letterSpacing: 0.5,
  },
  completedPill: {
    position: 'absolute',
    bottom: 16,
    left: 20,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 22,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 4,
  },
  pillText: { fontSize: 13, fontWeight: '600' },
  fab: {
    position: 'absolute',
    bottom: 16,
    right: 20,
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
  },
});
