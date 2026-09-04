import { Platform, Alert } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useAppStore } from '../store/useAppStore';

// Pulled out of settings.tsx so the periodic/onboarding backup prompt (see
// components/BackupPrompt.tsx) can trigger a real export directly instead of
// just linking the user to Settings and hoping they find the button.
export async function exportBackup(): Promise<boolean> {
  try {
    // Whole persisted state, JSON-serialized (JSON.stringify drops the
    // store's action functions on its own, so this matches exactly what
    // zustand's persist middleware would have written to disk).
    const state = useAppStore.getState();
    const payload = {
      years: state.years,
      selectedYear: state.selectedYear,
      hasCompletedOnboarding: state.hasCompletedOnboarding,
      exportedAt: new Date().toISOString(),
    };
    const json = JSON.stringify(payload, null, 2);

    if (Platform.OS === 'web') {
      // No expo-sharing on web — fall back to a browser download.
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `visiongo-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return true;
    }

    const fileUri = `${FileSystem.cacheDirectory}visiongo-backup-${Date.now()}.json`;
    await FileSystem.writeAsStringAsync(fileUri, json, { encoding: FileSystem.EncodingType.UTF8 });

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(fileUri, { mimeType: 'application/json', dialogTitle: 'Save VisionGo backup' });
    } else {
      Alert.alert('Backup saved', `Saved to: ${fileUri}`);
    }
    return true;
  } catch (err) {
    Alert.alert('Export failed', 'Could not create the backup file. Please try again.');
    return false;
  }
}
