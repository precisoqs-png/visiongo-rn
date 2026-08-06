import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Platform, Alert, Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useThemeStore } from '../../../store/useThemeStore';
import { useAppStore } from '../../../store/useAppStore';
import { GOAL_NOTE_COLORS, hexAlpha, FONTS } from '../../../theme/themes';
import {
  goalProgress, goalProgressPercent, isCompleted, Commitment, Milestone,
} from '../../../store/models';
import { MilestoneSection } from '../../../components/goal/MilestoneSection';
import { CoachChat } from '../../../components/goal/CoachChat';
import { CalendarPicker } from '../../../components/shared/CalendarPicker';
import {
  requestNotificationPermission,
  scheduleGoalNotification,
  cancelGoalNotification,
  cancelWeeklyTargetNotifications,
  syncWeeklyTargetNotifications,
  syncCommitmentNotifications,
  cancelCommitmentNotification,
  cancelEverythingForGoal,
  alertNotificationsUnavailable,
} from '../../../services/notificationService';

function localDate(iso: string): Date {
  const [y, mo, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, mo - 1, d);
}

export default function GoalDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const palette = useThemeStore((s) => s.palette);
  const p = palette;

  const updateGoal = useAppStore((s) => s.updateGoal);
  const deleteGoal = useAppStore((s) => s.deleteGoal);
  const addMilestone = useAppStore((s) => s.addMilestone);
  const updateMilestone = useAppStore((s) => s.updateMilestone);
  const deleteMilestone = useAppStore((s) => s.deleteMilestone);
  const addCommitment = useAppStore((s) => s.addCommitment);
  const updateCommitment = useAppStore((s) => s.updateCommitment);
  const deleteCommitment = useAppStore((s) => s.deleteCommitment);
  const toggleStepCheckIn = useAppStore((s) => s.toggleStepCheckIn);
  const toggleRampWeek = useAppStore((s) => s.toggleRampWeek);

  const goal = useAppStore((s) =>
    s.years.find((y) => y.year === s.selectedYear)?.goals.find((g) => g.id === id),
  );
  const notificationsMasterOn = useAppStore((s) => s.notificationsMasterOn);

  // On web this screen is exported as a static SSR shell (see build:vercel):
  // the server always renders with an empty, never-rehydrated store (no
  // localStorage server-side), so `goal` is always undefined server-side.
  // Persisted data loads asynchronously on the client via zustand's persist
  // middleware. Every hook below that reacts to `goal` (title/motivation
  // drafts, the completion-celebration tracker) must not fire its state
  // updates until that rehydration is confirmed done — updating state for
  // this route while the surrounding hydration boundary is still settling
  // is what was producing React hydration errors (#418/#421/#422) and, via
  // React's hydration-error recovery discarding this modal route, the
  // unexpected bounce back to /board. Same gate the rest of the app already
  // uses (see app/_layout.tsx, app/index.tsx).
  const [hydrated, setHydrated] = useState(useAppStore.persist.hasHydrated());
  useEffect(() => {
    const unsub = useAppStore.persist.onFinishHydration(() => setHydrated(true));
    if (useAppStore.persist.hasHydrated()) setHydrated(true);
    return unsub;
  }, []);

  // The bell must actually schedule/cancel the reminder, not just flip the flag.
  // Turning it on also schedules a push notification for each weekly target.
  const toggleReminder = async () => {
    if (!goal) return;
    if (!goal.reminder.on) {
      const granted = await requestNotificationPermission();
      if (!granted) {
        alertNotificationsUnavailable();
        return;
      }
      const updated = { ...goal, reminder: { ...goal.reminder, on: true } };
      updateGoal(updated);
      if (notificationsMasterOn) {
        await scheduleGoalNotification(updated);
        await syncWeeklyTargetNotifications(updated);
      }
    } else {
      updateGoal({ ...goal, reminder: { ...goal.reminder, on: false } });
      await cancelGoalNotification(goal.id);
      await cancelWeeklyTargetNotifications(goal.id);
    }
  };

  // Re-sync weekly-target notifications after any measurable change,
  // reading the goal fresh from the store (state updates are synchronous).
  const resyncWeekNotifications = () => {
    const fresh = useAppStore.getState().getGoal(id!);
    if (fresh && useAppStore.getState().notificationsMasterOn) {
      void syncWeeklyTargetNotifications(fresh);
    }
  };

  // Same for accountable-step reminders. Each step owns its own schedule, so
  // this runs on every milestone edit rather than off the goal-level bell.
  const resyncStepNotifications = () => {
    const fresh = useAppStore.getState().getGoal(id!);
    if (fresh && useAppStore.getState().notificationsMasterOn) {
      void syncCommitmentNotifications(fresh);
    }
  };

  // Turning a step reminder on is the first thing that needs permission, so ask
  // here rather than at goal level.
  const saveStep = async (step: Commitment, mgId: string) => {
    if (step.schedule.on) {
      const granted = await requestNotificationPermission();
      if (!granted) {
        alertNotificationsUnavailable();
        // Keep the schedule the user configured, just not switched on.
        updateCommitment({ ...step, schedule: { ...step.schedule, on: false } }, mgId, id!);
        return;
      }
    }
    updateCommitment(step, mgId, id!);
    resyncStepNotifications();
  };

  // Hands an effort milestone to the coach: seeds a message the coach answers
  // with a baseline question and one simple weekly target.
  const [coachSeed, setCoachSeed] = useState<string | null>(null);
  const askCoachAbout = (mg: Milestone) => {
    setCoachSeed(
      `Help me with my milestone "${mg.title}". Ask me what my current baseline is, ` +
      `then suggest one simple weekly commitment I can be reminded about — ` +
      `not a full training plan.`,
    );
  };

  const [titleDraft, setTitleDraft] = useState(goal?.title ?? '');
  useEffect(() => {
    if (hydrated && goal?.id) setTitleDraft(goal.title);
  }, [hydrated, goal?.id]);

  // "Why this matters" is collapsed by default unless the goal already has
  // one written, so an empty goal doesn't show an empty-looking input box.
  const [motivationOpen, setMotivationOpen] = useState(!!goal?.motivation);
  const [motivationDraft, setMotivationDraft] = useState(goal?.motivation ?? '');
  useEffect(() => {
    if (hydrated && goal?.id) {
      setMotivationDraft(goal.motivation ?? '');
      setMotivationOpen(!!goal.motivation);
    }
  }, [hydrated, goal?.id]);

  const [showDatePicker, setShowDatePicker] = useState(false);

  // One-time celebration when the goal crosses 100% during this session —
  // baselines on first render (so opening an already-complete goal doesn't
  // re-celebrate) and only fires on the false -> true transition. Gated on
  // `hydrated` (see above) so it never reacts to the transient "goal became
  // defined" render that happens the instant persisted data rehydrates.
  const completedNow = goal ? isCompleted(goal) : false;
  const prevCompletedRef = useRef<boolean | null>(null);
  const [showCelebration, setShowCelebration] = useState(false);
  const celebrationScale = useRef(new Animated.Value(0.8)).current;
  useEffect(() => {
    if (!hydrated) return;
    if (prevCompletedRef.current === null) {
      prevCompletedRef.current = completedNow;
      return;
    }
    if (completedNow && !prevCompletedRef.current) {
      prevCompletedRef.current = completedNow;
      setShowCelebration(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      celebrationScale.setValue(0.8);
      Animated.spring(celebrationScale, { toValue: 1, useNativeDriver: true, friction: 5, tension: 90 }).start();
      const t = setTimeout(() => setShowCelebration(false), 4000);
      return () => clearTimeout(t);
    }
    prevCompletedRef.current = completedNow;
  }, [hydrated, completedNow]);

  const handleDelete = () => {
    const title = goal?.title ?? 'this goal';
    const doDelete = () => {
      void cancelEverythingForGoal(id!);
      deleteGoal(id!);
      router.back();
    };
    if (Platform.OS === 'web') {
      if (window.confirm(`Delete "${title}"? This cannot be undone.`)) doDelete();
    } else {
      Alert.alert(
        'Delete Goal',
        `Delete "${title}"? This cannot be undone.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: doDelete },
        ],
      );
    }
  };

  // Same placeholder shape for "still rehydrating" and "genuinely missing" —
  // the SSR shell always renders this (persisted data is client-only), and
  // keeping both branches visually identical means whichever one the
  // client's first paint lands on, it already matches the server output.
  if (!hydrated || !goal) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: p.bg }}>
        <Text style={{ color: p.muted }}>{hydrated ? 'Goal not found' : 'Loading…'}</Text>
      </View>
    );
  }

  const noteColor = GOAL_NOTE_COLORS[goal.colorIndex % GOAL_NOTE_COLORS.length];
  const progress = goalProgress(goal);
  const pct = goalProgressPercent(goal);
  // Goal-gradient framing: call out the final stretch instead of treating
  // 81% and 20% the same flat accent color.
  const almostThere = pct >= 80 && pct < 100;
  // A goal with nothing on it yet defaults to AI-driven decomposition rather
  // than leaving the user to work out Measurables vs Milestones cold — the
  // manual forms below still work, this is just the offered fast path.
  const isEmptyGoal = goal.measurables.length === 0 && (goal.milestones ?? []).length === 0;

  const daysLeft = goal.targetDate
    ? Math.max(0, Math.round((localDate(goal.targetDate).getTime() - Date.now()) / 86400000))
    : null;

  const dateDisplay = goal.targetDate
    ? localDate(goal.targetDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : 'No date set';

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
            <View style={styles.navActions}>
              <TouchableOpacity onPress={toggleReminder}>
                <Ionicons
                  name={goal.reminder.on ? 'notifications' : 'notifications-outline'}
                  size={20}
                  color={goal.reminder.on ? p.accent : p.muted}
                />
              </TouchableOpacity>
              <TouchableOpacity onPress={handleDelete} style={{ marginLeft: 14 }}>
                <Ionicons name="trash-outline" size={20} color={p.muted} />
              </TouchableOpacity>
            </View>
          </View>

          <TextInput
            style={[styles.titleInput, { color: p.text }]}
            value={titleDraft}
            onChangeText={setTitleDraft}
            onBlur={() => titleDraft !== goal.title && updateGoal({ ...goal, title: titleDraft })}
            multiline
            placeholder="Goal title"
            placeholderTextColor={p.muted}
          />

          <TouchableOpacity
            style={styles.motivationToggle}
            onPress={() => setMotivationOpen((o) => !o)}
            activeOpacity={0.7}
          >
            <Ionicons
              name={motivationOpen ? 'chevron-down' : 'chevron-forward'}
              size={12}
              color={p.muted}
            />
            <Text style={[styles.motivationToggleText, { color: p.muted }]}>
              {goal.motivation ? 'Why this matters' : 'Add why this matters'}
            </Text>
          </TouchableOpacity>

          {motivationOpen && (
            <TextInput
              style={[styles.motivationInput, { color: p.text }]}
              value={motivationDraft}
              onChangeText={setMotivationDraft}
              onBlur={() => {
                if (motivationDraft.trim() !== (goal.motivation ?? '')) {
                  updateGoal({ ...goal, motivation: motivationDraft.trim() || undefined });
                }
              }}
              multiline
              placeholder="What makes this goal matter to you?"
              placeholderTextColor={p.muted}
            />
          )}

          <View style={styles.progRow}>
            <View style={{ flex: 1 }}>
              <View style={[styles.progTrack, { backgroundColor: p.line }]}>
                <View
                  style={[
                    styles.progFill,
                    { backgroundColor: almostThere ? '#e89300' : p.accent, width: `${progress * 100}%` },
                  ]}
                />
              </View>
            </View>
            <Text style={[styles.progPct, { color: almostThere ? '#e89300' : p.accent }]}>
              {almostThere ? 'Almost there · ' : ''}{pct}%
            </Text>
          </View>
        </LinearGradient>

        {showCelebration && (
          <Animated.View
            style={[
              styles.celebrationCard,
              { backgroundColor: p.surface, borderColor: `${p.accent}55`, transform: [{ scale: celebrationScale }] },
            ]}
          >
            <Ionicons name="trophy" size={20} color={p.accent} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.celebrationTitle, { color: p.text }]}>Goal complete!</Text>
              <Text style={[styles.celebrationBody, { color: p.muted }]}>
                Every measurable and milestone on "{goal.title}" is done. Nice work.
              </Text>
            </View>
            <TouchableOpacity onPress={() => setShowCelebration(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={16} color={p.muted} />
            </TouchableOpacity>
          </Animated.View>
        )}

        <TouchableOpacity
          style={[styles.achieveRow, { backgroundColor: p.surface }]}
          onPress={() => setShowDatePicker(true)}
          activeOpacity={0.75}
        >
          <Text style={[styles.eyebrow, { color: p.muted }]}>ACHIEVE BY</Text>
          <Text style={[styles.dateText, { color: p.text }]}>{dateDisplay}</Text>
          {daysLeft != null && (
            <Text style={[styles.daysLeft, { color: p.muted }]}>· {daysLeft} days left</Text>
          )}
          <Ionicons name="calendar-outline" size={14} color={p.muted} style={{ marginLeft: 'auto' as any }} />
        </TouchableOpacity>

        {isEmptyGoal && (
          <View style={[styles.section, { paddingTop: 0, paddingBottom: 4 }]}>
            <View style={[styles.decompCard, { backgroundColor: p.surface }]}>
              <Ionicons name="sparkles" size={18} color={p.accent} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.decompTitle, { color: p.text }]}>Nothing here yet</Text>
                <Text style={[styles.decompBody, { color: p.muted }]}>
                  Let the coach break "{goal.title}" into concrete steps and a recurring
                  commitment — or add a milestone yourself below. Measurables live on the
                  goal's bubble canvas now.
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.decompBtn, { backgroundColor: p.ink }]}
                onPress={() => setCoachSeed(
                  `This goal has nothing on it yet. Break "${goal.title}" down into a few ` +
                  `concrete steps and, if it fits, a milestone with a recurring commitment.`,
                )}
              >
                <Text style={[styles.decompBtnText, { color: p.isDark ? p.bg : '#fff' }]}>Ask coach</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <View style={styles.section}>
          <MilestoneSection
            goal={goal}
            palette={p}
            onAddMilestone={(mg) => addMilestone(mg, goal.id)}
            onUpdateMilestone={(mg) => updateMilestone(mg, goal.id)}
            onDeleteMilestone={(mgId) => {
              deleteMilestone(mgId, goal.id);
              resyncStepNotifications();
            }}
            onAddStep={(step, mgId) => {
              addCommitment(step, mgId, goal.id);
              resyncStepNotifications();
            }}
            onUpdateStep={(step, mgId) => { void saveStep(step, mgId); }}
            onDeleteStep={(stepId, mgId) => {
              deleteCommitment(stepId, mgId, goal.id);
              void cancelCommitmentNotification(goal.id, stepId);
            }}
            onToggleCheckIn={(stepId, mgId) => {
              toggleStepCheckIn(stepId, mgId, goal.id);
              // A checked-off ramp week must not still ping a reminder for it.
              resyncStepNotifications();
            }}
            onToggleRampWeek={(stepId, weekId, mgId) => {
              toggleRampWeek(stepId, weekId, mgId, goal.id);
              resyncStepNotifications();
            }}
            onAskCoach={askCoachAbout}
          />
        </View>

        <View style={styles.section}>
          <CoachChat
            goal={goal}
            palette={p}
            onGoalEdited={() => { resyncWeekNotifications(); resyncStepNotifications(); }}
            seedMessage={coachSeed}
            onSeedConsumed={() => setCoachSeed(null)}
          />
        </View>

      </ScrollView>

      {/* Calendar pop-up for the "Achieve by" date */}
      <CalendarPicker
        visible={showDatePicker}
        value={goal.targetDate}
        palette={p}
        onSelect={(iso) => {
          updateGoal({ ...goal, targetDate: iso });
          setShowDatePicker(false);
        }}
        onClear={() => {
          updateGoal({ ...goal, targetDate: undefined });
          setShowDatePicker(false);
        }}
        onDismiss={() => setShowDatePicker(false)}
      />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingTop: Platform.OS === 'ios' ? 50 : 30 },
  headerGradient: { paddingBottom: 16 },
  navRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12,
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  backText: { fontSize: 14, fontWeight: '500' },
  goalLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 1.5 },
  navActions: { flexDirection: 'row', alignItems: 'center' },
  titleInput: {
    fontSize: 24, fontWeight: '700', fontFamily: FONTS.display,
    paddingHorizontal: 20, paddingBottom: 10,
    minHeight: 40,
  },
  progRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 20, paddingBottom: 12,
  },
  progTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progFill: { height: 6, borderRadius: 3 },
  progPct: { fontSize: 13, fontWeight: '700', textAlign: 'right' },
  motivationToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 20, paddingBottom: 6,
  },
  motivationToggleText: { fontSize: 12, fontWeight: '600' },
  motivationInput: {
    fontSize: 14, lineHeight: 19, fontStyle: 'italic',
    paddingHorizontal: 20, paddingBottom: 12, minHeight: 36,
  },
  celebrationCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1, borderRadius: 14, padding: 14,
    marginHorizontal: 18, marginTop: 14,
  },
  celebrationTitle: { fontSize: 14, fontWeight: '700', marginBottom: 2 },
  celebrationBody: { fontSize: 12, lineHeight: 17 },
  achieveRow: {
    flexDirection: 'row', alignItems: 'center',
    padding: 14, paddingHorizontal: 20, gap: 8,
  },
  eyebrow: { fontSize: 11, fontWeight: '600', letterSpacing: 1.5 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center' },
  dateText: { fontSize: 14, fontWeight: '600' },
  daysLeft: { fontSize: 13 },
  layerHint: { fontSize: 11, lineHeight: 15, marginTop: 4, marginBottom: 10 },
  section: { padding: 18 },
  emptyHint: { fontSize: 14, lineHeight: 20 },
  decompCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 14, padding: 14,
  },
  decompTitle: { fontSize: 14, fontWeight: '700', marginBottom: 2 },
  decompBody: { fontSize: 12, lineHeight: 17 },
  decompBtn: { borderRadius: 12, paddingVertical: 9, paddingHorizontal: 14 },
  decompBtnText: { fontSize: 13, fontWeight: '700' },
});
