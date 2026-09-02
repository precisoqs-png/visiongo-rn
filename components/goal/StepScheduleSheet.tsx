import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Modal, ScrollView, StyleSheet, Platform,
  KeyboardAvoidingView,
} from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { Cadence, StepSchedule, DEFAULT_SCHEDULE } from '../../store/models';
import { WEEKDAY_NAMES, formatTime } from '../../services/notificationService';
import { Palette } from '../../theme/themes';

// Minimal shape this sheet needs — deliberately NOT `Commitment`, so the
// same sheet + scheduling UI works for anything reminder-able (a
// Milestone's Commitment, or a Measurable). cadence/schedule are optional
// here because a Measurable has no reminder at all until the user sets one.
export interface ReminderTarget {
  id: string;
  label: string;
  cadence?: Cadence;
  intervalDays?: number;
  schedule?: StepSchedule;
  ramp?: unknown;
}

interface ContentProps {
  step: ReminderTarget;
  palette: Palette;
  // Saves cadence + schedule together — changing "every 10 days" is a cadence
  // change and a reminder change at once.
  onSave: (patch: { cadence: Cadence; intervalDays?: number; schedule: StepSchedule }) => void;
  onTurnOff: () => void;
  onDismiss: () => void;
}

interface Props {
  visible: boolean;
  step: ReminderTarget | null;
  palette: Palette;
  onSave: (patch: { cadence: Cadence; intervalDays?: number; schedule: StepSchedule }) => void;
  onTurnOff: () => void;
  onDismiss: () => void;
}

const CADENCES: { key: Cadence; label: string }[] = [
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
  { key: 'custom', label: 'Custom' },
];

// ── Time-of-day picker ──────────────────────────────────────────
//
// Used to be a hand-rolled trio of drag-to-scroll wheel columns
// (hour/minute/AM-PM) built on nested ScrollViews. That never actually
// worked on a real iOS device — a drag-to-scroll surface nested inside
// this sheet's own outer ScrollView is a well-known RN gesture conflict
// (see StepScheduleContent's comment on why the wheels were pulled OUTSIDE
// that ScrollView), and moving them outside fixed it only in the simulator,
// not on-device: UIScrollView's real touch arbitration still let the outer
// pan responder win often enough that users reported the wheel simply
// wouldn't scroll. Rather than continue patching a re-implementation of
// what iOS already ships for free, this hands the whole gesture to Apple's
// own UIDatePicker (mode="time", display="spinner") via
// @react-native-community/datetimepicker — correct momentum/snapping and
// VoiceOver support come with it, not from more scroll-event bookkeeping
// here. Android gets the platform's own clock-face dialog (display=
// "default"). The library has no web implementation at all, so web falls
// back to a plain HTML <input type="time">, which is a real native control
// there too — a hand-rolled wheel was never required on any platform,
// only the middle one lacked an off-the-shelf option before this library.
interface TimePickerProps {
  hour: number; // 24h, 0-23
  minute: number;
  onChange: (hour: number, minute: number) => void;
  palette: Palette;
}

function TimePicker({ hour, minute, onChange, palette: p }: TimePickerProps) {
  if (Platform.OS === 'web') {
    const value = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    return (
      // A raw DOM element, not a react-native-web primitive — deliberate:
      // there is no RN/RNW component that renders the browser's own native
      // time control, and that control (with its own scroll wheel/keyboard
      // input, no custom gesture code at all) is exactly what's wanted here.
      <input
        type="time"
        value={value}
        onChange={(e) => {
          const [h, m] = e.target.value.split(':').map(Number);
          if (Number.isFinite(h) && Number.isFinite(m)) onChange(h, m);
        }}
        style={{
          fontSize: 17, padding: '8px 10px', borderRadius: 10,
          border: `1px solid ${p.line}`, backgroundColor: p.surface, color: p.text,
          colorScheme: p.isDark ? 'dark' : 'light',
        }}
      />
    );
  }

  const value = new Date();
  value.setHours(hour, minute, 0, 0);

  const handleChange = (_event: DateTimePickerEvent, selected?: Date) => {
    if (selected) onChange(selected.getHours(), selected.getMinutes());
  };

  return (
    <DateTimePicker
      value={value}
      mode="time"
      display={Platform.OS === 'ios' ? 'spinner' : 'default'}
      onChange={handleChange}
      themeVariant={p.isDark ? 'dark' : 'light'}
    />
  );
}

