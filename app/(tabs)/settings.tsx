import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, Switch, Modal,
  StyleSheet, Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useThemeStore } from '../../store/useThemeStore';
import { useAppStore } from '../../store/useAppStore';
import { THEMES, THEME_ORDER, ThemeKey, GOAL_NOTE_COLORS, FONTS, hexAlpha } from '../../theme/themes';
import { ReminderFrequency } from '../../store/models';
import {
  requestNotificationPermission,
  scheduleGoalNotification,
  cancelGoalNotification,
  cancelAllGoalNotifications,
} from '../../services/notificationService';

export default function SettingsScreen() {
  const palette = useThemeStore((s) => s.palette);
  const currentTheme = useThemeStore((s) => s.current);
  const setCurrent = useThemeStore((s) => s.setCurrent);
  const p = palette;

  const [showNotifications, setShowNotifications] = useState(false);

  return (
    <LinearGradient colors={p.bgGradient as any} style={styles.root}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={styles.header}>
          <Text style={[styles.eyebrow, { color: p.muted }]}>SETTINGS</Text>
          <Text style={[styles.subtitle, { color: p.text }]}>Customize your app</Text>
        </View>

        <SectionLabel label="APPEARANCE" palette={p} />
        {THEME_ORDER.map((key) => {
          const theme = THEMES[key];
          const tp = theme.palette;
          const isSelected = currentTheme === key;
          return (
            <TouchableOpacity
              key={key}
              style={[styles.themeRow, { backgroundColor: p.surface }]}
              onPress={() => setCurrent(key)}
              activeOpacity={0.75}
            >
              <View style={[styles.swatch, { overflow: 'hidden', borderRadius: 10 }]}>
                <LinearGradient
                  colors={tp.bgGradient as any}
                  style={StyleSheet.absoluteFill}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                />
                <View style={styles.swatchDots}>
                  {[0, 1, 2].map((i) => (
                    <View key={i} style={[styles.swatchDot, { backgroundColor: GOAL_NOTE_COLORS[i] }]} />
                  ))}
                </View>
                {isSelected && (
                  <View style={[styles.swatchBorder, { borderColor: tp.accent }]} pointerEvents="none" />
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.themeName, { color: p.text }]}>{theme.label}</Text>
                <Text style={[styles.themeMode, { color: p.muted }]}>{tp.isDark ? 'Dark' : 'Light'}</Text>
              </View>
              {isSelected && <Ionicons name="checkmark-circle" size={20} color={p.accent} />}
            </TouchableOpacity>
          );
        })}

        <SectionLabel label="GENERAL" palette={p} />
        <TouchableOpacity
          style={[styles.settingsRow, { backgroundColor: p.surface }]}
          onPress={() => setShowNotifications(true)}
          activeOpacity={0.75}
        >
          <Text style={[styles.settingsRowText, { color: p.text }]}>Notifications</Text>
          <Ionicons name="chevron-forward" size={14} color={p.muted} />
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

  async function handleMasterToggle(val: boolean) {
    if (val) {
      const granted = await requestNotificationPermission();
      if (!granted) return;
      setNotificationsMaster(true);
      await Promise.all(
        goals.filter((g) => g.reminder.on).map((g) => scheduleGoalNotification(g))
      );
    } else {
      setNotificationsMaster(false);
      await cancelAllGoalNotifications(goals.map((g) => g.id));
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
              <Text style={[styles.toggleDesc, { color: p.muted }]}>Receive reminders for your goals</Text>
            </View>
            <Switch
              value={notificationsMasterOn}
              onValueChange={handleMasterToggle}
              trackColor={{ false: p.line, true: p.accent }}
              thumbColor="#fff"
            />
          </View>

          <Text style={[styles.sectionLabel, { color: p.muted, marginTop: 8 }]}>PER GOAL</Text>

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
  themeRow: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 12, borderRadius: 14, marginHorizontal: 18, marginBottom: 6 },
  swatch: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  swatchDots: { flexDirection: 'row', gap: 3 },
  swatchDot: { width: 8, height: 8, borderRadius: 4 },
  swatchBorder: { position: 'absolute', inset: 0, borderRadius: 10, borderWidth: 2 },
  themeName: { fontSize: 15, fontWeight: '600' },
  themeMode: { fontSize: 12, marginTop: 1 },
  settingsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderRadius: 14, marginHorizontal: 18, marginBottom: 6 },
  settingsRowText: { fontSize: 16 },
  tip: { fontSize: 12, paddingHorizontal: 22, paddingTop: 16, lineHeight: 18 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 56 : 20, paddingBottom: 12 },
  modalTitle: { fontSize: 20, fontWeight: '700' },
  doneText: { fontSize: 16, fontWeight: '600' },
  masterToggle: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 14, gap: 10 },
  toggleDesc: { fontSize: 13, marginTop: 2 },
  goalNotifCard: { borderRadius: 14, padding: 14, marginBottom: 4 },
  goalDot: { width: 12, height: 12, borderRadius: 6, marginRight: 8 },
  goalNotifTitle: { fontSize: 15, fontWeight: '600' },
  freqPicker: { flexDirection: 'row', borderRadius: 16, padding: 3, gap: 2 },
  freqBtn: { flex: 1, paddingVertical: 6, borderRadius: 14, alignItems: 'center' },
  freqText: { fontSize: 12, fontWeight: '500' },
});
