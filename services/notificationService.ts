import * as Notifications from 'expo-notifications';
import { Goal, ReminderFrequency } from '../store/models';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export async function requestNotificationPermission(): Promise<boolean> {
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
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
}

export async function cancelGoalNotification(goalId: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(`goal-${goalId}`);
}

export async function cancelAllGoalNotifications(goalIds: string[]): Promise<void> {
  await Promise.all(goalIds.map(cancelGoalNotification));
}
