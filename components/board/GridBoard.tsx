import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Goal, YearData, goalProgress, goalProgressPercent, isCompleted } from '../../store/models';
import { Palette, GOAL_NOTE_COLORS, hexAlpha, FONTS } from '../../theme/themes';

interface Props {
  yearData: YearData;
  palette: Palette;
  onGoalPress: (id: string) => void;
  onAddGoal: () => void;
}

export function GridBoard({ yearData, palette, onGoalPress, onAddGoal }: Props) {
  const active = yearData.goals.filter((g) => !isCompleted(g));

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 8, paddingBottom: 20 }}>
      {active.map((goal) => {
        const prog = goalProgress(goal);
        const pct = goalProgressPercent(goal);
        const noteColor = GOAL_NOTE_COLORS[goal.colorIndex % GOAL_NOTE_COLORS.length];
        const discSize = 44;

        return (
          <TouchableOpacity
            key={goal.id}
            style={[styles.row, { backgroundColor: palette.surface }]}
            onPress={() => onGoalPress(goal.id)}
            activeOpacity={0.75}
          >
            {/* Disc */}
            <View
              style={[
                styles.disc,
                {
                  width: discSize, height: discSize, borderRadius: discSize / 2,
                  backgroundColor: hexAlpha(noteColor, 0.25),
                  borderColor: noteColor, borderWidth: 1.5,
                  overflow: 'hidden',
                },
              ]}
            >
              <View
                style={{
                  position: 'absolute', bottom: 0, left: 0, right: 0,
                  height: discSize * prog,
                  backgroundColor: hexAlpha(palette.accent, 0.62),
                }}
              />
              <Text style={[styles.discPct, { color: palette.text }]}>{pct}%</Text>
            </View>

            {/* Text + bar */}
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: palette.text }]} numberOfLines={1}>
                {goal.title}
              </Text>
              <View style={[styles.track, { backgroundColor: palette.line }]}>
                <View
                  style={[
                    styles.fill,
                    { backgroundColor: palette.accent, width: `${prog * 100}%` },
                  ]}
                />
              </View>
            </View>

            <Ionicons name="chevron-forward" size={14} color={palette.muted} style={{ marginLeft: 8 }} />
          </TouchableOpacity>
        );
      })}

      <TouchableOpacity
        style={styles.addRow}
        onPress={onAddGoal}
        activeOpacity={0.7}
      >
        <Ionicons name="add-circle" size={22} color={palette.accent} style={{ marginRight: 8 }} />
        <Text style={[styles.addText, { color: palette.muted }]}>Add goal</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    marginBottom: 10,
    gap: 14,
  },
  disc: { alignItems: 'center', justifyContent: 'center' },
  discPct: { fontSize: 11, fontWeight: '700', zIndex: 1 },
  title: { fontSize: 15, fontWeight: '600', marginBottom: 5 },
  track: { height: 4, borderRadius: 2, overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2 },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  addText: { fontSize: 15 },
});
