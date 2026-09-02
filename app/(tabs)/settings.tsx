import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, Switch, Modal,
  StyleSheet, Platform, Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { useThemeStore } from '../../store/useThemeStore';
import { useAppStore } from '../../store/useAppStore';
import { THEMES, THEME_ORDER, ThemeKey, GOAL_NOTE_COLORS, FONTS, hexAlpha } from '../../theme/themes';
import { ReminderFrequency } from '../../store/models';
import {
  requestNotificationPermission,
  scheduleGoalNotification,
  cancelGoalNotification,
  cancelEverythingForGoal,
  syncWeeklyTargetNotifications,
  syncCommitmentNotifications,
  alertNotificationsUnavailable,
} from '../../services/notificationService';

export default function SettingsScreen() {
  const router = useRouter();
  const palette = useThemeStore((s) => s.palette);
  const currentTheme = useThemeStore((s) => s.current);
  const setCurrent = useThemeStore((s) => s.setCurrent);
  const cycleNext = useThemeStore((s) => s.cycleNext);
  const p = palette;

  const resetOnboarding = useAppStore((s) => s.resetOnboarding);
  const importBackup = useAppStore((s) => s.importBackup);

  const [showNotifications, setShowNotifications] = useState(false);

  async function handleExport() {
    try {
      // Whole persisted state, JSON-serialized (JSON.stringify drops the
      // store's action functions on its own, so this matches exactly what
      // zustand's persist middleware would have written to disk).
      const state = useAppStore.getState();
      const payload = {
        // Lets a future importer (and a human eyeballing the file) tell at a
        // glance whether this backup predates the Milestones/Measurables
        // invert migration — importBackup always runs normalizeYears on
        // import regardless, but this makes the shape self-describing.
        schemaVersion: 6,
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
        return;
      }

      const fileUri = `${FileSystem.cacheDirectory}visiongo-backup-${Date.now()}.json`;
      await FileSystem.writeAsStringAsync(fileUri, json, { encoding: FileSystem.EncodingType.UTF8 });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, { mimeType: 'application/json', dialogTitle: 'Save VisionGo backup' });
      } else {
        Alert.alert('Backup saved', `Saved to: ${fileUri}`);
      }
    } catch (err) {
      Alert.alert('Export failed', 'Could not create the backup file. Please try again.');
    }
  }

  function applyImportedJson(text: string) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      Alert.alert('Import failed', 'That file is not valid JSON.');
      return;
    }
    const data = parsed as { years?: unknown };
    if (!data || typeof data !== 'object' || !Array.isArray(data.years)) {
      Alert.alert('Import failed', 'That file does not look like a VisionGo backup (missing a "years" list).');
      return;
    }

    const doImport = () => {
      try {
        importBackup(parsed as { years: any; selectedYear?: number; hasCompletedOnboarding?: boolean });
      } catch {
        Alert.alert('Import failed', 'The backup file was readable but its data could not be restored.');
      }
    };

    const message =
      'This will replace ALL current goals and progress with the contents of the selected backup file. ' +
      'This cannot be undone.';
    if (Platform.OS === 'web') {
      if ((window as any).confirm(`Replace all data?\n\n${message}`)) doImport();
      return;
    }
    Alert.alert('Replace all data?', message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Replace', style: 'destructive', onPress: doImport },
    ]);
  }

  async function handleImport() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/json',
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      let text: string;
      if (Platform.OS === 'web') {
        // On web the picked file exposes a `file` (browser File object)
        // rather than a readable local uri.
        const file = (asset as any).file as File | undefined;
        text = file ? await file.text() : await (await fetch(asset.uri)).text();
      } else {
        text = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.UTF8 });
      }
      applyImportedJson(text);
    } catch (err) {
      Alert.alert('Import failed', 'Could not read the selected file. Please try again.');
    }
  }

  function handleStartFresh() {
    if (Platform.OS === 'web') {
      // Alert.alert is a no-op on web — use the browser's built-in confirm dialog
      if ((window as any).confirm(
        'Start Fresh? This will clear your onboarding flag and take you back to setup.'
      )) {
        resetOnboarding();
        router.replace('/onboarding');
      }
      return;
    }
    Alert.alert(
      'Start Fresh?',
      'This will clear your onboarding flag and take you back to setup. Your existing goals will remain unless you re-complete onboarding with new ones.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => {
            resetOnboarding();
            router.replace('/onboarding');
          },
        },
      ]
    );
  }

  return (
    <LinearGradient colors={p.bgGradient as any} style={styles.root}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={styles.header}>
          <Text style={[styles.eyebrow, { color: p.muted }]}>SETTINGS</Text>
          <Text style={[styles.subtitle, { color: p.text }]}>Customize your app</Text>
        </View>

        <SectionLabel label="APPEARANCE" palette={p} />
        {/* Compact single-row theme picker */}
        <View style={[styles.themeRow, { backgroundColor: p.surface }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {THEME_ORDER.map((key) => {
              const tp = THEMES[key].palette;
              const isActive = currentTheme === key;
              return (
                <TouchableOpacity key={key} onPress={() => setCurrent(key)} activeOpacity={0.75}>
                  <View
                    style={[
                      styles.miniSwatch,
                      { backgroundColor: tp.accent },
                      isActive && { borderWidth: 2.5, borderColor: p.text },
                    ]}
                  />
                </TouchableOpacity>
              );
            })}
          </View>
          <View style={{ flex: 1, paddingLeft: 12 }}>
            <Text style={[styles.themeName, { color: p.text }]}>{THEMES[currentTheme].label}</Text>
            <Text style={[styles.themeMode, { color: p.muted }]}>{p.isDark ? 'Dark' : 'Light'}</Text>
          </View>
          <TouchableOpacity onPress={cycleNext} activeOpacity={0.75}>
            <Text style={[styles.nextBtn, { color: p.accent }]}>Next →</Text>
          </TouchableOpacity>
        </View>

        <SectionLabel label="GENERAL" palette={p} />
        <TouchableOpacity
          style={[styles.settingsRow, { backgroundColor: p.surface }]}
          onPress={() => setShowNotifications(true)}
          activeOpacity={0.75}
        >
          <Text style={[styles.settingsRowText, { color: p.text }]}>Notifications</Text>
          <Ionicons name="chevron-forward" size={14} color={p.muted} />
        </TouchableOpacity>

        <SectionLabel label="HELP" palette={p} />
        <TouchableOpacity
          style={[styles.settingsRow, { backgroundColor: p.surface }]}
          onPress={() => router.navigate('/how-to-use')}
          activeOpacity={0.75}
        >
          <Text style={[styles.settingsRowText, { color: p.text }]}>How to Use</Text>
          <Ionicons name="chevron-forward" size={14} color={p.muted} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.settingsRow, { backgroundColor: p.surface }]}
          onPress={() => router.navigate('/privacy-policy')}
          activeOpacity={0.75}
        >
          <Text style={[styles.settingsRowText, { color: p.text }]}>Privacy Policy</Text>
          <Ionicons name="chevron-forward" size={14} color={p.muted} />
        </TouchableOpacity>

        <SectionLabel label="BACKUP" palette={p} />
        <TouchableOpacity
          style={[styles.settingsRow, { backgroundColor: p.surface }]}
          onPress={handleExport}
          activeOpacity={0.75}
        >
          <Text style={[styles.settingsRowText, { color: p.text }]}>Export Backup</Text>
          <Ionicons name="share-outline" size={16} color={p.muted} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.settingsRow, { backgroundColor: p.surface }]}
          onPress={handleImport}
          activeOpacity={0.75}
        >
          <Text style={[styles.settingsRowText, { color: p.text }]}>Import Backup</Text>
          <Ionicons name="download-outline" size={16} color={p.muted} />
        </TouchableOpacity>
        <Text style={[styles.tip, { color: p.muted, paddingHorizontal: 22 }]}>
          Everything stays on this device — export a JSON file to keep elsewhere, or import one to replace all
          current data.
        </Text>

        <SectionLabel label="DATA" palette={p} />
        <TouchableOpacity
          style={[styles.settingsRow, { backgroundColor: p.surface }]}
          onPress={handleStartFresh}
          activeOpacity={0.75}
        >
          <Text style={[styles.settingsRowText, { color: '#c0392b' }]}>Start Fresh</Text>
          <Ionicons name="refresh-outline" size={16} color="#c0392b" />
        </TouchableOpacity>

        <Text style={[styles.tip, { color: p.muted }]}>
          Tip: long-press anywhere on the Board to quickly switch themes.
        </Text>
      </ScrollView>

      <NotificationsModal visible={showNotifications} onClose={() => setShowNotifications(false)} palette={p} />
    </LinearGradient>
  );
}

