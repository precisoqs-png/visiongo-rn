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
