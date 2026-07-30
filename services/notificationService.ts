import { Alert, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import {
  Goal, ReminderFrequency, Milestone, AccountableStep,
  cadenceIntervalDays, formatNumber,
} from '../store/models';

// expo-notifications does not support scheduled local notifications on web —
// every entry point below no-ops there instead of throwing.
const SUPPORTED = Platform.OS !== 'web';

if (SUPPORTED) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!SUPPORTED) return false;
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
  } catch (e) {
    console.warn('[VisionGo] Notification permission request failed:', e);
    return false;
  }
}

/** User-facing feedback when reminders can't be enabled. */
export function alertNotificationsUnavailable(): void {
  if (Platform.OS === 'web') {
    window.alert('Reminders are not available in the web version. Use the iOS or Android app to get goal reminders.');
    return;
  }
  Alert.alert(
    'Notifications are off',
    'To get goal reminders, allow notifications for VisionGo in your device Settings.',
  );
}

function buildTrigger(frequency: ReminderFrequency): Notifications.NotificationTriggerInput {
  switch (frequency) {
    case 'Daily':
      return {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: 9,
        minute: 0,
      };
    case 'Weekly':
      return {
        type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
        weekday: 2, // Monday
        hour: 9,
        minute: 0,
      };
    case 'Monthly':
      // CALENDAR trigger with repeats for monthly cadence
      return {
        type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
        day: 1,
        hour: 9,
        minute: 0,
        repeats: true,
      };
  }
}

export async function scheduleGoalNotification(goal: Goal): Promise<void> {
  if (!SUPPORTED) return;
  try {
    // Cancel existing before rescheduling to avoid duplicates
    await cancelGoalNotification(goal.id);
    await Notifications.scheduleNotificationAsync({
      identifier: `goal-${goal.id}`,
      content: {
        title: 'VisionGo Reminder',
        body: `Check in on: ${goal.title}`,
      },
      trigger: buildTrigger(goal.reminder.frequency),
    });
  } catch (e) {
    console.warn('[VisionGo] Failed to schedule reminder:', e);
  }
}

export async function cancelGoalNotification(goalId: string): Promise<void> {
  if (!SUPPORTED) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(`goal-${goalId}`);
  } catch (e) {
    console.warn('[VisionGo] Failed to cancel reminder:', e);
  }
}

// ── Weekly-target notifications ─────────────────────────────────
//
// Each ladder week ("6 km by Sun, Aug 2 – Step 1") gets its own one-shot
// notification at 9:00 local time on its due date, identified by
// `week-<goalId>-<weekId>` so they can be cancelled per goal or per week.

function weekIdentifier(goalId: string, weekId: string): string {
  return `week-${goalId}-${weekId}`;
}

export async function cancelWeeklyTargetNotification(goalId: string, weekId: string): Promise<void> {
  if (!SUPPORTED) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(weekIdentifier(goalId, weekId));
  } catch (e) {
    console.warn('[VisionGo] Failed to cancel weekly target reminder:', e);
  }
}

export async function cancelWeeklyTargetNotifications(goalId: string): Promise<void> {
  if (!SUPPORTED) return;
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const prefix = `week-${goalId}-`;
    await Promise.all(
      scheduled
        .filter((n) => n.identifier.startsWith(prefix))
        .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
    );
  } catch (e) {
    console.warn('[VisionGo] Failed to cancel weekly target reminders:', e);
  }
}

/**
 * Re-schedules all weekly-target notifications for a goal from its current
 * ladder measurables. Cancels stale ones first, then schedules one per
 * not-yet-done future week (9:00 local on the due date).
 */
