import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeStore } from '../store/useThemeStore';
import { useAppStore } from '../store/useAppStore';
import { isCompleted } from '../store/models';
import { GOAL_NOTE_COLORS, hexAlpha, FONTS } from '../theme/themes';

export default function CompletedScreen() {
  const router = useRouter();
  const palette = useThemeStore((s) => s.palette);
  const p = palette;
  const yd = useAppStore((s) => s.years.find((y) => y.year === s.selectedYear));
  const selectedYear = useAppStore((s) => s.selectedYear);

  const completedGoals = yd?.goals.filter((g) => isCompleted(g)) ?? [];

  return (
    <LinearGradient colors={p.bgGradient as any} style={styles.root}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={16} color={p.text} />
          <Text style={[styles.backText, { color: p.text }]}>Board</Text>
        </TouchableOpacity>
        <Text style={[styles.eyebrow, { color: p.muted }]}>{selectedYear}</Text>
        <Text style={[styles.title, { color: p.text, fontFamily: FONTS.display }]}>
          Your wins
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Counter card */}
        <View style={[styles.counterCard, { backgroundColor: p.surface }]}>
          <View style={[styles.counterBadge, { backgroundColor: p.accent }]}>
            <Ionicons name="trophy" size={22} color={p.surface} />
          </View>
          <View>
            <Text style={[styles.counterNum, { color: p.accent, fontFamily: FONTS.display }]}>
              {completedGoals.length}
            </Text>
            <Text style={[styles.counterLabel, { color: p.muted }]}>
              {completedGoals.length === 1 ? 'Goal Achieved!' : 'Goals Achieved!'}
            </Text>
          </View>
        </View>

        {completedGoals.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="flag-outline" size={40} color={`${p.muted}66`} />
            <Text style={[styles.emptyText, { color: p.muted }]}>
              No completed goals yet — keep going!
            </Text>
          </View>
        ) : (
          completedGoals.map((goal) => {
            const noteColor = GOAL_NOTE_COLORS[goal.colorIndex % GOAL_NOTE_COLORS.length];
            return (
              <TouchableOpacity
                key={goal.id}
                style={[styles.winRow, { backgroundColor: p.surface }]}
                onPress={() => router.navigate(`/board/goal/${goal.id}`)}
                activeOpacity={0.75}
              >
                <View
                  style={[
                    styles.winCheck,
                    { backgroundColor: hexAlpha(noteColor, 0.25), borderColor: noteColor },
                  ]}
                >
                  <Ionicons name="checkmark" size={18} color={p.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.winTitle, { color: p.text }]} numberOfLines={2}>
                    {goal.title}
                  </Text>
                  {goal.targetDate && (
                    <Text style={[styles.winMeta, { color: p.muted }]}>
                      Target: {new Date(goal.targetDate.slice(0, 10) + 'T00:00:00')
                        .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </Text>
                  )}
                </View>
                <Ionicons name="chevron-forward" size={14} color={p.muted} />
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingTop: Platform.OS === 'ios' ? 50 : 30 },
  header: { paddingHorizontal: 20, paddingBottom: 12 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, marginBottom: 10 },
  backText: { fontSize: 14, fontWeight: '500' },
  eyebrow: { fontSize: 11, fontWeight: '600', letterSpacing: 2 },
  title: { fontSize: 28, fontWeight: '700', marginTop: 2 },
  counterCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    marginHorizontal: 20, marginBottom: 16,
    borderRadius: 16, padding: 16,
  },
  counterBadge: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
  },
  counterNum: { fontSize: 26, fontWeight: '700', lineHeight: 30 },
  counterLabel: { fontSize: 13, fontWeight: '600' },
  winRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginHorizontal: 20, marginBottom: 10,
    borderRadius: 14, padding: 14,
  },
  winCheck: {
    width: 34, height: 34, borderRadius: 17, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
  },
  winTitle: { fontSize: 15, fontWeight: '600' },
  winMeta: { fontSize: 12, marginTop: 2 },
  empty: { alignItems: 'center', gap: 10, paddingTop: 40, paddingHorizontal: 40 },
  emptyText: { fontSize: 14, textAlign: 'center' },
});
