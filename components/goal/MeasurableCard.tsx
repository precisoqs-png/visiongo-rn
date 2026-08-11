import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  Measurable, Commitment, measurableFraction, measurableStep, steppedValue, formatNumber,
  isMeasurableDeadlineOutdated, buildLadderWeeks, milestonePercent,
} from '../../store/models';
import { Palette, FONTS } from '../../theme/themes';
import { useCompletionPulse } from '../shared/useCompletionPulse';
import { useCompletionBurst } from '../shared/useCompletionBurst';
import { CommitmentsBlock } from './CommitmentsBlock';

interface Props {
  measurable: Measurable;
  // The parent goal's CURRENT "Achieve by" date — compared against what a
  // ladder's weeks were actually paced against, to flag it as outdated.
  goalTargetDate?: string;
  palette: Palette;
  // The parent goal's own color (GOAL_NOTE_COLORS[goal.colorIndex % ...]) —
  // every progress-indicating element on this card (checkbox fill, progress
  // bar, ladder boxes, completion burst) renders in this instead of the
  // theme's flat accent color, so a goal's Measurables list carries the same
  // per-goal color identity as its canvas bubbles and its board bubble.
  noteColor: string;
  onUpdate: (m: Measurable) => void;
  onDelete: (id: string) => void;
  // Opens the same reminder sheet a Milestone Commitment uses, for this
  // measurable. Optional so existing call sites don't have to be updated
  // in lockstep — no bell renders if it's omitted.
  onOpenSchedule?: (m: Measurable) => void;
  // Opens the reminder sheet for ONE of this item's Commitments, rather than
  // the item's own reminder. Only ever relevant for a milestone-flagged item
  // (see the `m.milestone` block below) — measurables.tsx never passes this,
  // since a plain measurable's commitments array is always empty.
  onOpenCommitmentSchedule?: (m: Measurable, step: Commitment) => void;
  // Hands a 'commitment'-type (former "effort") milestone to the AI coach
  // for a baseline + weekly target. Only rendered for that type.
  onAskCoach?: (m: Measurable) => void;
}

// Small bell button, same shape/behaviour as MilestoneSection's step bell —
// tinted when a reminder is on, otherwise a plain outline.
function ScheduleBell({ m, p, onOpenSchedule }: { m: Measurable; p: Palette; onOpenSchedule?: (m: Measurable) => void }) {
  if (!onOpenSchedule) return null;
  const on = !!m.schedule?.on;
  return (
    <TouchableOpacity
      onPress={() => onOpenSchedule(m)}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      accessibilityLabel={`Edit reminder for ${m.label}`}
      style={[styles.bellTarget, on && { backgroundColor: `${p.accent}1f` }]}
    >
      <Ionicons name={on ? 'notifications' : 'notifications-outline'} size={17} color={on ? p.accent : p.muted} />
    </TouchableOpacity>
  );
}

// Include the year only when it is not the current one — "by Jul 29" is
// ambiguous for a deadline that is actually next year.
function fmtDeadlineShared(iso: string): string {
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }),
  });
}

