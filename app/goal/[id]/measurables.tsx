import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet, Platform, KeyboardAvoidingView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeStore } from '../../../store/useThemeStore';
import { useAppStore } from '../../../store/useAppStore';
import { GOAL_NOTE_COLORS, hexAlpha } from '../../../theme/themes';
import { goalProgress, goalProgressPercent, Measurable, Cadence, StepSchedule, DEFAULT_SCHEDULE } from '../../../store/models';
import { MeasurableCard } from '../../../components/goal/MeasurableCard';
import { AddMeasurableForm } from '../../../components/goal/AddMeasurableForm';
import { CoachChat } from '../../../components/goal/CoachChat';
import { InfoPopover } from '../../../components/shared/InfoPopover';
import { StepScheduleSheet } from '../../../components/goal/StepScheduleSheet';
import {
  syncWeeklyTargetNotifications, syncMeasurableReminders,
  requestNotificationPermission, alertNotificationsUnavailable,
} from '../../../services/notificationService';

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

  // Same reminder capability as a Milestone's Commitment, reusing
  // StepScheduleSheet + the notification-scheduling logic unchanged — the
  // sheet stays open on one measurable at a time, driven from here rather
  // than per-card, so permission-requesting stays in one place.
  const [scheduleForMeasurable, setScheduleForMeasurable] = useState<Measurable | null>(null);

  const resyncMeasurableNotifications = () => {
    const fresh = useAppStore.getState().getGoal(id!);
    if (fresh && useAppStore.getState().notificationsMasterOn) {
      void syncMeasurableReminders(fresh);
    }
  };

  const saveMeasurableSchedule = async (
    patch: { cadence: Cadence; intervalDays?: number; schedule: StepSchedule },
  ) => {
    const m = scheduleForMeasurable;
    if (!m) return;
    if (patch.schedule.on) {
      const granted = await requestNotificationPermission();
      if (!granted) {
        alertNotificationsUnavailable();
        updateMeasurable({ ...m, ...patch, schedule: { ...patch.schedule, on: false } }, id!);
        setScheduleForMeasurable(null);
        return;
      }
    }
    updateMeasurable({ ...m, ...patch }, id!);
    setScheduleForMeasurable(null);
    resyncMeasurableNotifications();
  };

  const turnOffMeasurableReminder = () => {
    const m = scheduleForMeasurable;
    if (!m) return;
    updateMeasurable({ ...m, schedule: { ...(m.schedule ?? DEFAULT_SCHEDULE), on: false } }, id!);
    setScheduleForMeasurable(null);
    resyncMeasurableNotifications();
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
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
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
          <View style={styles.eyebrowRow}>
            <Text style={[styles.eyebrow, { color: p.muted }]}>MEASURABLES</Text>
            <InfoPopover
              palette={p}
              title="Measurables vs Milestones"
              body={
                'Measurables are quick, directly-trackable items on this goal itself — a ' +
                'checkbox ("Sign up for a race"), a running number ("145/150 days active"), ' +
                'or a weekly build-up. A good measurable is concrete and countable: a ' +
                'specific unit and target you can tick up as you go, with no sub-goal of ' +
                'its own.\n\n' +
                'Milestones are sub-goals — "Save $10,000", "Run a marathon" — that can carry ' +
                "their own deadline and a recurring Commitment you get reminded about on a " +
                'schedule. Reach for a Milestone when a piece of the goal deserves its own ' +
                'repeatable action, not just a one-time tick.'
              }
            />
          </View>
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
                noteColor={noteColor}
                onUpdate={(m) => { updateMeasurable(m, goal.id); resyncWeekNotifications(); }}
                onDelete={(mid) => { deleteMeasurable(mid, goal.id); resyncWeekNotifications(); }}
                onOpenSchedule={(m) => setScheduleForMeasurable(m)}
              />
            ))
          )}
        </View>

        <View style={styles.section}>
          <AddMeasurableForm
            palette={p}
            goalTargetDate={goal.targetDate}
            onAdd={(m) => { addMeasurable(m, goal.id); resyncWeekNotifications(); }}
          />
        </View>

        <View style={styles.section}>
          <CoachChat goal={goal} palette={p} onGoalEdited={resyncWeekNotifications} />
        </View>
      </ScrollView>
      </KeyboardAvoidingView>

      {/* Reminder sheet for a Measurable — same component + logic as a
          Milestone Commitment's, just saving onto the measurable instead. */}
      <StepScheduleSheet
        visible={!!scheduleForMeasurable}
        step={scheduleForMeasurable}
        palette={p}
        onSave={(patch) => { void saveMeasurableSchedule(patch); }}
        onTurnOff={turnOffMeasurableReminder}
        onDismiss={() => setScheduleForMeasurable(null)}
      />
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
  eyebrowRow: { flexDirection: 'row', alignItems: 'center' },
  layerHint: { fontSize: 11, lineHeight: 15, marginTop: 4, marginBottom: 10 },
  emptyHint: { fontSize: 14, lineHeight: 20 },
});
