import { Alert, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { Goal, ReminderFrequency } from '../store/models';

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

export async function cancelAllGoalNotifications(goalIds: string[]): Promise<void> {
  await Promise.all(goalIds.map(cancelGoalNotification));
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

function fmtVal(v: number): string {
  return v % 1 === 0 ? String(Math.round(v)) : v.toFixed(1);
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
            body: `${fmtVal(week.value)} ${m.unit} · ${m.label}`,
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

/** Cancels the goal reminder and every weekly-target notification for a goal. */
export async function cancelEverythingForGoal(goalId: string): Promise<void> {
  await cancelGoalNotification(goalId);
  await cancelWeeklyTargetNotifications(goalId);
}