export async function syncWeeklyTargetNotifications(goal: Goal): Promise<void> {
  if (!SUPPORTED) return;
  try {
    await cancelWeeklyTargetNotifications(goal.id);
    if (!goal.reminder.on) return;

    const now = Date.now();
    for (const m of goal.measurables) {
      if (m.type !== 'ladder') continue;
      for (const week of m.weeks) {
        if (week.done) continue;
        const due = new Date(week.targetDate);
        due.setHours(9, 0, 0, 0);
        if (due.getTime() <= now) continue;
        await Notifications.scheduleNotificationAsync({
          identifier: weekIdentifier(goal.id, week.id),
          content: {
            title: `${goal.title} — weekly target due`,
            body: `${formatNumber(week.value)} ${m.unit} · ${m.label}`,
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: due,
          },
        });
      }
    }
  } catch (e) {
    console.warn('[VisionGo] Failed to sync weekly target reminders:', e);
  }
}

// ── Accountable-step reminders ──────────────────────────────────
//
// One recurring reminder per accountable step, on the cadence and at the
// day/time the user picked ("Save $1,000 per month" → 28th at 09:00, payday).
// Identified by `step-<goalId>-<stepId>` so a single step can be rescheduled
// or cancelled without touching the rest.
//
// Weekly and monthly use native repeating triggers. Custom cadences have no
// native equivalent that honours a time of day, so they get a run of one-shot
// notifications; `syncAccountableStepNotifications` tops them back up on every
// goal change.

const CUSTOM_OCCURRENCES = 12;

function stepIdentifier(goalId: string, stepId: string, occurrence = 0): string {
  return occurrence === 0
    ? `step-${goalId}-${stepId}`
    : `step-${goalId}-${stepId}-${occurrence}`;
}

/** Question the reminder asks — phrased as a check-in, not an instruction. */
export function stepReminderBody(mg: Milestone, step: AccountableStep): string {
  const period = step.cadence === 'monthly'
    ? 'this month'
    : step.cadence === 'weekly'
      ? 'this week'
      : 'yet';
  return `Have you completed "${step.label}" ${period}?`;
}

function buildStepTriggers(step: AccountableStep): Notifications.NotificationTriggerInput[] {
  const { hour, minute, weekday, dayOfMonth } = step.schedule;
  switch (step.cadence) {
    case 'weekly':
      return [{
        type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
        weekday, hour, minute,
      }];
    case 'monthly':
      return [{
        type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
        day: Math.min(Math.max(dayOfMonth, 1), 28),
        hour, minute, repeats: true,
      }];
    case 'custom': {
      const intervalDays = cadenceIntervalDays(step);
      const first = new Date();
      first.setHours(hour, minute, 0, 0);
      if (first.getTime() <= Date.now()) first.setDate(first.getDate() + intervalDays);
      return Array.from({ length: CUSTOM_OCCURRENCES }, (_, i) => {
        const date = new Date(first);
        date.setDate(date.getDate() + i * intervalDays);
        return { type: Notifications.SchedulableTriggerInputTypes.DATE, date };
      });
    }
  }
}

export async function cancelAccountableStepNotification(goalId: string, stepId: string): Promise<void> {
  if (!SUPPORTED) return;
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const base = stepIdentifier(goalId, stepId);
    await Promise.all(
      scheduled
        .filter((n) => n.identifier === base || n.identifier.startsWith(`${base}-`))
        .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
    );
  } catch (e) {
    console.warn('[VisionGo] Failed to cancel accountable step reminder:', e);
  }
}

export async function cancelAccountableStepNotifications(goalId: string): Promise<void> {
  if (!SUPPORTED) return;
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const prefix = `step-${goalId}-`;
    await Promise.all(
      scheduled
        .filter((n) => n.identifier.startsWith(prefix))
        .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
    );
  } catch (e) {
    console.warn('[VisionGo] Failed to cancel accountable step reminders:', e);
  }
}