export function MeasurableCard({
  measurable: m, goalTargetDate, palette, noteColor, onUpdate, onDelete, onOpenSchedule, onOpenCommitmentSchedule, onAskCoach,
}: Props) {
  const p = palette;
  const frac = measurableFraction(m);
  // Commitments start collapsed so the flat list reads as one row per item —
  // expanding is opt-in, not a permanently-visible nested section.
  const [commitmentsOpen, setCommitmentsOpen] = useState(false);

  // Celebratory glow the moment THIS card's measurable finishes (fraction
  // hits 1) — however that happened (checkbox, stepper, or the last ladder
  // week), mirroring MeasurableBubble's own burst on the canvas so the same
  // "just completed" moment reads consistently wherever it's edited from.
  const { scale: burstScale, opacity: burstOpacity, fire: fireBurst } = useCompletionBurst();
  const prevFracRef = useRef(frac);
  useEffect(() => {
    if (frac >= 1 && prevFracRef.current < 1) fireBurst();
    prevFracRef.current = frac;
  }, [frac]);

  // A milestone-flagged item's own deadline going stale relative to the
  // goal's current date — independent of a ladder's own week-pacing banner
  // below, which already covers the ladder case via `sizedForGoalDate`.
  const deadlineOutdated = m.milestone && m.type !== 'ladder' && isMeasurableDeadlineOutdated(m, goalTargetDate);

  return (
    <View style={[styles.card, { backgroundColor: p.surface }]}>
      {m.type === 'check' && <CheckRow m={m} p={p} noteColor={noteColor} onUpdate={onUpdate} onDelete={onDelete} onOpenSchedule={onOpenSchedule} />}
      {m.type === 'number' && <NumberRow m={m} p={p} noteColor={noteColor} onUpdate={onUpdate} onDelete={onDelete} frac={frac} onOpenSchedule={onOpenSchedule} />}
      {m.type === 'ladder' && (
        <LadderRows m={m} goalTargetDate={goalTargetDate} p={p} noteColor={noteColor} onUpdate={onUpdate} onDelete={onDelete} frac={frac} onOpenSchedule={onOpenSchedule} />
      )}
      {m.type === 'commitment' && (
        <CommitmentTypeRow m={m} p={p} noteColor={noteColor} onUpdate={onUpdate} onDelete={onDelete} frac={frac} onOpenSchedule={onOpenSchedule} onAskCoach={onAskCoach} />
      )}

      {m.milestone && m.deadline && (
        <Text style={[styles.deadlineMeta, { color: p.muted }]}>by {fmtDeadlineShared(m.deadline)}</Text>
      )}

      {deadlineOutdated && (
        <View style={[styles.outdatedBanner, { backgroundColor: '#e8930022', borderColor: '#e89300' }]}>
          <Ionicons name="alert-circle-outline" size={15} color="#c47700" style={{ marginTop: 1 }} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.outdatedText, { color: p.text }]}>
              This was sized for {m.sizedForGoalDate ? fmtDeadlineShared(m.sizedForGoalDate) : 'no deadline'} — the
              goal's deadline is now {goalTargetDate ? fmtDeadlineShared(goalTargetDate) : 'unset'}.
            </Text>
            <View style={styles.outdatedActions}>
              <TouchableOpacity onPress={() => onUpdate({ ...m, deadline: goalTargetDate, sizedForGoalDate: goalTargetDate })}>
                <Text style={[styles.outdatedActionText, { color: '#c47700' }]}>
                  Update to {goalTargetDate ? fmtDeadlineShared(goalTargetDate) : 'no deadline'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => onUpdate({ ...m, sizedForGoalDate: undefined })}>
                <Text style={[styles.outdatedActionText, { color: p.muted }]}>Keep as-is</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* Recurring commitments — only ever present on a milestone-flagged
          item (a plain measurable's `commitments` is always empty), so this
          never renders on measurables.tsx's cards. */}
      {m.milestone && onOpenCommitmentSchedule && (
        <CommitmentsBlock
          item={m}
          palette={p}
          onUpdate={onUpdate}
          onOpenSchedule={(step) => onOpenCommitmentSchedule(m, step)}
          expanded={commitmentsOpen}
          onToggleExpand={() => setCommitmentsOpen((v) => !v)}
        />
      )}

      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          styles.cardBurst,
          {
            borderColor: noteColor,
            opacity: burstOpacity,
            transform: [{ scale: burstScale.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1.04] }) }],
          },
        ]}
      />
    </View>
  );
}

