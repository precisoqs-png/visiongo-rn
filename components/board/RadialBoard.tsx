import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Goal, YearData, yearOverallProgress, isCompleted } from '../../store/models';
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

const BOARD_SIZE = Math.min(Dimensions.get('window').width, 390);
const CENTER_SIZE = 110;
const NOTE_SIZE = 80;

export function RadialBoard({ yearData, palette, onGoalPress, onAddGoal, onCompletedPress }: Props) {
  const activeGoals = yearData.goals.filter((g) => !isCompleted(g));
  const completedCount = yearData.goals.filter((g) => isCompleted(g)).length;
  const overallProg = yearOverallProgress(yearData);
  const pct = Math.round(overallProg * 100);

  const cx = BOARD_SIZE / 2;
  const cy = 190;
  const radius = BOARD_SIZE * 0.37;
  const n = Math.max(activeGoals.length, 1);

  return (
    <View style={{ width: BOARD_SIZE, height: 380 }}>
      {/* Center circle */}
      <View style={[styles.center, { left: cx - CENTER_SIZE / 2, top: cy - CENTER_SIZE / 2 }]}>
        <ProgressRing
          size={CENTER_SIZE}
          progress={overallProg}
          trackColor={palette.line}
          fillColor={palette.accent}
          strokeWidth={4}
        />
        <View style={[styles.centerInner, { width: CENTER_SIZE - 8, height: CENTER_SIZE - 8, borderRadius: (CENTER_SIZE - 8) / 2, backgroundColor: palette.surface }]}>
          <Text style={[styles.yearText, { color: palette.text }]}>{yearData.year}</Text>
          <Text style={[styles.pctText, { color: palette.muted }]}>{pct}% there</Text>
        </View>
      </View>

      {/* Goal notes at polar positions */}
      {activeGoals.map((goal, idx) => {
        const angleDeg = -90 + idx * (360 / n);
        const angleRad = (angleDeg * Math.PI) / 180;
        const x = cx + radius * Math.cos(angleRad);
        const y = cy + radius * Math.sin(angleRad);
        return (
          <View
            key={goal.id}
            style={{ position: 'absolute', left: x - NOTE_SIZE / 2, top: y - NOTE_SIZE / 2 }}
          >
            <GoalNote
              goal={goal}
              size={NOTE_SIZE}
              palette={palette}
              onPress={() => onGoalPress(goal.id)}
              animDelay={idx * 60}
            />
          </View>
        );
      })}

      {/* Completed pill */}
      {completedCount > 0 && (
        <TouchableOpacity
          style={[styles.completedPill, { backgroundColor: palette.accent }]}
          onPress={onCompletedPress}
          activeOpacity={0.8}
        >
          <Ionicons name="checkmark" size={12} color={palette.surface} style={{ marginRight: 4 }} />
          <Text style={[styles.pillText, { color: palette.surface }]}>Completed {completedCount}</Text>
        </TouchableOpacity>
      )}

      {/* FAB */}
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: palette.ink }]}
        onPress={onAddGoal}
        activeOpacity={0.8}
      >
        <Ionicons name="add" size={24} color={palette.isDark ? palette.bg : '#fff'} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
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
    fontSize: 28,
    fontWeight: '700',
    fontFamily: FONTS.display,
  },
  pctText: {
    fontSize: 11,
    marginTop: 1,
  },
  completedPill: {
    position: 'absolute',
    bottom: 12,
    left: 20,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  pillText: { fontSize: 13, fontWeight: '600' },
  fab: {
    position: 'absolute',
    bottom: 12,
    right: 20,
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
});