// The actual form — header, cadence/day pickers, time wheels, actions —
// with no Modal of its own. Extracted so a caller that already owns a
// Modal (MilestoneDrillInSheet) can render this INLINE, as a plain overlay
// within its own already-presented sheet, instead of presenting a second
// Modal on top of the first. Two RN Modals visible at once was the actual
// cause of the goal-canvas freeze (see MilestoneDrillInSheet's comment) —
// not just a symptom to patch around, so the fix is this component never
// needing its own Modal at all when nested that way. `step` is required
// (non-null) — callers that can't guarantee that yet should not render
// this at all, rather than passing null and expecting an early return.
export function StepScheduleContent({ step, palette: p, onSave, onTurnOff, onDismiss }: ContentProps) {
  const [cadence, setCadence] = useState<Cadence>('weekly');
  const [intervalStr, setIntervalStr] = useState('10');
  const [schedule, setSchedule] = useState<StepSchedule>(DEFAULT_SCHEDULE);

  // Re-seed from the step whenever this component mounts on a (possibly
  // different) target, so edits start from the step's real schedule, not
  // whatever was last previewed. Both callers (the Modal wrapper below,
  // and MilestoneDrillInSheet's inline overlay) unmount this component on
  // close and remount fresh on open, so a mount-keyed effect is enough —
  // neither needs a separate "visible" flag to force a reseed.
  useEffect(() => {
    // A Measurable has no cadence until the user sets one — default the
    // picker to weekly, same as a brand-new Commitment would start.
    setCadence(step.cadence ?? 'weekly');
    setIntervalStr(String(step.intervalDays ?? 10));
    setSchedule({ ...DEFAULT_SCHEDULE, ...step.schedule });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.id]);

  // A build-up's cadence is fixed at creation (always weekly) and each
  // week's reminder fires on THAT week's own due date, not on a chosen
  // weekday — so there is nothing to pick here beyond what time of day to
  // be asked.
  const isBuildUp = !!step.ramp;

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
    <>
      <View style={styles.header}>
        <Text style={[styles.title, { color: p.text }]} numberOfLines={2}>
          Remind me: {step.label}
        </Text>
        <TouchableOpacity onPress={onDismiss} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="close" size={20} color={p.muted} />
        </TouchableOpacity>
      </View>

      {/* Cadence/day pickers only — the WHAT TIME picker below is kept
          outside this ScrollView too. That used to matter a great deal: a
          hand-rolled drag-to-scroll wheel nested inside another vertical
          ScrollView is a well-known RN gesture conflict, and was the real
          cause of "the time can't be changed" on a measurable's reminder
          (see TimePicker's own comment on why that wheel was replaced
          outright rather than patched again). The native time picker that
          replaced it owns its own gesture surface (a UIDatePicker/
          DatePickerDialog, not an RN ScrollView) so the conflict can't
          recur — this placement is now just visual grouping, not a fix. */}
      <ScrollView style={{ maxHeight: 220 }} keyboardShouldPersistTaps="handled">
        {isBuildUp ? (
          <Text style={[styles.preview, { color: p.muted, marginTop: 0 }]}>
            This step builds up week by week — each week's reminder fires on that
            week's own due date. Just pick a time of day below.
          </Text>
        ) : (
          <>
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
          </>
        )}

        {!isBuildUp && cadence === 'weekly' && (
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
      </ScrollView>

      <View>
        <Text style={[styles.eyebrow, { color: p.muted }]}>WHAT TIME</Text>
        <View style={styles.timePickerRow}>
          <TimePicker
            hour={schedule.hour}
            minute={schedule.minute}
            onChange={(hour, minute) => patch({ hour, minute })}
            palette={p}
          />
        </View>

        <Text style={[styles.preview, { color: p.muted }]}>
          {isBuildUp
            ? `I'll ask at ${formatTime(schedule.hour, schedule.minute)} on each week's own due date as the target builds up.`
            : <>
                I'll ask at {formatTime(schedule.hour, schedule.minute)}
                {cadence === 'weekly' && ` every ${WEEKDAY_NAMES[schedule.weekday - 1]}`}
                {cadence === 'monthly' && ` on day ${schedule.dayOfMonth} of each month`}
                {cadence === 'custom' && ` every ${intervalStr || '7'} days`}.
              </>
          }
        </Text>

        {Platform.OS === 'web' && (
          <Text style={[styles.preview, { color: p.muted }]}>
            Push reminders only fire in the iOS/Android app — this saves the
            schedule either way.
          </Text>
        )}
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.primaryBtn, { backgroundColor: p.accent }]}
          onPress={() => save(true)}
        >
          <Ionicons name="notifications" size={15} color={p.surface} />
          <Text style={[styles.primaryText, { color: p.surface }]}>
            {step.schedule?.on ? 'Update reminder' : 'Turn on reminder'}
          </Text>
        </TouchableOpacity>
        {step.schedule?.on ? (
          <TouchableOpacity onPress={onTurnOff}>
            <Text style={[styles.secondaryText, { color: '#c0392b' }]}>Turn off</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={() => save(false)}>
            <Text style={[styles.secondaryText, { color: p.muted }]}>Save without reminder</Text>
          </TouchableOpacity>
        )}
      </View>
    </>
  );
}

// Thin Modal wrapper around StepScheduleContent — this is the ONLY export
// that presents a Modal, used by milestones.tsx where there's no
// already-open Modal underneath to collide with. Content only
// mounts while visible, so closing and reopening (even on the same step)
// naturally remounts fresh rather than needing a separate reseed signal.
export function StepScheduleSheet({
  visible, step, palette: p, onSave, onTurnOff, onDismiss,
}: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
      <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onDismiss}>
        <TouchableOpacity
          activeOpacity={1}
          style={[styles.sheet, { backgroundColor: p.bg }]}
          onPress={(e) => e.stopPropagation?.()}
        >
          {visible && step && (
            <StepScheduleContent step={step} palette={p} onSave={onSave} onTurnOff={onTurnOff} onDismiss={onDismiss} />
          )}
        </TouchableOpacity>
      </TouchableOpacity>
      </KeyboardAvoidingView>
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
  timePickerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
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