// A former "effort" Milestone — no current/target of its own, entirely
// driven by its attached Commitments (see measurableFraction's 'commitment'
// branch). `done` is a manual override a user can still flip directly.
function CommitmentTypeRow({ m, p, noteColor, onUpdate, onDelete, frac, onOpenSchedule, onAskCoach }: {
  m: Measurable; p: Palette; noteColor: string; onUpdate: (m: Measurable) => void; onDelete: (id: string) => void; frac: number;
  onOpenSchedule?: (m: Measurable) => void; onAskCoach?: (m: Measurable) => void;
}) {
  const { scale, pulse } = useCompletionPulse();
  const pct = milestonePercent(m);
  return (
    <View>
      <View style={[styles.row, { marginBottom: 8 }]}>
        <Animated.View style={{ transform: [{ scale }] }}>
          <TouchableOpacity
            onPress={() => { const next = !m.done; onUpdate({ ...m, done: next }); pulse(next); }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel={m.done ? 'Mark not done' : 'Mark done'}
          >
            <Ionicons name={m.done ? 'checkmark-circle' : 'ellipse-outline'} size={20} color={m.done ? noteColor : p.muted} />
          </TouchableOpacity>
        </Animated.View>
        <Text style={[styles.numLabel, { color: m.done ? p.muted : p.text }]}>{m.label}</Text>
        <Text style={[styles.ladderPct, { color: noteColor }]}>{pct}%</Text>
        <ScheduleBell m={m} p={p} onOpenSchedule={onOpenSchedule} />
        <TouchableOpacity onPress={() => onDelete(m.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={styles.deleteCircle}>
          <Ionicons name="close" size={12} color={p.muted} />
        </TouchableOpacity>
      </View>
      <View style={[styles.progressTrack, { backgroundColor: p.line }]}>
        <View style={[styles.progressFill, { backgroundColor: noteColor, width: `${frac * 100}%` }]} />
      </View>
      {onAskCoach && (
        <TouchableOpacity style={[styles.askCoachBtn, { borderColor: `${p.accent}66` }]} onPress={() => onAskCoach(m)}>
          <Ionicons name="sparkles-outline" size={12} color={p.accent} />
          <Text style={[styles.askCoachText, { color: p.accent }]}>Ask coach</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function CheckRow({ m, p, noteColor, onUpdate, onDelete, onOpenSchedule }: {
  m: Measurable; p: Palette; noteColor: string; onUpdate: (m: Measurable) => void; onDelete: (id: string) => void;
  onOpenSchedule?: (m: Measurable) => void;
}) {
  const { scale, pulse } = useCompletionPulse();
  return (
    <View style={styles.row}>
      <Animated.View style={{ transform: [{ scale }] }}>
        <TouchableOpacity
          style={[
            styles.checkbox,
            { borderColor: m.done ? noteColor : p.line },
            m.done && { backgroundColor: noteColor },
          ]}
          onPress={() => {
            const next = !m.done;
            onUpdate({ ...m, done: next });
            pulse(next);
          }}
        >
          {m.done && <Ionicons name="checkmark" size={13} color={p.surface} />}
        </TouchableOpacity>
      </Animated.View>
      <Text
        style={[
          styles.checkLabel,
          { color: m.done ? p.muted : p.text },
          m.done && { textDecorationLine: 'line-through' },
        ]}
      >
        {m.label}
      </Text>
      <ScheduleBell m={m} p={p} onOpenSchedule={onOpenSchedule} />
      <TouchableOpacity
        onPress={() => onDelete(m.id)}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        style={styles.deleteCircle}
      >
        <Ionicons name="close" size={12} color={p.muted} />
      </TouchableOpacity>
    </View>
  );
}

function NumberRow({ m, p, noteColor, onUpdate, onDelete, frac, onOpenSchedule }: {
  m: Measurable; p: Palette; noteColor: string; onUpdate: (m: Measurable) => void; onDelete: (id: string) => void; frac: number;
  onOpenSchedule?: (m: Measurable) => void;
}) {
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
        <ScheduleBell m={m} p={p} onOpenSchedule={onOpenSchedule} />
        <TouchableOpacity
          onPress={() => onDelete(m.id)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={styles.deleteCircle}
        >
          <Ionicons name="close" size={12} color={p.muted} />
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
        <View style={[styles.progressFill, { backgroundColor: noteColor, width: `${frac * 100}%` }]} />
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

function LadderRows({ m, goalTargetDate, p, noteColor, onUpdate, onDelete, frac, onOpenSchedule }: {
  m: Measurable; goalTargetDate?: string; p: Palette; noteColor: string;
  onUpdate: (m: Measurable) => void; onDelete: (id: string) => void; frac: number;
  onOpenSchedule?: (m: Measurable) => void;
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
        <Text style={[styles.ladderPct, { color: noteColor }]}>
          {doneCount}/{m.weeks.length} wks
        </Text>
        <ScheduleBell m={m} p={p} onOpenSchedule={onOpenSchedule} />
        <TouchableOpacity
          onPress={() => onDelete(m.id)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={[styles.deleteCircle, { marginLeft: 0 }]}
        >
          <Ionicons name="close" size={12} color={p.muted} />
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

      {m.weeks.map((week, idx) => (
        <LadderWeekRow
          key={week.id}
          week={week}
          idx={idx}
          unit={m.unit}
          p={p}
          noteColor={noteColor}
          onToggle={() => {
            const weeks = m.weeks.map((w) => w.id === week.id ? { ...w, done: !w.done } : w);
            onUpdate({ ...m, weeks });
          }}
        />
      ))}
    </View>
  );
}

function LadderWeekRow({ week, idx, unit, p, noteColor, onToggle }: {
  week: { id: string; value: number; targetDate: string; done: boolean };
  idx: number; unit: string; p: Palette; noteColor: string; onToggle: () => void;
}) {
  const { scale, pulse } = useCompletionPulse();
  const fmt = formatNumber;
  const due = new Date(week.targetDate);
  const dueStr = due.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  return (
    <View style={[styles.row, { marginBottom: 6 }]}>
      <Animated.View style={{ transform: [{ scale }] }}>
        <TouchableOpacity
          style={[
            styles.ladderBox,
            { borderColor: week.done ? noteColor : p.line },
            week.done && { backgroundColor: noteColor },
          ]}
          onPress={() => {
            const next = !week.done;
            onToggle();
            pulse(next);
          }}
        >
          {week.done && <Ionicons name="checkmark" size={10} color={p.surface} />}
        </TouchableOpacity>
      </Animated.View>
      <Text style={[styles.ladderVal, { color: week.done ? p.muted : p.text }]}>
        {fmt(week.value)} {unit}
      </Text>
      <Text style={[styles.ladderDue, { color: p.muted }]}>by {dueStr}</Text>
      <Text style={[styles.ladderStep, { color: p.muted }]}>Step {idx + 1}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 14, padding: 14, marginBottom: 10 },
  cardBurst: { borderRadius: 14, borderWidth: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bellTarget: {
    width: 26, height: 26, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center',
  },
  checkbox: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  deleteCircle: { width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(128,128,128,0.15)', alignItems: 'center', justifyContent: 'center' },
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
  deadlineMeta: { fontSize: 11, marginTop: -4, marginBottom: 6 },
  askCoachBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start',
    borderWidth: 1, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6, marginTop: 10,
  },
  askCoachText: { fontSize: 12, fontWeight: '600' },
});
