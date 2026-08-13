import { useEffect, useRef } from 'react';
import { Alert, Platform } from 'react-native';
import { useAppStore } from '../store/useAppStore';
import { exportBackup } from '../services/backupService';

// Everything lives in AsyncStorage with no sync — delete the app and a
// year of goals is gone. Export/Import exist but are easy to never notice
// under Settings. This nudges the user to back up: once shortly after they
// have real data (post-onboarding), then periodically after that.
const FIRST_PROMPT_DELAY_MS = 1500;
const REPROMPT_DAYS = 21;

export function BackupPrompt() {
  const hasCompletedOnboarding = useAppStore((s) => s.hasCompletedOnboarding);
  const goalCount = useAppStore((s) => s.years.reduce((n, y) => n + y.goals.length, 0));
  const lastBackupPromptAt = useAppStore((s) => s.lastBackupPromptAt);
  const setLastBackupPromptAt = useAppStore((s) => s.setLastBackupPromptAt);
  const shownThisSession = useRef(false);

  useEffect(() => {
    if (!hasCompletedOnboarding || goalCount === 0) return;
    if (shownThisSession.current) return;

    const due = !lastBackupPromptAt
      || (Date.now() - new Date(lastBackupPromptAt).getTime()) / 86_400_000 >= REPROMPT_DAYS;
    if (!due) return;

    const t = setTimeout(() => {
      shownThisSession.current = true;
      setLastBackupPromptAt(new Date().toISOString());

      const message = 'VisionGo keeps everything only on this device — nothing is backed up '
        + 'automatically. Save a backup file now so you never lose your goals?';

      if (Platform.OS === 'web') {
        if ((window as any).confirm(message)) void exportBackup();
        return;
      }
      Alert.alert('Back up your goals?', message, [
        { text: 'Not now', style: 'cancel' },
        { text: 'Back up now', onPress: () => void exportBackup() },
      ]);
    }, FIRST_PROMPT_DELAY_MS);
    return () => clearTimeout(t);
  }, [hasCompletedOnboarding, goalCount, lastBackupPromptAt, setLastBackupPromptAt]);

  return null;
}
