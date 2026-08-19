import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Modal, ScrollView, StyleSheet, Platform,
  NativeSyntheticEvent, NativeScrollEvent, KeyboardAvoidingView,
} from 'react-native';
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

const HOURS_12 = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES = [0, 15, 30, 45];
const PERIODS = ['AM', 'PM'] as const;
const CADENCES: { key: Cadence; label: string }[] = [
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
  { key: 'custom', label: 'Custom' },
];

// 24h `hour` -> the 1-12 value a wheel shows. Handles both midnight (0 -> 12)
// and noon (12 -> 12) correctly.
function to12Hour(h: number): number {
  return ((h + 11) % 12) + 1;
}

function toPeriod(h: number): 'AM' | 'PM' {
  return h < 12 ? 'AM' : 'PM';
}

// Recombine a 1-12 hour + AM/PM back into the 0-23 value StepSchedule stores.
function to24Hour(hour12: number, period: 'AM' | 'PM'): number {
  if (period === 'AM') return hour12 === 12 ? 0 : hour12;
  return hour12 === 12 ? 12 : hour12 + 12;
}

// ── Rollable wheel column ──────────────────────────────────────
//
// A snapping vertical ScrollView with a fixed-height window: the item
// aligned with the centered highlight band is the selected one. Used for
// the hour, minute, and AM/PM wheels below — same interaction as a native
// iOS/Android time picker.

const WHEEL_ITEM_HEIGHT = 36;
const WHEEL_VISIBLE_ITEMS = 5;
const WHEEL_HEIGHT = WHEEL_ITEM_HEIGHT * WHEEL_VISIBLE_ITEMS;
const WHEEL_PAD = WHEEL_ITEM_HEIGHT * Math.floor(WHEEL_VISIBLE_ITEMS / 2);

interface WheelColumnProps {
  items: string[];
  index: number;
  onChange: (index: number) => void;
  palette: Palette;
  width: number;
  // Changes each time the sheet opens, so the wheel snaps back to the
  // current value instead of wherever the user last scrolled it.
  resetSignal: string;
}

