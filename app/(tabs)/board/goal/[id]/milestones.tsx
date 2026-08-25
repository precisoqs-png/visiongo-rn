import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Platform, Alert, Animated, KeyboardAvoidingView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useThemeStore } from '../../../../../store/useThemeStore';
import { useAppStore } from '../../../../../store/useAppStore';
import { GOAL_NOTE_COLORS, hexAlpha, FONTS } from '../../../../../theme/themes';
import {
  goalProgress, goalProgressPercent, isCompleted, Commitment, TrackableItem,
  Cadence, StepSchedule, DEFAULT_SCHEDULE,
} from '../../../../../store/models';
import { MeasurableCard } from '../../../../../components/goal/MeasurableCard';
import { AddMilestoneItemForm } from '../../../../../components/goal/AddMilestoneItemForm';
import { InfoPopover } from '../../../../../components/shared/InfoPopover';
import { StepScheduleSheet, ReminderTarget } from '../../../../../components/goal/StepScheduleSheet';
import { CoachChat } from '../../../../../components/goal/CoachChat';
import { useNearBottom } from '../../../../../components/shared/useNearBottom';
import { DecompCard } from '../../../../../components/goal/DecompCard';
import { CalendarPicker } from '../../../../../components/shared/CalendarPicker';
import {
  requestNotificationPermission,
  scheduleGoalNotification,
  cancelGoalNotification,
  cancelWeeklyTargetNotifications,
  syncWeeklyTargetNotifications,
  syncCommitmentNotifications,
  syncMeasurableReminders,
  cancelEverythingForGoal,
  alertNotificationsUnavailable,
} from '../../../../../services/notificationService';

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
  // Unified generic item CRUD — the same actions measurables.tsx uses. Despite
  // the name, these operate on goal.items by id regardless of the
  // `milestone` flag; see store/useAppStore.ts. Commitment-level edits
  // (check-in, add/delete a commitment, toggle a ramp week) are computed
  // locally into a full updated item and saved through updateMeasurable too
  // — see components/goal/CommitmentsBlock.tsx.
  const addMeasurable = useAppStore((s) => s.addMeasurable);
  const updateMeasurable = useAppStore((s) => s.updateMeasurable);
  const deleteMeasurable = useAppStore((s) => s.deleteMeasurable);

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

  const coachScrollRef = useRef<ScrollView>(null);
  const coachNearBottom = useNearBottom();

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
      setBellToast('Reminder on');
      setTimeout(() => setBellToast(null), 2000);
    } else {
      updateGoal({ ...goal, reminder: { ...goal.reminder, on: false } });
      await cancelGoalNotification(goal.id);
      await cancelWeeklyTargetNotifications(goal.id);
      setBellToast('Reminder off');
      setTimeout(() => setBellToast(null), 2000);
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

  // Same for accountable-step reminders. Each commitment owns its own
  // schedule, so this runs on every item edit rather than off the
  // goal-level bell.
  const resyncStepNotifications = () => {
    const fresh = useAppStore.getState().getGoal(id!);
    if (fresh && useAppStore.getState().notificationsMasterOn) {
      void syncCommitmentNotifications(fresh);
    }
  };

  // Item's OWN reminder (check/number/ladder cadence) — same sheet + pattern
  // measurables.tsx uses, driven from here since only one sheet is open at a
  // time.
  const [scheduleForItem, setScheduleForItem] = useState<TrackableItem | null>(null);

  const resyncMeasurableNotifications = () => {
    const fresh = useAppStore.getState().getGoal(id!);
    if (fresh && useAppStore.getState().notificationsMasterOn) {
      void syncMeasurableReminders(fresh);
    }
  };

  const saveItemSchedule = async (
    patch: { cadence: Cadence; intervalDays?: number; schedule: StepSchedule },
  ) => {
    const m = scheduleForItem;
    if (!m) return;
    if (patch.schedule.on) {
      const granted = await requestNotificationPermission();
      if (!granted) {
        alertNotificationsUnavailable();
        updateMeasurable({ ...m, ...patch, schedule: { ...patch.schedule, on: false } }, id!);
        setScheduleForItem(null);
        return;
      }
    }
    updateMeasurable({ ...m, ...patch }, id!);
    setScheduleForItem(null);
    resyncMeasurableNotifications();
  };

  const turnOffItemReminder = () => {
    const m = scheduleForItem;
    if (!m) return;
    updateMeasurable({ ...m, schedule: { ...(m.schedule ?? DEFAULT_SCHEDULE), on: false } }, id!);
    setScheduleForItem(null);
    resyncMeasurableNotifications();
  };

  // A specific Commitment's own reminder, nested inside a milestone-flagged
  // item — kept separate from scheduleForItem since it patches one entry of
  // `item.commitments`, not the item itself.
  const [scheduleForCommitment, setScheduleForCommitment] = useState<{ item: TrackableItem; step: Commitment } | null>(null);

  const saveCommitmentSchedule = async (
    patch: { cadence: Cadence; intervalDays?: number; schedule: StepSchedule },
  ) => {
    const target = scheduleForCommitment;
    if (!target) return;
    const apply = (schedule: StepSchedule) => updateMeasurable({
      ...target.item,
      commitments: target.item.commitments.map((s) => (
        s.id === target.step.id ? { ...s, cadence: patch.cadence, intervalDays: patch.intervalDays, schedule } : s
      )),
    }, id!);
    if (patch.schedule.on) {
      const granted = await requestNotificationPermission();
      if (!granted) {
        alertNotificationsUnavailable();
        apply({ ...patch.schedule, on: false });
        setScheduleForCommitment(null);
        return;
      }
    }
    apply(patch.schedule);
    setScheduleForCommitment(null);
    resyncStepNotifications();
  };

  const turnOffCommitmentReminder = () => {
    const target = scheduleForCommitment;
    if (!target) return;
    updateMeasurable({
      ...target.item,
      commitments: target.item.commitments.map((s) => (
        s.id === target.step.id ? { ...s, schedule: { ...s.schedule, on: false } } : s
      )),
    }, id!);
    setScheduleForCommitment(null);
    resyncStepNotifications();
  };

  // Hands an effort milestone to the coach: seeds a message the coach answers
  // with a baseline question and one simple weekly target.
  const [coachSeed, setCoachSeed] = useState<string | null>(null);
  const askCoachAbout = (mg: TrackableItem) => {
    setCoachSeed(
      `Help me with my milestone "${mg.label}". Ask me what my current baseline is, ` +
      `then suggest one simple weekly commitment I can be reminded about — ` +
      `not a full training plan.`,
    );
  };

  // 'New Goal' is the literal default title a from-scratch goal is created
  // with (see TemplatePicker) — treated here as the untitled state: the
  // input starts empty so the "Goal title" placeholder actually shows and
  // typing replaces nothing, instead of the user having to select-all and
  // delete the real text "New Goal" first. onBlur below falls back to the
  // real title if left empty, so nothing is lost by tapping in and out.
  const isDefaultTitle = (t: string) => t === 'New Goal';
  const [titleDraft, setTitleDraft] = useState(
    goal && !isDefaultTitle(goal.title) ? goal.title : '',
  );
  useEffect(() => {
    if (hydrated && goal?.id) setTitleDraft(isDefaultTitle(goal.title) ? '' : goal.title);
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
  const [bellToast, setBellToast] = useState<string | null>(null);

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
  const isEmptyGoal = goal.items.length === 0;
  // This screen only ever shows top-level Milestones — their quantified
  // Measurable children live on measurables.tsx instead.
  const milestoneItems = goal.items.filter((it) => it.milestone && it.parentId == null);

  const daysLeft = goal.targetDate
    ? Math.max(0, Math.round((localDate(goal.targetDate).getTime() - Date.now()) / 86400000))
    : null;

  const dateDisplay = goal.targetDate
    ? localDate(goal.targetDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : 'No date set';

  return (
    <LinearGradient colors={p.bgGradient as any} style={styles.root}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
      <ScrollView
        ref={coachScrollRef}
        contentContainerStyle={{ paddingBottom: 60 }}
        onScroll={coachNearBottom.onScroll}
        onLayout={coachNearBottom.onLayout}
        onContentSizeChange={coachNearBottom.onContentSizeChange}
        scrollEventThrottle={100}
      >

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
              <View style={{ alignItems: 'center' }}>
                <TouchableOpacity onPress={toggleReminder}>
                  <Ionicons
                    name={goal.reminder.on ? 'notifications' : 'notifications-outline'}
                    size={20}
                    color={goal.reminder.on ? p.accent : p.muted}
                  />
                </TouchableOpacity>
                {bellToast && (
                  <View style={[styles.bellToast, { backgroundColor: p.surface }]}>
                    <Text style={[styles.bellToastText, { color: p.text }]}>{bellToast}</Text>
                  </View>
                )}
              </View>
              <TouchableOpacity onPress={handleDelete} style={{ marginLeft: 14 }}>
                <Ionicons name="trash-outline" size={20} color={p.muted} />
              </TouchableOpacity>
            </View>
          </View>

          <TextInput
            style={[styles.titleInput, { color: p.text }]}
            value={titleDraft}
            onChangeText={setTitleDraft}
            onBlur={() => {
              const next = titleDraft.trim() ? titleDraft : goal.title;
              setTitleDraft(isDefaultTitle(next) ? '' : next);
              if (next !== goal.title) updateGoal({ ...goal, title: next });
            }}
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
                    { backgroundColor: almostThere ? '#e89300' : noteColor, width: `${progress * 100}%` },
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
          <Ionicons name="chevron-forward" size={14} color={p.muted} />
        </TouchableOpacity>

        {isEmptyGoal && (
          <View style={[styles.section, { paddingTop: 0, paddingBottom: 4 }]}>
            <DecompCard goal={goal} palette={p} onAskCoach={setCoachSeed} />
          </View>
        )}

        <View style={styles.section}>
          <View style={styles.eyebrowRow}>
            <Text style={[styles.eyebrow, { color: p.muted }]}>MILESTONES</Text>
            <InfoPopover
              palette={p}
              title="Measurables vs Milestones"
              body={
                'Milestones are big binary wins — "Save $10,000", "Run a marathon" — a title ' +
                'and an optional deadline, nothing to tick up, just done or not done. They live ' +
                "on the goal's bubble canvas and here.\n\n" +
                'Measurables are the quantified thing under a Milestone — current/target, a unit, ' +
                'a weekly ladder, or recurring Commitments you get reminded about on a schedule ' +
                '(weekly, monthly, or custom). Open a Milestone to add and track its Measurables.'
              }
            />
          </View>
          <Text style={[styles.layerHint, { color: p.muted }]}>
            Big binary wins with an optional deadline. Add a Measurable under one to track the
            numbers and recurring commitments that get you there.
          </Text>
          {milestoneItems.length === 0 ? (
            <Text style={[styles.emptyHint, { color: p.muted }]}>
              No milestones yet. Add one below or ask your coach.
            </Text>
          ) : (
            milestoneItems.map((m) => (
              <MeasurableCard
                key={m.id}
                measurable={m}
                goal={goal}
                goalTargetDate={goal.targetDate}
                palette={p}
                noteColor={noteColor}
                onUpdate={(m) => { updateMeasurable(m, goal.id); resyncStepNotifications(); resyncWeekNotifications(); }}
                onDelete={(mid) => {
                  deleteMeasurable(mid, goal.id);
                  resyncStepNotifications();
                  resyncWeekNotifications();
                  // Cancels the deleted item's OWN reminder — syncMeasurableReminders
                  // rebuilds every measurable reminder from the goal's CURRENT items,
                  // which by now no longer includes it, so this was the missing piece
                  // that otherwise left its notification firing forever.
                  resyncMeasurableNotifications();
                }}
                onOpenSchedule={(m) => setScheduleForItem(m)}
                onOpenCommitmentSchedule={(item, step) => setScheduleForCommitment({ item, step })}
                onAskCoach={askCoachAbout}
              />
            ))
          )}
        </View>

        <View style={styles.section}>
          <AddMilestoneItemForm
            palette={p}
            goalTargetDate={goal.targetDate}
            onAdd={(m) => addMeasurable(m, goal.id)}
          />
        </View>

        <View style={styles.section}>
          <CoachChat
            goal={goal}
            palette={p}
            onGoalEdited={() => {
              // See the matching comment in measurables.tsx: a coach
              // action that removes an item was leaving its own reminder
              // (as opposed to a Commitment's) firing forever, since this
              // never resynced it.
              resyncWeekNotifications();
              resyncStepNotifications();
              resyncMeasurableNotifications();
            }}
            seedMessage={coachSeed}
            onSeedConsumed={() => setCoachSeed(null)}
            onRequestScrollToEnd={() => coachScrollRef.current?.scrollToEnd({ animated: true })}
            isNearBottom={() => coachNearBottom.nearBottomRef.current}
          />
        </View>

      </ScrollView>
      </KeyboardAvoidingView>

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

      {/* Reminder sheet for an item's OWN cadence — same component + logic
          as a Measurable's, on measurables.tsx. */}
      <StepScheduleSheet
        visible={!!scheduleForItem}
        step={scheduleForItem}
        palette={p}
        onSave={(patch) => { void saveItemSchedule(patch); }}
        onTurnOff={turnOffItemReminder}
        onDismiss={() => setScheduleForItem(null)}
      />

      {/* Reminder sheet for one Commitment nested inside a milestone item. */}
      <StepScheduleSheet
        visible={!!scheduleForCommitment}
        step={scheduleForCommitment?.step ?? null}
        palette={p}
        onSave={(patch) => { void saveCommitmentSchedule(patch); }}
        onTurnOff={turnOffCommitmentReminder}
        onDismiss={() => setScheduleForCommitment(null)}
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
    marginHorizontal: 18, marginTop: 12, borderRadius: 14,
  },
  eyebrow: { fontSize: 11, fontWeight: '600', letterSpacing: 1.5 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center' },
  dateText: { fontSize: 14, fontWeight: '600' },
  daysLeft: { fontSize: 13 },
  layerHint: { fontSize: 11, lineHeight: 15, marginTop: 4, marginBottom: 10 },
  section: { padding: 18 },
  emptyHint: { fontSize: 14, lineHeight: 20 },
  bellToast: {
    position: 'absolute', top: 26, right: 0,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12, shadowRadius: 4, elevation: 4,
    minWidth: 80, alignItems: 'center',
  },
  bellToastText: { fontSize: 11, fontWeight: '600' },
});
