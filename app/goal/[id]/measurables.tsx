import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeStore } from '../../../store/useThemeStore';
import { useAppStore } from '../../../store/useAppStore';
import { GOAL_NOTE_COLORS, hexAlpha } from '../../../theme/themes';
import { goalProgress, goalProgressPercent } from '../../../store/models';
import { MeasurableCard } from '../../../components/goal/MeasurableCard';
import { AddMeasurableForm } from '../../../components/goal/AddMeasurableForm';
import { CoachChat } from '../../../components/goal/CoachChat';
import { syncWeeklyTargetNotifications } from '../../../services/notificationService';

// The list-form view for Measurables — the only place to add one, since the
// bubble canvas itself has no "add" affordance. Editing/ticking a measurable
// here (MeasurableCard, unchanged) hits the same store action the canvas's
// bubbles and detail sheet use, so a change here shows up as a moved/filled
// bubble immediately on the canvas, and vice versa.
export default function MeasurablesListScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const palette = useThemeStore((s) => s.palette);
  const p = palette;

  const addMeasurable = useAppStore((s) => s.addMeasurable);
  const updateMeasurable = useAppStore((s) => s.updateMeasurable);
  const deleteMeasurable = useAppStore((s) => s.deleteMeasurable);

  const goal = useAppStore((s) =>
    s.years.find((y) => y.year === s.selectedYear)?.goals.find((g) => g.id === id),
  );

  // Same SSR/hydration gate as the canvas and milestones pages.
  const [hydrated, setHydrated] = useState(useAppStore.persist.hasHydrated());
  useEffect(() => {
    const unsub = useAppStore.persist.onFinishHydration(() => setHydrated(true));
    if (useAppStore.persist.hasHydrated()) setHydrated(true);
    return unsub;
  }, []);

  const resyncWeekNotifications = () => {
    const fresh = useAppStore.getState().getGoal(id!);
    if (fresh && useAppStore.getState().notificationsMasterOn) {
      void syncWeeklyTargetNotifications(fresh);
    }
  };

  if (!hydrated || !goal) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: p.bg }}>
        <Text style={{ color: p.muted }}>{hydrated ? 'Goal not found' : 'Loading…'}</Text>
      </View>
    );
  }

  const noteColor = GOAL_NOTE_COLORS[goal.colorIndex % GOAL_NOTE_COLORS.length];
  const pct = goalProgressPercent(goal);
  const progress = goalProgress(goal);

  return (
    <LinearGradient colors={p.bgGradient as any} style={styles.root}>
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
        <LinearGradient
          colors={[hexAlpha(noteColor, 0.4), hexAlpha(noteColor, 0.1)]}
          style={styles.headerGradient}
        >
          <View style={styles.navRow}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
              <Ionicons name="chevron-back" size={16} color={p.text} />
              <Text style={[styles.backText, { color: p.text }]}>Canvas</Text>
            </TouchableOpacity>
            <Text style={[styles.goalLabel, { color: p.muted }]}>GOAL · {useAppStore.getState().selectedYear}</Text>
            <View style={{ width: 40 }} />
          </View>
          <Text style={[styles.title, { color: p.text }]} numberOfLines={2}>{goal.title}</Text>
          <View style={styles.progRow}>
            <View style={{ flex: 1 }}>
              <View style={[styles.progTrack, { backgroundColor: p.line }]}>
                <View style={[styles.progFill, { backgroundColor: p.accent, width: `${progress * 100}%` }]} />
              </View>
            </View>
            <Text style={[styles.progPct, { color: p.accent }]}>{pct}%</Text>
          </View>
        </LinearGradient>

        <View style={styles.section}>
          <Text style={[styles.eyebrow, { color: p.muted }]}>MEASURABLES</Text>
          <Text style={[styles.layerHint, { color: p.muted }]}>
            Quick checklist items you track directly on this goal — the same ones shown as
            bubbles on the canvas. Add, edit, or remove them here.
          </Text>
          {goal.measurables.length === 0 ? (
            <Text style={[styles.emptyHint, { color: p.muted }]}>
              No measurables yet. Add one below or ask your coach.
            </Text>
          ) : (
            goal.measurables.map((m) => (
              <MeasurableCard
                key={m.id}
                measurable={m}
                goalTargetDate={goal.targetDate}
                palette={p}
                onUpdate={(m) => { updateMeasurable(m, goal.id); resyncWeekNotifications(); }}
                onDelete={(mid) => { deleteMeasurable(mid, goal.id); resyncWeekNotifications(); }}
              />
            ))
          )}
        </View>

        <View style={styles.section}>
          <AddMeasurableForm
            palette={p}
            onAdd={(m) => { addMeasurable(m, goal.id); resyncWeekNotifications(); }}
          />
        </View>

        <View style={styles.section}>
          <CoachChat goal={goal} palette={p} onGoalEdited={resyncWeekNotifications} />
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingTop: Platform.OS === 'ios' ? 50 : 30 },
  headerGradient: { paddingBottom: 16 },
  navRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12,
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  backText: { fontSize: 14, fontWeight: '500' },
  goalLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 1.5 },
  title: { fontSize: 22, fontWeight: '700', paddingHorizontal: 20, paddingBottom: 10 },
  progRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 20, paddingBottom: 4,
  },
  progTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progFill: { height: 6, borderRadius: 3 },
  progPct: { fontSize: 13, fontWeight: '700', textAlign: 'right' },
  section: { padding: 18 },
  eyebrow: { fontSize: 11, fontWeight: '600', letterSpacing: 1.5 },
  layerHint: { fontSize: 11, lineHeight: 15, marginTop: 4, marginBottom: 10 },
  emptyHint: { fontSize: 14, lineHeight: 20 },
});
