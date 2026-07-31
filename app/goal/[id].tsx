import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Platform, Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeStore } from '../../store/useThemeStore';
import { useAppStore } from '../../store/useAppStore';
import { GOAL_NOTE_COLORS, hexAlpha, FONTS } from '../../theme/themes';
import {
  goalProgress, goalProgressPercent, AccountableStep, Milestone,
} from '../../store/models';
import { MeasurableCard } from '../../components/goal/MeasurableCard';
import { AddMeasurableForm } from '../../components/goal/AddMeasurableForm';
import { MilestoneSection } from '../../components/goal/MilestoneSection';
import { CoachChat } from '../../components/goal/CoachChat';
import { CalendarPicker } from '../../components/shared/CalendarPicker';
import {
  requestNotificationPermission,
  scheduleGoalNotification,
  cancelGoalNotification,
  cancelWeeklyTargetNotifications,
  syncWeeklyTargetNotifications,
  syncAccountableStepNotifications,
  cancelAccountableStepNotification,
  cancelEverythingForGoal,
  alertNotificationsUnavailable,
} from '../../services/notificationService';

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
  const addMeasurable = useAppStore((s) => s.addMeasurable);
  const updateMeasurable = useAppStore((s) => s.updateMeasurable);
  const deleteMeasurable = useAppStore((s) => s.deleteMeasurable);
  const addMilestone = useAppStore((s) => s.addMilestone);
  const updateMilestone = useAppStore((s) => s.updateMilestone);
  const deleteMilestone = useAppStore((s) => s.deleteMilestone);
  const addAccountableStep = useAppStore((s) => s.addAccountableStep);
  const updateAccountableStep = useAppStore((s) => s.updateAccountableStep);
  const deleteAccountableStep = useAppStore((s) => s.deleteAccountableStep);
  const toggleStepCheckIn = useAppStore((s) => s.toggleStepCheckIn);
  const toggleRampWeek = useAppStore((s) => s.toggleRampWeek);

  const goal = useAppStore((s) =>
    s.years.find((y) => y.year === s.selectedYear)?.goals.find((g) => g.id === id),
  );
  const notificationsMasterOn = useAppStore((s) => s.notificationsMasterOn);

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
      void syncAccountableStepNotifications(fresh);
    }
  };

  // Turning a step reminder on is the first thing that needs permission, so ask
  // here rather than at goal level.
  const saveStep = async (step: AccountableStep, mgId: string) => {
    if (step.schedule.on) {
      const granted = await requestNotificationPermission();
      if (!granted) {
        alertNotificationsUnavailable();
        // Keep the schedule the user configured, just not switched on.
        updateAccountableStep({ ...step, schedule: { ...step.schedule, on: false } }, mgId, id!);
        return;
      }
    }
    updateAccountableStep(step, mgId, id!);
    resyncStepNotifications();
  };

  // Hands an effort milestone to the coach: seeds a message the coach answers
  // with a baseline question and one simple weekly target.
  const [coachSeed, setCoachSeed] = useState<string | null>(null);
  const askCoachAbout = (mg: Milestone) => {
    setCoachSeed(
      `Help me with my milestone "${mg.title}". Ask me what my current baseline is, ` +
      `then suggest one simple weekly accountable step I can be reminded about — ` +
      `not a full training plan.`,
    );
  };

  const [titleDraft, setTitleDraft] = useState(goal?.title ?? '');
  useEffect(() => {
    if (goal?.id) setTitleDraft(goal.title);
  }, [goal?.id]);

  const [showDatePicker, setShowDatePicker] = useState(false);

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

  if (!goal) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: p.bg }}>
        <Text style={{ color: p.muted }}>Goal not found</Text>
      </View>
    );
  }

  const noteColor = GOAL_NOTE_COLORS[goal.colorIndex % GOAL_NOTE_COLORS.length];
  const progress = goalProgress(goal);
  const pct = goalProgressPercent(goal);

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
              <Text style={[styles.backText, { color: p.text }]}>Board</Text>
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

          <View style={styles.progRow}>
            <View style={{ flex: 1 }}>
              <View style={[styles.progTrack, { backgroundColor: p.line }]}>
                <View style={[styles.progFill, { backgroundColor: p.accent, width: `${progress * 100}%` }]} />
              </View>
            </View>
            <Text style={[styles.progPct, { color: p.accent }]}>{pct}%</Text>
          </View>
        </LinearGradient>

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

        <View style={styles.section}>
          <Text style={[styles.eyebrow, { color: p.muted }]}>MEASURABLES</Text>
          <Text style={[styles.layerHint, { color: p.muted }]}>
            Quick checklist items you track directly on this goal. For a sub-goal with its
            own recurring commitment and reminder, use Milestones below instead.
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
              addAccountableStep(step, mgId, goal.id);
              resyncStepNotifications();
            }}
            onUpdateStep={(step, mgId) => { void saveStep(step, mgId); }}
            onDeleteStep={(stepId, mgId) => {
              deleteAccountableStep(stepId, mgId, goal.id);
              void cancelAccountableStepNotification(goal.id, stepId);
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
  progPct: { fontSize: 13, fontWeight: '700', width: 36, textAlign: 'right' },
  achieveRow: {
    flexDirection: 'row', alignItems: 'center',
    padding: 14, paddingHorizontal: 20, gap: 8,
  },
  eyebrow: { fontSize: 11, fontWeight: '600', letterSpacing: 1.5 },
  dateText: { fontSize: 14, fontWeight: '600' },
  daysLeft: { fontSize: 13 },
  layerHint: { fontSize: 11, lineHeight: 15, marginTop: 4, marginBottom: 10 },
  section: { padding: 18 },
  emptyHint: { fontSize: 14, lineHeight: 20 },
});