/** Schedules (or reschedules) the reminder for one accountable step. */
export async function scheduleAccountableStep(
  goal: Goal, mg: Milestone, step: AccountableStep,
): Promise<void> {
  if (!SUPPORTED) return;
  await cancelAccountableStepNotification(goal.id, step.id);
  if (!step.schedule.on) return;
  try {
    if (step.ramp) {
      await scheduleRampNotifications(goal, mg, step);
      return;
    }
    const triggers = buildStepTriggers(step);
    for (let i = 0; i < triggers.length; i++) {
      await Notifications.scheduleNotificationAsync({
        identifier: stepIdentifier(goal.id, step.id, i),
        content: {
          title: `${goal.title} · ${mg.title}`,
          body: stepReminderBody(mg, step),
        },
        trigger: triggers[i],
      });
    }
  } catch (e) {
    console.warn('[VisionGo] Failed to schedule accountable step reminder:', e);
  }
}

// A ramp's target changes every week, so — unlike a flat step's single
// repeating trigger — it gets one dated one-shot per not-yet-done week, each
// naming that week's specific value, at the schedule's chosen day/time.
async function scheduleRampNotifications(goal: Goal, mg: Milestone, step: AccountableStep): Promise<void> {
  const { hour, minute } = step.schedule;
  const now = Date.now();
  let occurrence = 0;
  for (const week of step.ramp ?? []) {
    if (week.done) continue;
    const due = new Date(week.targetDate);
    due.setHours(hour, minute, 0, 0);
    if (due.getTime() <= now) continue;
    await Notifications.scheduleNotificationAsync({
      identifier: stepIdentifier(goal.id, step.id, occurrence),
      content: {
        title: `${goal.title} · ${mg.title}`,
        body: `Have you hit ${formatNumber(week.value)}${step.unit ? ` ${step.unit}` : ''} this week? (${step.label})`,
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: due },
    });
    occurrence++;
  }
}

/**
 * Rebuilds every accountable-step reminder for a goal from current state, and
 * tops the custom-cadence one-shots back up. Steps with reminders off are left
 * unscheduled. Note the repeating weekly/monthly triggers still fire in a
 * period the user already checked off — a single occurrence of a native
 * repeating trigger cannot be skipped.
 */
export async function syncAccountableStepNotifications(goal: Goal): Promise<void> {
  if (!SUPPORTED) return;
  try {
    await cancelAccountableStepNotifications(goal.id);
    for (const mg of goal.milestones ?? []) {
      for (const step of mg.steps) {
        if (!step.schedule.on) continue;
        await scheduleAccountableStep(goal, mg, step);
      }
    }
  } catch (e) {
    console.warn('[VisionGo] Failed to sync accountable step reminders:', e);
  }
}

// Day/time portion only — every call site already shows cadenceLabel(step)
// (e.g. "Weekly", "Ramp · 6→10 km") right before this, so repeating the
// cadence word here would just duplicate it in the UI.
/** e.g. "Mon at 9:00 AM", pair with cadenceLabel(step) for the full picture. */
export function describeSchedule(step: AccountableStep): string {
  const { hour, minute, weekday, dayOfMonth, on } = step.schedule;
  if (!on) return 'Reminder off';
  const time = formatTime(hour, minute);
  switch (step.cadence) {
    case 'weekly':
      return `${WEEKDAY_NAMES[weekday - 1] ?? 'Mon'} at ${time}`;
    case 'monthly':
      return `${ordinal(Math.min(Math.max(dayOfMonth, 1), 28))} at ${time}`;
    case 'custom':
      return time;
  }
}

export const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function formatTime(hour: number, minute: number): string {
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  const ampm = hour < 12 ? 'AM' : 'PM';
  return `${h12}:${String(minute).padStart(2, '0')} ${ampm}`;
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

/** Cancels every notification VisionGo scheduled for a goal. */
export async function cancelEverythingForGoal(goalId: string): Promise<void> {
  await cancelGoalNotification(goalId);
  await cancelWeeklyTargetNotifications(goalId);
  await cancelAccountableStepNotifications(goalId);
}
