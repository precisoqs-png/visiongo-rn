import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  Measurable, measurableFraction, measurableStep, steppedValue, formatNumber,
  isMeasurableDeadlineOutdated, buildLadderWeeks,
} from '../../store/models';
import { Palette, FONTS } from '../../theme/themes';

interface Props {
  measurable: Measurable;
  // The parent goal's CURRENT "Achieve by" date — compared against what a
  // ladder's weeks were actually paced against, to flag it as outdated.
  goalTargetDate?: string;
  palette: Palette;
  onUpdate: (m: Measurable) => void;
  onDelete: (id: string) => void;
}

export function MeasurableCard({ measurable: m, goalTargetDate, palette, onUpdate, onDelete }: Props) {
  const p = palette;
  const frac = measurableFraction(m);

  return (
    <View style={[styles.card, { backgroundColor: p.surface }]}>
      {m.type === 'check' && <CheckRow m={m} p={p} onUpdate={onUpdate} onDelete={onDelete} />}
      {m.type === 'number' && <NumberRow m={m} p={p} onUpdate={onUpdate} onDelete={onDelete} frac={frac} />}
      {m.type === 'ladder' && (
        <LadderRows m={m} goalTargetDate={goalTargetDate} p={p} onUpdate={onUpdate} onDelete={onDelete} frac={frac} />
      )}
    </View>
  );
}

function CheckRow({ m, p, onUpdate, onDelete }: { m: Measurable; p: Palette; onUpdate: (m: Measurable) => void; onDelete: (id: string) => void }) {
  return (
    <View style={styles.row}>
      <TouchableOpacity
        style={[
          styles.checkbox,
          { borderColor: m.done ? p.accent : p.line },
          m.done && { backgroundColor: p.accent },
        ]}
        onPress={() => onUpdate({ ...m, done: !m.done })}
      >
        {m.done && <Ionicons name="checkmark" size={13} color={p.surface} />}
      </TouchableOpacity>
      <Text
        style={[
          styles.checkLabel,
          { color: m.done ? p.muted : p.text },
          m.done && { textDecorationLine: 'line-through' },
        ]}
      >
        {m.label}
      </Text>
      <TouchableOpacity onPress={() => onDelete(m.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Ionicons name="close" size={14} color={p.muted} />
      </TouchableOpacity>
    </View>
  );
}

function NumberRow({ m, p, onUpdate, onDelete, frac }: { m: Measurable; p: Palette; onUpdate: (m: Measurable) => void; onDelete: (id: string) => void; frac: number }) {
  // Each measurable carries its own increment — "145 / 150 days" ticks by 1,
  // while "$5000 saved" can tick by 50. No global guess from the target.
  const stepSize = measurableStep(m);
  const fmt = formatNumber;
  const atMin = m.current <= 0;
  const atMax = m.target > 0 && m.current >= m.target;

  return (
    <View>
      <View style={[styles.row, { marginBottom: 10 }]}>
        <Text style={[styles.numLabel, { color: p.text }]}>{m.label}</Text>
        <TouchableOpacity onPress={() => onDelete(m.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="close" size={14} color={p.muted} />
        </TouchableOpacity>
      </View>
      <View style={[styles.row, { marginBottom: 10 }]}>
        <TouchableOpacity
          style={[styles.stepper, { backgroundColor: p.line, opacity: atMin ? 0.4 : 1 }]}
          onPress={() => onUpdate({ ...m, current: steppedValue(m, -1) })}
          disabled={atMin}
          accessibilityLabel={`Subtract ${fmt(stepSize)} ${m.unit}`.trim()}
        >
          <Ionicons name="remove" size={16} color={p.text} />
        </TouchableOpacity>
        <Text style={[styles.stepperVal, { color: p.text }]}>
          {fmt(m.current)} / {fmt(m.target)} {m.unit}
        </Text>
        <TouchableOpacity
          style={[styles.stepper, { backgroundColor: p.line, opacity: atMax ? 0.4 : 1 }]}
          onPress={() => onUpdate({ ...m, current: steppedValue(m, 1) })}
          disabled={atMax}
          accessibilityLabel={`Add ${fmt(stepSize)} ${m.unit}`.trim()}
        >
          <Ionicons name="add" size={16} color={p.text} />
        </TouchableOpacity>
        <Text style={[styles.stepHint, { color: p.muted }]}>
          ±{fmt(stepSize)}{m.unit ? ` ${m.unit}` : ''}
        </Text>
      </View>
      <View style={[styles.progressTrack, { backgroundColor: p.line }]}>
        <View style={[styles.progressFill, { backgroundColor: p.accent, width: `${frac * 100}%` }]} />
      </View>
    </View>
  );
}

// Include the year only when it is not the current one — "by Jul 29" is
// ambiguous for a deadline that is actually next year.
function fmtDeadline(iso: string): string {
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }),
  });
}

