import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Platform, Alert, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  TrackableItem, Commitment, Cadence,
  newCommitment, cadenceLabel, isStepDoneThisPeriod, currentBuildUpWeek,
  commitmentStreak, formatNumber, periodKey, buildCommitmentRamp,
} from '../../store/models';
import { describeSchedule } from '../../services/notificationService';
import { Palette } from '../../theme/themes';
import { useCompletionPulse } from '../shared/useCompletionPulse';

// Commitment management for a milestone-flagged TrackableItem, mutated
// entirely through one `onUpdate(item)` call — no dedicated store actions.
// This mirrors, at the call site, exactly what useAppStore's now-unused-here
// addCommitment/toggleStepCheckIn/toggleRampWeek used to do internally, just
// computed in the component instead of behind a milestone-specific action.

interface Props {
  item: TrackableItem;
  palette: Palette;
  onUpdate: (item: TrackableItem) => void;
  onOpenSchedule: (step: Commitment) => void;
  expanded: boolean;
  onToggleExpand: () => void;
}

function confirmDelete(what: string, onYes: () => void) {
  const msg = `Delete "${what}"? This cannot be undone.`;
  if (Platform.OS === 'web') {
    if (window.confirm(msg)) onYes();
  } else {
    Alert.alert('Delete', msg, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: onYes },
    ]);
  }
}

