import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Goal, YearData, goalProgress, goalProgressPercent, isCompleted } from '../../store/models';
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

  const noDateActive = yearData.goals.filter((g) => !g.targetDate && !isCompleted(g));
  const noDateCompleted = yearData.goals.filter((g) => !g.targetDate && isCompleted(g));

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 32, paddingHorizontal: 16 }}>
      {noDateActive.length > 0 && (
        <MonthSection label="NO TARGET DATE" isNow={false} palette={palette}>
          <GoalCardGrid goals={noDateActive} palette={palette} onGoalPress={onGoalPress} />
        </MonthSection>
      )}

      {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => {
        const mGoals = goalsForMonth(month);
        const isNow = month === currentMonth && yearData.year === currentYear;
        return (
          <MonthSection key={month} label={MONTHS[month - 1].toUpperCase()} isNow={isNow} palette={palette}>
            {mGoals.length === 0 ? (
              <Text style={[styles.emptyMonth, { color: palette.muted }]}>No goals</Text>
            ) : (
              <GoalCardGrid goals={mGoals} palette={palette} onGoalPress={onGoalPress} />
            )}
          </MonthSection>
        );
      })}

      {noDateCompleted.length > 0 && (
        <MonthSection label="COMPLETED" isNow={false} palette={palette}>
          <GoalCardGrid goals={noDateCompleted} palette={palette} onGoalPress={onGoalPress} />
        </MonthSection>
      )}
    </ScrollView>
  );
}

function MonthSection({
  label, isNow, palette, children,
}: { label: string; isNow: boolean; palette: Palette; children: React.ReactNode }) {
  return (
    <View style={styles.monthSection}>
      <View style={styles.sectionHeader}>
        <Text style={[styles.monthLabel, { color: palette.muted }]}>{label}</Text>
        {isNow && (
          <View style={[styles.nowBadge, { backgroundColor: palette.accent }]}>
            <Text style={[styles.nowText, { color: palette.surface }]}>NOW</Text>
          </View>
        )}
        <View style={[styles.rule, { backgroundColor: palette.line }]} />
      </View>
      {children}
    </View>
  );
}

function GoalCardGrid({
  goals, palette, onGoalPress,
}: { goals: Goal[]; palette: Palette; onGoalPress: (id: string) => void }) {
  return (
    <View style={styles.cardGrid}>
      {goals.map((goal) => (
        <GoalCard key={goal.id} goal={goal} palette={palette} onPress={() => onGoalPress(goal.id)} />
      ))}
    </View>
  );
}

function GoalCard({ goal, palette, onPress }: { goal: Goal; palette: Palette; onPress: () => void }) {
  const noteColor = GOAL_NOTE_COLORS[goal.colorIndex % GOAL_NOTE_COLORS.length];
  const prog = goalProgress(goal);
  const pct = goalProgressPercent(goal);
  const done = isCompleted(goal);

  return (
    <TouchableOpacity
      style={[
        styles.card,
        {
          backgroundColor: hexAlpha(noteColor, done ? 0.1 : 0.18),
          borderColor: done ? palette.accent : noteColor,
          borderWidth: done ? 2 : 1.5,
        },
      ]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      {/* Color fill bar at top */}
      <View
        style={[
          styles.cardFill,
          {
            width: `${Math.max(2, prog * 100)}%` as any,
            backgroundColor: hexAlpha(done ? palette.accent : noteColor, done ? 0.5 : 0.7),
          },
        ]}
      />

      <View style={styles.cardBody}>
        {done ? (
          <Ionicons name="checkmark-circle" size={18} color={palette.accent} style={{ marginBottom: 4 }} />
        ) : (
          <Text style={[styles.cardPct, { color: noteColor }]}>{pct}%</Text>
        )}
        <Text style={[styles.cardTitle, { color: palette.text }]} numberOfLines={3}>
          {goal.title}
        </Text>
        {done && (
          <Text style={[styles.doneLabel, { color: palette.accent }]}>Done</Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  monthSection: { marginTop: 16 },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10,
  },
  monthLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 1.5 },
  nowBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  nowText: { fontSize: 9, fontWeight: '700', letterSpacing: 1 },
  rule: { flex: 1, height: 1 },
  emptyMonth: { fontSize: 12, paddingBottom: 4 },
  cardGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 10,
  },
  card: {
    width: '30.5%',
    borderRadius: 12,
    overflow: 'hidden',
    minHeight: 90,
  },
  cardFill: {
    height: 3,
    borderRadius: 3,
  },
  cardBody: {
    padding: 10,
  },
  cardPct: { fontSize: 13, fontWeight: '800', marginBottom: 4 },
  cardTitle: { fontSize: 11, lineHeight: 15, fontWeight: '500' },
  doneLabel: { fontSize: 9, fontWeight: '700', marginTop: 4, letterSpacing: 0.5 },
});