function LadderRows({ m, goalTargetDate, p, onUpdate, onDelete, frac }: {
  m: Measurable; goalTargetDate?: string; p: Palette;
  onUpdate: (m: Measurable) => void; onDelete: (id: string) => void; frac: number;
}) {
  const fmt = formatNumber;
  const doneCount = m.weeks.filter((w) => w.done).length;
  const deadlineOutdated = isMeasurableDeadlineOutdated(m, goalTargetDate);

  // Re-pace the whole ladder against the goal's current date — same start
  // value and week count, just walked back from the new end date.
  const rebuildForNewDeadline = () => {
    const start = m.weeks[0]?.value ?? 0;
    const weeks = buildLadderWeeks(start, m.target, m.weeks.length || 4, goalTargetDate);
    onUpdate({ ...m, weeks, sizedForGoalDate: goalTargetDate });
  };

  return (
    <View>
      <View style={[styles.row, { marginBottom: 8 }]}>
        <Text style={[styles.numLabel, { color: p.text }]}>{m.label}</Text>
        <Text style={[styles.ladderPct, { color: p.accent }]}>
          {doneCount}/{m.weeks.length} wks
        </Text>
        <TouchableOpacity onPress={() => onDelete(m.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ marginLeft: 8 }}>
          <Ionicons name="close" size={14} color={p.muted} />
        </TouchableOpacity>
      </View>

      {deadlineOutdated && (
        <View style={[styles.outdatedBanner, { backgroundColor: '#e8930022', borderColor: '#e89300' }]}>
          <Ionicons name="alert-circle-outline" size={15} color="#c47700" style={{ marginTop: 1 }} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.outdatedText, { color: p.text }]}>
              These weekly steps were paced for {m.sizedForGoalDate ? fmtDeadline(m.sizedForGoalDate) : 'no deadline'} — the
              goal's deadline is now {goalTargetDate ? fmtDeadline(goalTargetDate) : 'unset'}.
            </Text>
            <View style={styles.outdatedActions}>
              <TouchableOpacity onPress={rebuildForNewDeadline}>
                <Text style={[styles.outdatedActionText, { color: '#c47700' }]}>
                  Update to {goalTargetDate ? fmtDeadline(goalTargetDate) : 'no deadline'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                // Dismiss = stop comparing this ladder's pacing to the goal's
                // date at all — clear the tracking rather than re-pointing it
                // at the OLD deadline, which would just re-trip the flag.
                onPress={() => onUpdate({ ...m, sizedForGoalDate: undefined })}
              >
                <Text style={[styles.outdatedActionText, { color: p.muted }]}>Keep as-is</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {m.weeks.map((week, idx) => {
        const due = new Date(week.targetDate);
        const dueStr = due.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        return (
          <View key={week.id} style={[styles.row, { marginBottom: 6 }]}>
            <TouchableOpacity
              style={[
                styles.ladderBox,
                { borderColor: week.done ? p.accent : p.line },
                week.done && { backgroundColor: p.accent },
              ]}
              onPress={() => {
                const weeks = m.weeks.map((w) => w.id === week.id ? { ...w, done: !w.done } : w);
                onUpdate({ ...m, weeks });
              }}
            >
              {week.done && <Ionicons name="checkmark" size={10} color={p.surface} />}
            </TouchableOpacity>
            <Text style={[styles.ladderVal, { color: week.done ? p.muted : p.text }]}>
              {fmt(week.value)} {m.unit}
            </Text>
            <Text style={[styles.ladderDue, { color: p.muted }]}>by {dueStr}</Text>
            <Text style={[styles.ladderStep, { color: p.muted }]}>Step {idx + 1}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 14, padding: 14, marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  checkbox: { width: 24, height: 24, borderRadius: 6, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  checkLabel: { flex: 1, fontSize: 15 },
  numLabel: { flex: 1, fontSize: 15, fontWeight: '600' },
  stepper: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  stepperVal: { fontSize: 15, fontWeight: '700' },
  stepHint: { fontSize: 11, marginLeft: 'auto' },
  progressTrack: { height: 5, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: 5, borderRadius: 3 },
  ladderPct: { fontSize: 13, fontWeight: '700' },
  ladderBox: { width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  ladderVal: { fontSize: 13, fontWeight: '500', flex: 1 },
  ladderDue: { fontSize: 12 },
  ladderStep: { fontSize: 11 },
  outdatedBanner: {
    flexDirection: 'row', gap: 8, borderWidth: 1, borderRadius: 12,
    padding: 10, marginBottom: 10,
  },
  outdatedText: { fontSize: 12, lineHeight: 16 },
  outdatedActions: { flexDirection: 'row', gap: 16, marginTop: 6 },
  outdatedActionText: { fontSize: 12, fontWeight: '700' },
});