function SectionLabel({ label, palette: p }: any) {
  return <Text style={[styles.sectionLabel, { color: p.muted }]}>{label}</Text>;
}

function NotificationsModal({ visible, onClose, palette: p }: any) {
  const notificationsMasterOn = useAppStore((s) => s.notificationsMasterOn);
  const setNotificationsMaster = useAppStore((s) => s.setNotificationsMaster);
  const goals = useAppStore((s) => s.currentYearData())?.goals ?? [];
  const updateGoal = useAppStore((s) => s.updateGoal);

  // The master switch must actually be a master switch: every reminder type
  // — the per-goal check-in, weekly ladder-measurable targets, and per-step
  // Commitment alerts — is gated on it, so flipping it off has to
  // cancel all three, not just the per-goal one. (It previously only cancelled
  // the per-goal generic reminder, leaving weekly-target and step
  // notifications firing after the user just told the app to stop.)
  async function handleMasterToggle(val: boolean) {
    if (val) {
      const granted = await requestNotificationPermission();
      if (!granted) {
        // Tell the user why the switch didn't turn on instead of failing silently
        alertNotificationsUnavailable();
        return;
      }
      setNotificationsMaster(true);
      await Promise.all(goals.map(async (g) => {
        if (g.reminder.on) {
          await scheduleGoalNotification(g);
          await syncWeeklyTargetNotifications(g);
        }
        // Commitment reminders are independent of the per-goal toggle —
        // only the master switch gates them.
        await syncCommitmentNotifications(g);
      }));
    } else {
      setNotificationsMaster(false);
      await Promise.all(goals.map((g) => cancelEverythingForGoal(g.id)));
    }
  }

  async function handleGoalToggle(goal: any, val: boolean) {
    const updated = { ...goal, reminder: { ...goal.reminder, on: val } };
    updateGoal(updated);
    if (val) {
      await scheduleGoalNotification(updated);
    } else {
      await cancelGoalNotification(goal.id);
    }
  }

  async function handleFrequencyChange(goal: any, freq: ReminderFrequency) {
    const updated = { ...goal, reminder: { ...goal.reminder, frequency: freq } };
    updateGoal(updated);
    if (goal.reminder.on && notificationsMasterOn) {
      await scheduleGoalNotification(updated);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <LinearGradient colors={p.bgGradient as any} style={{ flex: 1 }}>
        <View style={styles.modalHeader}>
          <Text style={[styles.modalTitle, { color: p.text }]}>Notifications</Text>
          <TouchableOpacity onPress={onClose}>
            <Text style={[styles.doneText, { color: p.accent }]}>Done</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ padding: 18, gap: 10, paddingBottom: 40 }}>
          <View style={[styles.masterToggle, { backgroundColor: p.surface }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.settingsRowText, { color: p.text }]}>Push Notifications</Text>
              <Text style={[styles.toggleDesc, { color: p.muted }]}>
                Master switch for every reminder VisionGo sends — goal check-ins below,
                weekly targets, and each Commitment's own alert. Off silences all
                of them at once.
              </Text>
            </View>
            <Switch
              value={notificationsMasterOn}
              onValueChange={handleMasterToggle}
              trackColor={{ false: p.line, true: p.accent }}
              thumbColor="#fff"
            />
          </View>

          <Text style={[styles.sectionLabel, { color: p.muted, marginTop: 8 }]}>PER GOAL</Text>
          <Text style={[styles.layerHint, { color: p.muted }]}>
            Each toggle below sends a periodic "check in on this goal" nudge and also
            gates that goal's weekly build-up targets. It does NOT control
            Commitment reminders — those live under the bell on each step, on
            the goal's own screen, and only need the master switch above to be on.
          </Text>

          {goals.length === 0 && (
            <Text style={[styles.emptyGoalsHint, { color: p.muted }]}>
              No goals yet — add a goal to your board to set up reminders for it.
            </Text>
          )}

          {goals.map((goal) => (
            <View
              key={goal.id}
              style={[styles.goalNotifCard, { backgroundColor: p.surface, opacity: notificationsMasterOn ? 1 : 0.5 }]}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: goal.reminder.on && notificationsMasterOn ? 10 : 0 }}>
                <View style={[styles.goalDot, { backgroundColor: GOAL_NOTE_COLORS[goal.colorIndex % GOAL_NOTE_COLORS.length] }]} />
                <Text style={[styles.goalNotifTitle, { color: p.text, flex: 1 }]} numberOfLines={1}>{goal.title}</Text>
                <Switch
                  value={goal.reminder.on}
                  onValueChange={(val) => handleGoalToggle(goal, val)}
                  disabled={!notificationsMasterOn}
                  trackColor={{ false: p.line, true: p.accent }}
                  thumbColor="#fff"
                />
              </View>
              {goal.reminder.on && notificationsMasterOn && (
                <View style={[styles.freqPicker, { backgroundColor: p.line }]}>
                  {(['Daily', 'Weekly', 'Monthly'] as ReminderFrequency[]).map((freq) => (
                    <TouchableOpacity
                      key={freq}
                      style={[styles.freqBtn, goal.reminder.frequency === freq && { backgroundColor: p.ink }]}
                      onPress={() => handleFrequencyChange(goal, freq)}
                    >
                      <Text style={[styles.freqText, { color: goal.reminder.frequency === freq ? (p.isDark ? p.bg : '#fff') : p.muted }]}>
                        {freq}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          ))}
        </ScrollView>
      </LinearGradient>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingTop: Platform.OS === 'ios' ? 50 : 30 },
  header: { paddingHorizontal: 20, paddingBottom: 16 },
  eyebrow: { fontSize: 11, fontWeight: '600', letterSpacing: 2 },
  subtitle: { fontSize: 20, fontStyle: 'italic', marginTop: 2 },
  sectionLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 1.5, paddingHorizontal: 22, paddingTop: 16, paddingBottom: 8 },
  layerHint: { fontSize: 12, lineHeight: 17, paddingHorizontal: 4, marginBottom: 4 },
  themeRow: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 14, marginHorizontal: 18, marginBottom: 6 },
  miniSwatch: { width: 20, height: 20, borderRadius: 10 },
  themeName: { fontSize: 15, fontWeight: '600' },
  themeMode: { fontSize: 12, marginTop: 1 },
  nextBtn: { fontSize: 14, fontWeight: '600', paddingHorizontal: 4 },
  settingsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderRadius: 14, marginHorizontal: 18, marginBottom: 6 },
  settingsRowText: { fontSize: 16 },
  tip: { fontSize: 12, paddingHorizontal: 22, paddingTop: 16, lineHeight: 18 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 56 : 20, paddingBottom: 12 },
  modalTitle: { fontSize: 20, fontWeight: '700' },
  doneText: { fontSize: 16, fontWeight: '600' },
  masterToggle: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 14, gap: 10 },
  toggleDesc: { fontSize: 13, marginTop: 2 },
  emptyGoalsHint: { fontSize: 14, lineHeight: 20, paddingHorizontal: 4 },
  goalNotifCard: { borderRadius: 14, padding: 14, marginBottom: 4 },
  goalDot: { width: 12, height: 12, borderRadius: 6, marginRight: 8 },
  goalNotifTitle: { fontSize: 15, fontWeight: '600' },
  freqPicker: { flexDirection: 'row', borderRadius: 16, padding: 3, gap: 2 },
  freqBtn: { flex: 1, paddingVertical: 6, borderRadius: 14, alignItems: 'center' },
  freqText: { fontSize: 12, fontWeight: '500' },
});