export function CommitmentsBlock({ item, palette: p, onUpdate, onOpenSchedule, expanded, onToggleExpand }: Props) {
  const [adding, setAdding] = useState(false);
  const [expandedStepId, setExpandedStepId] = useState<string | null>(null);
  const commitments = item.commitments;

  // Same math useAppStore.toggleStepCheckIn used to do: a numeric milestone
  // moves `current` by the step's own amount when checked, un-moves it when
  // unchecked; a build-up toggles whichever week is currently active.
  const toggleCheckIn = (step: Commitment) => {
    if (step.ramp) {
      const week = currentBuildUpWeek(step);
      if (!week) return;
      onUpdate({
        ...item,
        commitments: item.commitments.map((s) => s.id === step.id
          ? { ...s, ramp: s.ramp!.map((w) => (w.id === week.id ? { ...w, done: !w.done } : w)) }
          : s),
      });
      return;
    }
    const key = periodKey(step);
    const wasDone = step.completions.includes(key);
    const completions = wasDone
      ? step.completions.filter((k) => k !== key)
      : [...step.completions, key];
    let current = item.current;
    if (item.type === 'number' && step.amount) {
      const delta = wasDone ? -step.amount : step.amount;
      const next = Math.round(((current ?? 0) + delta) * 1000) / 1000;
      current = Math.min(Math.max(next, 0), Math.max(item.target ?? 0, 0));
    }
    onUpdate({
      ...item,
      current,
      commitments: item.commitments.map((s) => (s.id === step.id ? { ...s, completions } : s)),
    });
  };

  const toggleRampWeek = (step: Commitment, weekId: string) => {
    onUpdate({
      ...item,
      commitments: item.commitments.map((s) => (s.id === step.id && s.ramp
        ? { ...s, ramp: s.ramp.map((w) => (w.id === weekId ? { ...w, done: !w.done } : w)) }
        : s)),
    });
  };

  const deleteStep = (stepId: string, label: string) => {
    confirmDelete(label, () => onUpdate({
      ...item, commitments: item.commitments.filter((s) => s.id !== stepId),
    }));
  };

  const addStep = (step: Commitment) => {
    onUpdate({ ...item, commitments: [...item.commitments, step] });
    setAdding(false);
  };

  const summary = commitments.length === 0
    ? 'No commitments yet'
    : `${commitments.length} commitment${commitments.length === 1 ? '' : 's'}`;

  return (
    <View style={styles.wrap}>
      <TouchableOpacity style={styles.summaryRow} onPress={onToggleExpand} activeOpacity={0.7}>
        <Ionicons name="repeat" size={13} color={p.muted} />
        <Text style={[styles.summaryText, { color: p.muted }]}>{summary}</Text>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color={p.muted} />
      </TouchableOpacity>

      {expanded && (
        <View style={{ marginTop: 6 }}>
          {commitments.map((step) => (
            step.ramp
              ? (
                <BuildUpStepRow
                  key={step.id}
                  step={step}
                  palette={p}
                  expanded={expandedStepId === step.id}
                  onToggleExpand={() => setExpandedStepId((id) => (id === step.id ? null : step.id))}
                  onToggleCheckIn={() => toggleCheckIn(step)}
                  onToggleWeek={(weekId) => toggleRampWeek(step, weekId)}
                  onOpenSchedule={() => onOpenSchedule(step)}
                  onDelete={() => deleteStep(step.id, step.label)}
                />
              )
              : (
                <FlatStepRow
                  key={step.id}
                  step={step}
                  palette={p}
                  onToggleCheckIn={() => toggleCheckIn(step)}
                  onOpenSchedule={() => onOpenSchedule(step)}
                  onDelete={() => deleteStep(step.id, step.label)}
                />
              )
          ))}

          {adding ? (
            <CommitmentForm item={item} palette={p} onAdd={addStep} onCancel={() => setAdding(false)} />
          ) : (
            <TouchableOpacity style={[styles.addPill, { borderColor: p.line }]} onPress={() => setAdding(true)}>
              <Ionicons name="add" size={13} color={p.text} />
              <Text style={[styles.addPillText, { color: p.text }]}>Commitment</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

function FlatStepRow({ step, palette: p, onToggleCheckIn, onOpenSchedule, onDelete }: {
  step: Commitment; palette: Palette;
  onToggleCheckIn: () => void; onOpenSchedule: () => void; onDelete: () => void;
}) {
  const doneNow = isStepDoneThisPeriod(step);
  const streak = commitmentStreak(step);
  const { scale, pulse } = useCompletionPulse();
  return (
    <View style={[styles.stepRow, { borderColor: p.line }]}>
      <Animated.View style={{ transform: [{ scale }] }}>
        <TouchableOpacity
          onPress={() => { const next = !doneNow; onToggleCheckIn(); pulse(next); }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel={doneNow ? `Undo ${step.label}` : `Check in: ${step.label}`}
        >
          <Ionicons name={doneNow ? 'checkbox' : 'square-outline'} size={19} color={doneNow ? p.accent : p.muted} />
        </TouchableOpacity>
      </Animated.View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.stepLabel, { color: doneNow ? p.muted : p.text }, doneNow && { textDecorationLine: 'line-through' }]}>
          {step.label}
        </Text>
        <Text style={[styles.stepMeta, { color: p.muted }]}>
          {cadenceLabel(step)} · {describeSchedule(step)}
          {step.completions.length > 0 && ` · ${step.completions.length} done`}
          {streak >= 2 && ` · 🔥 ${streak}-streak`}
        </Text>
      </View>
      <TouchableOpacity
        onPress={onOpenSchedule}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityLabel={`Edit reminder for ${step.label}`}
        style={[styles.bellTarget, step.schedule.on && { backgroundColor: `${p.accent}1f` }]}
      >
        <Ionicons name={step.schedule.on ? 'notifications' : 'notifications-outline'} size={19} color={step.schedule.on ? p.accent : p.muted} />
      </TouchableOpacity>
      <TouchableOpacity onPress={onDelete} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Ionicons name="close" size={14} color={p.muted} />
      </TouchableOpacity>
    </View>
  );
}

function BuildUpStepRow({ step, palette: p, expanded, onToggleExpand, onToggleCheckIn, onToggleWeek, onOpenSchedule, onDelete }: {
  step: Commitment; palette: Palette; expanded: boolean;
  onToggleExpand: () => void; onToggleCheckIn: () => void;
  onToggleWeek: (weekId: string) => void; onOpenSchedule: () => void; onDelete: () => void;
}) {
  const weeks = step.ramp ?? [];
  const doneCount = weeks.filter((w) => w.done).length;
  const current = currentBuildUpWeek(step);
  const doneNow = current?.done ?? false;
  const fmt = formatNumber;
  const { scale, pulse } = useCompletionPulse();

  return (
    <View style={[styles.stepRow, { borderColor: p.line, alignItems: 'flex-start' }]}>
      <Animated.View style={{ transform: [{ scale }], marginTop: 1 }}>
        <TouchableOpacity
          onPress={() => { const next = !doneNow; onToggleCheckIn(); pulse(next); }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel={doneNow ? `Undo this week's target` : `Check in: ${step.label}`}
        >
          <Ionicons name={doneNow ? 'checkbox' : 'square-outline'} size={19} color={doneNow ? p.accent : p.muted} />
        </TouchableOpacity>
      </Animated.View>
      <TouchableOpacity style={{ flex: 1 }} onPress={onToggleExpand} activeOpacity={0.7}>
        <Text style={[styles.stepLabel, { color: p.text }]}>{step.label}</Text>
        <Text style={[styles.stepMeta, { color: p.muted }]}>
          {cadenceLabel(step)} · {doneCount}/{weeks.length} weeks · {describeSchedule(step)}
          {current && !doneNow && ` · this week: ${fmt(current.value)} ${step.unit ?? ''}`.trimEnd()}
        </Text>
        {expanded && (
          <View style={{ marginTop: 8 }}>
            {weeks.map((week, idx) => (
              <RampWeekRow
                key={week.id}
                week={week}
                idx={idx}
                unit={step.unit}
                isCurrent={current?.id === week.id}
                p={p}
                onToggle={() => onToggleWeek(week.id)}
              />
            ))}
          </View>
        )}
      </TouchableOpacity>
      <TouchableOpacity
        onPress={onToggleExpand}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityLabel={expanded ? 'Collapse weekly ramp' : 'Expand weekly ramp'}
        style={{ marginTop: 1 }}
      >
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={p.muted} />
      </TouchableOpacity>
      <TouchableOpacity
        onPress={onOpenSchedule}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityLabel={`Edit reminder for ${step.label}`}
        style={[styles.bellTarget, step.schedule.on && { backgroundColor: `${p.accent}1f` }]}
      >
        <Ionicons name={step.schedule.on ? 'notifications' : 'notifications-outline'} size={19} color={step.schedule.on ? p.accent : p.muted} />
      </TouchableOpacity>
      <TouchableOpacity onPress={onDelete} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ marginTop: 1 }}>
        <Ionicons name="close" size={14} color={p.muted} />
      </TouchableOpacity>
    </View>
  );
}

function RampWeekRow({ week, idx, unit, isCurrent, p, onToggle }: {
  week: { id: string; value: number; targetDate: string; done: boolean };
  idx: number; unit?: string; isCurrent: boolean; p: Palette; onToggle: () => void;
}) {
  const { scale, pulse } = useCompletionPulse();
  const fmt = formatNumber;
  const due = new Date(week.targetDate);
  const dueStr = due.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  return (
    <View style={styles.rampWeekRow}>
      <Animated.View style={{ transform: [{ scale }] }}>
        <TouchableOpacity
          style={[styles.ladderBox, { borderColor: week.done ? p.accent : p.line }, week.done && { backgroundColor: p.accent }]}
          onPress={() => { const next = !week.done; onToggle(); pulse(next); }}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        >
          {week.done && <Ionicons name="checkmark" size={10} color={p.surface} />}
        </TouchableOpacity>
      </Animated.View>
      <Text style={[styles.rampWeekVal, { color: week.done ? p.muted : p.text }]}>{fmt(week.value)} {unit ?? ''}</Text>
      <Text style={[styles.rampWeekDue, { color: p.muted }]}>by {dueStr}</Text>
      <Text style={[styles.rampWeekIdx, { color: isCurrent ? p.accent : p.muted }]}>Wk {idx + 1}{isCurrent ? ' · now' : ''}</Text>
    </View>
  );
}

// One form for both commitment shapes, matching the manual-add form the
// old MilestoneSection used — kept as-is, just handing the finished
// Commitment back to the caller's onAdd instead of a dedicated store action.
function CommitmentForm({ item, palette: p, onAdd, onCancel }: {
  item: TrackableItem; palette: Palette; onAdd: (step: Commitment) => void; onCancel: () => void;
}) {
  const [buildUp, setBuildUp] = useState(false);
  const [label, setLabel] = useState('');
  const [cadence, setCadence] = useState<Cadence>('weekly');
  const [startStr, setStartStr] = useState('');
  const [endStr, setEndStr] = useState('');
  const [unit, setUnit] = useState(item.unit ?? '');
  const [weeksStr, setWeeksStr] = useState('8');

  const start = parseFloat(startStr);
  const end = parseFloat(endStr);
  const weeksCount = Math.max(1, parseInt(weeksStr, 10) || 1);
  const valid = buildUp
    ? !!label.trim() && Number.isFinite(start) && Number.isFinite(end) && end !== start
    : !!label.trim();

  const commit = () => {
    if (!valid) return;
    if (buildUp) {
      const ramp = buildCommitmentRamp(start, end, weeksCount, item.deadline);
      onAdd(newCommitment({ label: label.trim(), cadence: 'weekly', unit: unit || undefined, amount: end, ramp }));
    } else {
      onAdd(newCommitment({ label: label.trim(), cadence, unit: item.unit }));
    }
  };

  return (
    <View style={{ marginTop: 8 }}>
      <View style={[styles.segmented, { backgroundColor: p.line }]}>
        {([[false, 'Same each time'], [true, 'Build up gradually']] as const).map(([v, text]) => (
          <TouchableOpacity
            key={String(v)}
            style={[styles.segBtn, buildUp === v && { backgroundColor: p.ink }]}
            onPress={() => setBuildUp(v)}
          >
            <Text style={[styles.segText, { color: buildUp === v ? (p.isDark ? p.bg : '#fff') : p.muted }]}>{text}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <TextInput
        style={[styles.input, { backgroundColor: p.bg, color: p.text, borderColor: p.line, marginTop: 8 }]}
        placeholder={buildUp ? 'e.g. "Weekly build-up"' : 'e.g. "One check-in per week"'}
        placeholderTextColor={p.muted}
        value={label}
        onChangeText={setLabel}
      />
      {buildUp ? (
        <View style={styles.inputRow}>
          <TextInput style={[styles.inputSmall, { backgroundColor: p.bg, color: p.text, flex: 1 }]} placeholder="Start" placeholderTextColor={p.muted} keyboardType="numeric" value={startStr} onChangeText={setStartStr} />
          <Text style={{ color: p.muted }}>→</Text>
          <TextInput style={[styles.inputSmall, { backgroundColor: p.bg, color: p.text, flex: 1 }]} placeholder="End" placeholderTextColor={p.muted} keyboardType="numeric" value={endStr} onChangeText={setEndStr} />
          <TextInput style={[styles.inputSmall, { backgroundColor: p.bg, color: p.text, flex: 1 }]} placeholder="Unit" placeholderTextColor={p.muted} value={unit} onChangeText={setUnit} />
          <TextInput style={[styles.inputSmall, { backgroundColor: p.bg, color: p.text, flex: 1 }]} placeholder="Weeks" placeholderTextColor={p.muted} keyboardType="numeric" value={weeksStr} onChangeText={setWeeksStr} />
        </View>
      ) : (
        <View style={[styles.segmented, { backgroundColor: p.line, marginTop: 8 }]}>
          {(['weekly', 'monthly', 'custom'] as const).map((c) => (
            <TouchableOpacity key={c} style={[styles.segBtn, cadence === c && { backgroundColor: p.ink }]} onPress={() => setCadence(c)}>
              <Text style={[styles.segText, { color: cadence === c ? (p.isDark ? p.bg : '#fff') : p.muted }]}>
                {c === 'weekly' ? 'Weekly' : c === 'monthly' ? 'Monthly' : 'Custom'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      <View style={styles.formActions}>
        <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: valid ? p.ink : p.muted }]} onPress={commit} disabled={!valid}>
          <Text style={[styles.primaryText, { color: p.isDark ? p.bg : '#fff' }]}>Add commitment</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onCancel}>
          <Text style={[styles.linkText, { color: p.muted }]}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 10 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  summaryText: { fontSize: 12, fontWeight: '600', flex: 1 },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, paddingVertical: 9 },
  stepLabel: { fontSize: 14, fontWeight: '500' },
  stepMeta: { fontSize: 11, marginTop: 2 },
  bellTarget: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  rampWeekRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  ladderBox: { width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  rampWeekVal: { fontSize: 13, fontWeight: '500', flex: 1 },
  rampWeekDue: { fontSize: 11 },
  rampWeekIdx: { fontSize: 10, fontWeight: '700', marginLeft: 6 },
  addPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start',
    borderWidth: 1, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6, marginTop: 6,
  },
  addPillText: { fontSize: 12, fontWeight: '600' },
  segmented: { flexDirection: 'row', borderRadius: 18, padding: 3, gap: 2 },
  segBtn: { flex: 1, paddingVertical: 6, borderRadius: 15, alignItems: 'center' },
  segText: { fontSize: 12, fontWeight: '600' },
  input: { borderRadius: 10, padding: 11, fontSize: 14, borderWidth: 1, minWidth: 0 },
  inputRow: { flexDirection: 'row', gap: 6, marginTop: 8, alignItems: 'center' },
  inputSmall: { borderRadius: 8, padding: 8, fontSize: 13, minWidth: 0 },
  formActions: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 10 },
  primaryBtn: { borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14, alignItems: 'center' },
  primaryText: { fontSize: 13, fontWeight: '700' },
  linkText: { fontSize: 13, fontWeight: '500' },
});
