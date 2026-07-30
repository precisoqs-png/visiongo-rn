import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Modal, ScrollView, StyleSheet, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AccountableStep, Cadence, StepSchedule, DEFAULT_SCHEDULE } from '../../store/models';
import { WEEKDAY_NAMES, formatTime } from '../../services/notificationService';
import { Palette } from '../../theme/themes';

interface Props {
  visible: boolean;
  step: AccountableStep | null;
  palette: Palette;
  // Saves cadence + schedule together — changing "every 10 days" is a cadence
  // change and a reminder change at once.
  onSave: (patch: { cadence: Cadence; intervalDays?: number; schedule: StepSchedule }) => void;
  onTurnOff: () => void;
  onDismiss: () => void;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = [0, 15, 30, 45];
const CADENCES: { key: Cadence; label: string }[] = [
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
  { key: 'custom', label: 'Custom' },
];

export function StepScheduleSheet({
  visible, step, palette: p, onSave, onTurnOff, onDismiss,
}: Props) {
  const [cadence, setCadence] = useState<Cadence>('weekly');
  const [intervalStr, setIntervalStr] = useState('10');
  const [schedule, setSchedule] = useState<StepSchedule>(DEFAULT_SCHEDULE);

  // Re-seed from the step each time the sheet opens so edits start from the
  // step's real schedule, not whatever was last previewed.
  useEffect(() => {
    if (!visible || !step) return;
    setCadence(step.cadence);
    setIntervalStr(String(step.intervalDays ?? 10));
    setSchedule({ ...DEFAULT_SCHEDULE, ...step.schedule });
  }, [visible, step?.id]);

  if (!step) return null;

  const patch = (partial: Partial<StepSchedule>) =>
    setSchedule((s) => ({ ...s, ...partial }));

  const save = (on: boolean) => {
    const parsed = parseInt(intervalStr, 10);
    onSave({
      cadence,
      intervalDays: cadence === 'custom'
        ? (Number.isFinite(parsed) && parsed > 0 ? parsed : 7)
        : undefined,
      schedule: { ...schedule, on },
    });
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onDismiss}>
        <TouchableOpacity
          activeOpacity={1}
          style={[styles.sheet, { backgroundColor: p.bg }]}
          onPress={(e) => e.stopPropagation?.()}
        >
          <View style={styles.header}>
            <Text style={[styles.title, { color: p.text }]} numberOfLines={2}>
              Remind me: {step.label}
            </Text>
            <TouchableOpacity onPress={onDismiss} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={20} color={p.muted} />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ maxHeight: 400 }} keyboardShouldPersistTaps="handled">
            <Text style={[styles.eyebrow, { color: p.muted }]}>HOW OFTEN</Text>
            <View style={[styles.segmented, { backgroundColor: p.line }]}>
              {CADENCES.map((c) => (
                <TouchableOpacity
                  key={c.key}
                  style={[styles.segBtn, cadence === c.key && { backgroundColor: p.ink }]}
                  onPress={() => setCadence(c.key)}
                >
                  <Text style={[styles.segText, {
                    color: cadence === c.key ? (p.isDark ? p.bg : '#fff') : p.muted,
                  }]}>
                    {c.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {cadence === 'weekly' && (
              <>
                <Text style={[styles.eyebrow, { color: p.muted }]}>WHICH DAY</Text>
                <View style={styles.chipWrap}>
                  {WEEKDAY_NAMES.map((name, i) => {
                    const value = i + 1; // expo weekday: 1 = Sunday
                    const active = schedule.weekday === value;
                    return (
                      <TouchableOpacity
                        key={name}
                        style={[styles.chip, {
                          borderColor: active ? p.accent : p.line,
                          backgroundColor: active ? `${p.accent}1f` : 'transparent',
                        }]}
                        onPress={() => patch({ weekday: value })}
                      >
                        <Text style={[styles.chipText, { color: active ? p.accent : p.text }]}>
                          {name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}

            {cadence === 'monthly' && (
              <>
                <Text style={[styles.eyebrow, { color: p.muted }]}>
                  DAY OF MONTH — e.g. payday
                </Text>
                <View style={styles.chipWrap}>
                  {/* Capped at 28 so the reminder exists in February too */}
                  {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => {
                    const active = schedule.dayOfMonth === d;
                    return (
                      <TouchableOpacity
                        key={d}
                        style={[styles.dayChip, {
                          borderColor: active ? p.accent : p.line,
                          backgroundColor: active ? `${p.accent}1f` : 'transparent',
                        }]}
                        onPress={() => patch({ dayOfMonth: d })}
                      >
                        <Text style={[styles.chipText, { color: active ? p.accent : p.text }]}>
                          {d}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}

            {cadence === 'custom' && (
              <>
                <Text style={[styles.eyebrow, { color: p.muted }]}>EVERY HOW MANY DAYS</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: p.surface, color: p.text, borderColor: p.line }]}
                  keyboardType="numeric"
                  value={intervalStr}
                  onChangeText={setIntervalStr}
                  placeholder="10"
                  placeholderTextColor={p.muted}
                />
              </>
            )}

            <Text style={[styles.eyebrow, { color: p.muted }]}>WHAT TIME</Text>
            <View style={styles.timeRow}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {HOURS.map((h) => {
                    const active = schedule.hour === h;
                    return (
                      <TouchableOpacity
                        key={h}
                        style={[styles.dayChip, {
                          borderColor: active ? p.accent : p.line,
                          backgroundColor: active ? `${p.accent}1f` : 'transparent',
                        }]}
                        onPress={() => patch({ hour: h })}
                      >
                        <Text style={[styles.chipText, { color: active ? p.accent : p.text }]}>
                          {h % 12 === 0 ? 12 : h % 12}{h < 12 ? 'a' : 'p'}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>
            </View>
            <View style={[styles.chipWrap, { marginTop: 6 }]}>
              {MINUTES.map((m) => {
                const active = schedule.minute === m;
                return (
                  <TouchableOpacity
                    key={m}
                    style={[styles.chip, {
                      borderColor: active ? p.accent : p.line,
                      backgroundColor: active ? `${p.accent}1f` : 'transparent',
                    }]}
                    onPress={() => patch({ minute: m })}
                  >
                    <Text style={[styles.chipText, { color: active ? p.accent : p.text }]}>
                      :{String(m).padStart(2, '0')}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={[styles.preview, { color: p.muted }]}>
              I'll ask at {formatTime(schedule.hour, schedule.minute)}
              {cadence === 'weekly' && ` every ${WEEKDAY_NAMES[schedule.weekday - 1]}`}
              {cadence === 'monthly' && ` on day ${schedule.dayOfMonth} of each month`}
              {cadence === 'custom' && ` every ${intervalStr || '7'} days`}.
            </Text>

            {Platform.OS === 'web' && (
              <Text style={[styles.preview, { color: p.muted }]}>
                Push reminders only fire in the iOS/Android app — this saves the
                schedule either way.
              </Text>
            )}
          </ScrollView>

          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: p.accent }]}
              onPress={() => save(true)}
            >
              <Ionicons name="notifications" size={15} color={p.surface} />
              <Text style={[styles.primaryText, { color: p.surface }]}>
                {step.schedule.on ? 'Update reminder' : 'Turn on reminder'}
              </Text>
            </TouchableOpacity>
            {step.schedule.on ? (
              <TouchableOpacity onPress={onTurnOff}>
                <Text style={[styles.secondaryText, { color: '#c0392b' }]}>Turn off</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={() => save(false)}>
                <Text style={[styles.secondaryText, { color: p.muted }]}>Save without reminder</Text>
              </TouchableOpacity>
            )}
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: '#00000070',
    alignItems: 'center', justifyContent: 'center', padding: 20,
  },
  sheet: { width: '100%', maxWidth: 460, borderRadius: 20, padding: 18 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 12 },
  title: { flex: 1, fontSize: 16, fontWeight: '700' },
  eyebrow: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2, marginTop: 12, marginBottom: 6 },
  segmented: { flexDirection: 'row', borderRadius: 18, padding: 3, gap: 2 },
  segBtn: { flex: 1, paddingVertical: 7, borderRadius: 15, alignItems: 'center' },
  segText: { fontSize: 13, fontWeight: '600' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    paddingHorizontal: 11, paddingVertical: 7, borderRadius: 14, borderWidth: 1,
  },
  dayChip: {
    minWidth: 38, paddingHorizontal: 6, paddingVertical: 7,
    borderRadius: 12, borderWidth: 1, alignItems: 'center',
  },
  chipText: { fontSize: 13, fontWeight: '600' },
  input: {
    borderRadius: 10, padding: 11, fontSize: 15, borderWidth: 1, minWidth: 0,
  },
  timeRow: { flexDirection: 'row', alignItems: 'center' },
  preview: { fontSize: 12, lineHeight: 18, marginTop: 12 },
  actions: {
    flexDirection: 'row', alignItems: 'center', gap: 16,
    marginTop: 16, flexWrap: 'wrap',
  },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    borderRadius: 14, paddingVertical: 12, paddingHorizontal: 18,
  },
  primaryText: { fontSize: 14, fontWeight: '700' },
  secondaryText: { fontSize: 13, fontWeight: '600' },
});