function WheelColumn({ items, index, onChange, palette: p, width, resetSignal }: WheelColumnProps) {
  const scrollRef = useRef<ScrollView>(null);
  // Mouse-wheel scrolling (desktop web) never fires onMomentumScrollEnd or
  // onScrollEndDrag — those are touch drag/momentum lifecycle events, and a
  // wheel event doesn't produce either. Debouncing plain onScroll instead
  // catches "scrolling has stopped" on every input method, touch included.
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // No animation: this runs when the sheet is (re)opening, not mid-interaction.
    scrollRef.current?.scrollTo({ y: index * WHEEL_ITEM_HEIGHT, animated: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetSignal]);

  const settleAt = (rawOffset: number) => {
    const snapped = Math.max(0, Math.min(items.length - 1, Math.round(rawOffset / WHEEL_ITEM_HEIGHT)));
    onChange(snapped);
    // Native (snapToInterval + decelerationRate="fast") already lands the
    // scroll on an item boundary via UIScrollView/RecyclerView's own
    // targetContentOffset adjustment — an extra scrollTo here just fights
    // that native settle. Web has no such built-in snap physics for a
    // plain ScrollView, so it still needs this nudge to land exactly on
    // the boundary.
    if (Platform.OS === 'web') {
      scrollRef.current?.scrollTo({ y: snapped * WHEEL_ITEM_HEIGHT, animated: true });
    }
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => settleAt(y), 120);
  };

  // Momentum-end only — NOT onScrollEndDrag. onScrollEndDrag fires the
  // instant a finger lifts, before any momentum/deceleration runs: on a
  // flick, the reported contentOffset at that moment is still close to
  // where the drag started, not where the flick was headed. Settling
  // there (as this used to, on both events) meant every flick "won" by
  // reverting to roughly its starting position the moment momentum tried
  // to carry it further — reported as "the wheel won't let me scroll".
  // onMomentumScrollEnd alone fires once the native deceleration/snap has
  // actually finished, at the real final position; a slow drag with too
  // little velocity to trigger momentum still fires it immediately after
  // release (iOS always runs at least a brief settle animation when
  // snapToInterval is set). The debounced onScroll above remains the only
  // path for input that produces neither event at all — a desktop mouse
  // wheel.
  const settleNow = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleAt(e.nativeEvent.contentOffset.y);
  };

  return (
    <View style={{ width, height: WHEEL_HEIGHT }}>
      <View
        pointerEvents="none"
        style={[
          styles.wheelHighlight,
          { top: WHEEL_PAD, borderColor: `${p.accent}55`, backgroundColor: `${p.accent}14` },
        ]}
      />
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        snapToInterval={WHEEL_ITEM_HEIGHT}
        decelerationRate="fast"
        nestedScrollEnabled
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingVertical: WHEEL_PAD }}
        onScroll={onScroll}
        onMomentumScrollEnd={settleNow}
      >
        {items.map((label, i) => {
          const active = i === index;
          return (
            <View key={label + i} style={styles.wheelItem}>
              <Text
                style={[
                  styles.wheelItemText,
                  { color: active ? p.accent : p.muted, fontSize: active ? 17 : 15 },
                  active && { fontWeight: '700' },
                ]}
              >
                {label}
              </Text>
            </View>
          );
        })}
      </ScrollView>
    </View>
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

      {/* Cadence/day pickers only — the WHAT TIME wheels below are
          deliberately OUTSIDE this ScrollView. A drag-to-scroll wheel
          nested inside another vertical ScrollView is a well-known RN
          gesture conflict: the outer ScrollView's pan responder can win
          the touch before it ever reaches the wheel, so every drag just
          scrolls the sheet and the wheel never commits a new value —
          this was the actual cause of "the time can't be changed" on a
          measurable's reminder. Keeping the wheel's own ScrollView as
          the only vertical scroll surface in this region removes the
          conflict outright rather than working around it. */}
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
        {(() => {
          const hour12 = to12Hour(schedule.hour);
          const period = toPeriod(schedule.hour);
          const hourIndex = HOURS_12.indexOf(hour12);
          // MINUTES only offers quarter-hours — a persisted minute off
          // that grid (e.g. an old reminder saved at :05) has no exact
          // match, and indexOf's -1 used to fall back to index 0 no
          // matter how far off :00 actually was, showing ":00" while
          // `schedule.minute` was still really 5. Snap the WHEEL to
          // whichever quarter-hour is closest instead, so what's
          // displayed at least reads as "roughly this value", not an
          // arbitrary always-zero default.
          const minuteIndex = MINUTES.reduce(
            (best, m, i) => (Math.abs(m - schedule.minute) < Math.abs(MINUTES[best] - schedule.minute) ? i : best),
            0,
          );
          const periodIndex = PERIODS.indexOf(period);
          // Re-snap the wheels if the target step somehow changes without
          // an unmount (defensive — both current callers unmount/remount
          // instead, see the reseed effect above).
          const resetSignal = step.id;
          return (
            <View style={styles.wheelRow}>
              <WheelColumn
                items={HOURS_12.map(String)}
                index={hourIndex}
                onChange={(i) => patch({ hour: to24Hour(HOURS_12[i], period) })}
                palette={p}
                width={52}
                resetSignal={resetSignal}
              />
              <Text style={[styles.wheelColon, { color: p.text }]}>:</Text>
              <WheelColumn
                items={MINUTES.map((m) => String(m).padStart(2, '0'))}
                index={minuteIndex}
                onChange={(i) => patch({ minute: MINUTES[i] })}
                palette={p}
                width={52}
                resetSignal={resetSignal}
              />
              <WheelColumn
                items={[...PERIODS]}
                index={periodIndex}
                onChange={(i) => patch({ hour: to24Hour(hour12, PERIODS[i]) })}
                palette={p}
                width={60}
                resetSignal={resetSignal}
              />
            </View>
          );
        })()}

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
// that presents a Modal, used by measurables.tsx/milestones.tsx where
// there's no already-open Modal underneath to collide with. Content only
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
  wheelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  wheelHighlight: {
    position: 'absolute', left: 0, right: 0, height: WHEEL_ITEM_HEIGHT,
    borderRadius: 10, borderWidth: 1,
  },
  wheelItem: { height: WHEEL_ITEM_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  wheelItemText: { fontWeight: '500' },
  wheelColon: { fontSize: 18, fontWeight: '700', marginTop: -2 },
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
