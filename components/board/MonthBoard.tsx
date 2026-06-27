import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { Goal, YearData, goalProgress, goalProgressPercent } from '../../store/models';
import { Palette, GOAL_NOTE_COLORS, hexAlpha, FONTS } from '../../theme/themes';

interface Props {
  yearData: YearData;
  palette: Palette;
  onGoalPress: (id: string) => void;
}

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

export function MonthBoard({ yearData, palette, onGoalPress }: Props) {
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  const goalsForMonth = (month: number) =>
    yearData.goals.filter((g) => {
      if (!g.targetDate) return false;
      const d = new Date(g.targetDate);
      return d.getMonth() + 1 === month;
    });

  const noDate = yearData.goals.filter((g) => !g.targetDate);

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 20 }}>
      {noDate.length > 0 && (
        <>
          <SectionHeader label="NO TARGET DATE YET" isNow={false} palette={palette} />
          <BubbleRow goals={noDate} palette={palette} onGoalPress={onGoalPress} />
        </>
      )}
      {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => {
        const mGoals = goalsForMonth(month);
        const isNow = month === currentMonth && yearData.year === currentYear;
        return (
          <React.Fragment key={month}>
            <SectionHeader
              label={MONTHS[month - 1].toUpperCase()}
              isNow={isNow}
              palette={palette}
            />
            {mGoals.length === 0 ? (
              <Text style={[styles.empty, { color: palette.muted }]}>No goals this month</Text>
            ) : (
              <BubbleRow goals={mGoals} palette={palette} onGoalPress={onGoalPress} />
            )}
          </React.Fragment>
        );
      })}
    </ScrollView>
  );
}

function SectionHeader({ label, isNow, palette }: { label: string; isNow: boolean; palette: Palette }) {
  return (
    <View style={styles.headerRow}>
      <Text style={[styles.headerText, { color: palette.muted }]}>{label}</Text>
      {isNow && (
        <View style={[styles.nowBadge, { backgroundColor: palette.accent }]}>
          <Text style={[styles.nowText, { color: palette.surface }]}>NOW</Text>
        </View>
      )}
      <View style={[styles.rule, { backgroundColor: palette.line }]} />
    </View>
  );
}

function BubbleRow({ goals, palette, onGoalPress }: { goals: Goal[]; palette: Palette; onGoalPress: (id: string) => void }) {
  const size = 66;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
      <View style={{ flexDirection: 'row', paddingHorizontal: 20, gap: 10 }}>
        {goals.map((goal) => {
          const prog = goalProgress(goal);
          const pct = goalProgressPercent(goal);
          const noteColor = GOAL_NOTE_COLORS[goal.colorIndex % GOAL_NOTE_COLORS.length];
          return (
            <TouchableOpacity
              key={goal.id}
              onPress={() => onGoalPress(goal.id)}
              activeOpacity={0.8}
            >
              <View
                style={{
                  width: size, height: size, borderRadius: size / 2,
                  backgroundColor: hexAlpha(noteColor, 0.25),
                  borderColor: noteColor, borderWidth: 1.5,
                  overflow: 'hidden',
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                <View
                  style={{
                    position: 'absolute', bottom: 0, left: 0, right: 0,
                    height: size * prog,
                    backgroundColor: hexAlpha(palette.accent, 0.62),
                  }}
                />
                <Text style={{ fontSize: 12, fontWeight: '700', color: palette.text, zIndex: 1 }}>
                  {pct}%
                </Text>
                <Text
                  style={{ fontSize: 9, color: palette.text, textAlign: 'center', paddingHorizontal: 3, zIndex: 1 }}
                  numberOfLines={2}
                >
                  {goal.title}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 8,
  },
  headerText: { fontSize: 11, fontWeight: '600', letterSpacing: 1.5 },
  nowBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  nowText: { fontSize: 9, fontWeight: '700', letterSpacing: 1 },
  rule: { flex: 1, height: 1 },
  empty: { fontSize: 13, paddingHorizontal: 20, paddingBottom: 12 },
});
