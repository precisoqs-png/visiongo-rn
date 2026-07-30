import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Platform, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  Goal, MinorGoal, MinorGoalKind, AccountableStep, BreakdownOption,
  Cadence, StepSchedule,
  newMinorGoal, newAccountableStep, minorGoalPercent, minorGoalFraction,
  steppedMinorGoalValue, minorGoalStep, isStepDoneThisPeriod, cadenceLabel,
  suggestBreakdowns, DEFAULT_SCHEDULE, formatAmount,
  buildAccountableRamp, currentRampWeek, isMinorGoalDeadlineOutdated,
} from '../../store/models';
import { describeSchedule } from '../../services/notificationService';
import { Palette } from '../../theme/themes';
import { CalendarPicker } from '../shared/CalendarPicker';
import { BreakdownPrompt } from './BreakdownPrompt';
import { StepScheduleSheet } from './StepScheduleSheet';

interface Props {
  goal: Goal;
  palette: Palette;
  onAddMinorGoal: (mg: MinorGoal) => void;
  onUpdateMinorGoal: (mg: MinorGoal) => void;
  onDeleteMinorGoal: (mgId: string) => void;
  onAddStep: (step: AccountableStep, mgId: string) => void;
  onUpdateStep: (step: AccountableStep, mgId: string) => void;
  onDeleteStep: (stepId: string, mgId: string) => void;
  onToggleCheckIn: (stepId: string, mgId: string) => void;
  // Toggles one specific week of a progressive-ramp step (expanded view).
  onToggleRampWeek: (stepId: string, weekId: string, mgId: string) => void;
  // Hands an effort minor goal to the AI coach for a baseline + weekly target.
  onAskCoach: (mg: MinorGoal) => void;
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

function fmtNum(v: number): string {
  return v % 1 === 0 ? v.toLocaleString('en-US') : v.toFixed(1);
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

export function MinorGoalSection({
  goal, palette: p,
  onAddMinorGoal, onUpdateMinorGoal, onDeleteMinorGoal,
  onAddStep, onUpdateStep, onDeleteStep, onToggleCheckIn, onToggleRampWeek, onAskCoach,
}: Props) {
  const [showForm, setShowForm] = useState(false);
  // Minor goal awaiting a breakdown answer, and the step whose reminder is open
  const [breakdownFor, setBreakdownFor] = useState<MinorGoal | null>(null);
  const [scheduleFor, setScheduleFor] = useState<{ step: AccountableStep; mgId: string } | null>(null);

  const minorGoals = goal.minorGoals ?? [];

  const handleAdd = (mg: MinorGoal) => {
    onAddMinorGoal(mg);
    setShowForm(false);
    // Case 1: enough information to do the arithmetic — offer the split.
    if (suggestBreakdowns(mg).length > 0) setBreakdownFor(mg);
  };

  const applyBreakdown = (mg: MinorGoal, option: BreakdownOption) => {
    const step = newAccountableStep({
      label: option.label,
      cadence: option.cadence,
      // Daily habit options carry cadence 'custom' + intervalDays: 1 — without
      // passing intervalDays through, the step would silently default to a
      // 7-day custom cadence instead of the daily one the option promised.
      intervalDays: option.intervalDays,
      amount: option.amountPerPeriod,
      unit: mg.unit,
      schedule: {
        ...DEFAULT_SCHEDULE,
        // Monthly commitments default to the 1st; the user picks their payday next.
        dayOfMonth: 1,
      },
    });
    onAddStep(step, mg.id);
    setBreakdownFor(null);
    // Straight into "when should I remind you?" — still optional.
    setScheduleFor({ step, mgId: mg.id });
  };

  return (
    <View>
      <View style={styles.sectionHead}>
        <Text style={[styles.eyebrow, { color: p.muted }]}>MINOR GOALS</Text>
        <TouchableOpacity
          onPress={() => setShowForm((s) => !s)}
          style={[styles.addPill, { borderColor: p.line }]}
        >
          <Ionicons name={showForm ? 'close' : 'add'} size={13} color={p.text} />
          <Text style={[styles.addPillText, { color: p.text }]}>
            {showForm ? 'Cancel' : 'Add'}
          </Text>
        </TouchableOpacity>
      </View>

      {minorGoals.length === 0 && !showForm && (
        <Text style={[styles.emptyHint, { color: p.muted }]}>
          Break this goal into milestones — "Save $10,000", "Run a marathon" — then give
          each one a recurring step you can be reminded about.
        </Text>
      )}

      {/* Each step's bell is its own independent reminder — not gated by the
          goal-level reminder toggle up top, only by Settings ▸ Push
          Notifications. Said once here rather than repeated per card. */}
      {minorGoals.length > 0 && (
        <Text style={[styles.layerHint, { color: p.muted }]}>
          Tap the bell on a step to set its own reminder — separate from this goal's
          check-in toggle above; both need Push Notifications on in Settings.
        </Text>
      )}

      {showForm && (
        <AddMinorGoalForm goal={goal} palette={p} onAdd={handleAdd} />
      )}

      {minorGoals.map((mg) => (
        <MinorGoalCard
          key={mg.id}
          minorGoal={mg}
          goalTargetDate={goal.targetDate}
          palette={p}
          onUpdate={onUpdateMinorGoal}
          onDelete={() => confirmDelete(mg.title, () => onDeleteMinorGoal(mg.id))}
          onAddStep={(step) => onAddStep(step, mg.id)}
          onDeleteStep={(stepId, label) =>
            confirmDelete(label, () => onDeleteStep(stepId, mg.id))}
          onToggleCheckIn={(stepId) => onToggleCheckIn(stepId, mg.id)}
          onToggleRampWeek={(stepId, weekId) => onToggleRampWeek(stepId, weekId, mg.id)}
          onOpenSchedule={(step) => setScheduleFor({ step, mgId: mg.id })}
          onBreakdown={() => setBreakdownFor(mg)}
          onAskCoach={() => onAskCoach(mg)}
        />
      ))}

      <BreakdownPrompt
        visible={!!breakdownFor}
        minorGoal={breakdownFor}
        palette={p}
        onPick={(option) => breakdownFor && applyBreakdown(breakdownFor, option)}
        onSkip={() => setBreakdownFor(null)}
      />

      <StepScheduleSheet
        visible={!!scheduleFor}
        step={scheduleFor?.step ?? null}
        palette={p}
        onSave={({ cadence, intervalDays, schedule }) => {
          if (!scheduleFor) return;
          onUpdateStep(
            { ...scheduleFor.step, cadence, intervalDays, schedule },
            scheduleFor.mgId,
          );
          setScheduleFor(null);
        }}
        onTurnOff={() => {
          if (!scheduleFor) return;
          onUpdateStep(
            { ...scheduleFor.step, schedule: { ...scheduleFor.step.schedule, on: false } },
            scheduleFor.mgId,
          );
          setScheduleFor(null);
        }}
        onDismiss={() => setScheduleFor(null)}
      />
    </View>
  );
}

// ── One minor goal ────────────────────────────────────────────

interface CardProps {
  minorGoal: MinorGoal;
  // The parent goal's CURRENT "Achieve by" date — compared against what this
  // minor goal was sized for, to flag a stale deadline.
  goalTargetDate?: string;
  palette: Palette;
  onUpdate: (mg: MinorGoal) => void;
  onDelete: () => void;
  onAddStep: (step: AccountableStep) => void;
  onDeleteStep: (stepId: string, label: string) => void;
  onToggleCheckIn: (stepId: string) => void;
  onToggleRampWeek: (stepId: string, weekId: string) => void;
  onOpenSchedule: (step: AccountableStep) => void;
  onBreakdown: () => void;
  onAskCoach: () => void;
}

// A ramp with no deadline still needs a week count to build from — default to
// however many whole weeks remain until the minor goal's own deadline, or a
// plain 8-week ramp when there is no deadline to size against.
function defaultRampWeeks(mg: MinorGoal): number {
  if (!mg.deadline) return 8;
  const days = Math.ceil((new Date(mg.deadline).getTime() - Date.now()) / 86400000);
  return Math.max(2, Math.min(26, Math.round(days / 7)));
}

function MinorGoalCard({
  minorGoal: mg, goalTargetDate, palette: p, onUpdate, onDelete,
  onAddStep, onDeleteStep, onToggleCheckIn, onToggleRampWeek, onOpenSchedule, onBreakdown, onAskCoach,
}: CardProps) {
  const [addingStep, setAddingStep] = useState(false);
  const [addingRamp, setAddingRamp] = useState(false);
  const [expandedStepId, setExpandedStepId] = useState<string | null>(null);
  const [stepLabel, setStepLabel] = useState('');
  const [stepCadence, setStepCadence] = useState<Cadence>('weekly');

  const frac = minorGoalFraction(mg);
  const deadlineOutdated = isMinorGoalDeadlineOutdated(mg, goalTargetDate);
  const pct = minorGoalPercent(mg);
  const canBreakDown = suggestBreakdowns(mg).length > 0;

  const commitStep = () => {
    const label = stepLabel.trim();
    if (!label) return;
    onAddStep(newAccountableStep({ label, cadence: stepCadence, unit: mg.unit }));
    setStepLabel('');
    setAddingStep(false);
  };

  return (
    <View style={[styles.card, { backgroundColor: p.surface }]}>
      <View style={styles.cardHead}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardTitle, { color: p.text }]}>{mg.title}</Text>
          <Text style={[styles.cardMeta, { color: p.muted }]}>
            {mg.kind === 'numeric' ? 'Numeric' : 'Effort'}
            {mg.deadline ? ` · by ${fmtDeadline(mg.deadline)}` : ''}
            {` · ${pct}%`}
          </Text>
        </View>
        {mg.kind === 'effort' && (
          <TouchableOpacity
            onPress={() => onUpdate({ ...mg, done: !mg.done })}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel={mg.done ? 'Mark not done' : 'Mark done'}
          >
            <Ionicons
              name={mg.done ? 'checkmark-circle' : 'ellipse-outline'}
              size={20}
              color={mg.done ? p.accent : p.muted}
            />
          </TouchableOpacity>
        )}
        <TouchableOpacity
          onPress={onDelete}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={{ marginLeft: 10 }}
        >
          <Ionicons name="trash-outline" size={16} color={p.muted} />
        </TouchableOpacity>
      </View>

      {deadlineOutdated && (
        <View style={[styles.outdatedBanner, { backgroundColor: `#e8930022`, borderColor: '#e89300' }]}>
          <Ionicons name="alert-circle-outline" size={15} color="#c47700" style={{ marginTop: 1 }} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.outdatedText, { color: p.text }]}>
              This was sized for {mg.sizedForGoalDate ? fmtDeadline(mg.sizedForGoalDate) : 'no deadline'} — the goal's
              deadline is now {goalTargetDate ? fmtDeadline(goalTargetDate) : 'unset'}.
            </Text>
            <View style={styles.outdatedActions}>
              <TouchableOpacity
                onPress={() => onUpdate({ ...mg, deadline: goalTargetDate, sizedForGoalDate: goalTargetDate })}
              >
                <Text style={[styles.outdatedActionText, { color: '#c47700' }]}>
                  Update to {goalTargetDate ? fmtDeadline(goalTargetDate) : 'no deadline'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                // Dismiss = stop tying this minor goal's deadline to the
                // parent goal at all (same as if the user had picked a
                // deliberately different date from the start) — clearing
                // sizedForGoalDate rather than re-pointing it at the OLD
                // deadline, which would just re-trip the flag immediately.
                onPress={() => onUpdate({ ...mg, sizedForGoalDate: undefined })}
              >
                <Text style={[styles.outdatedActionText, { color: p.muted }]}>Keep as-is</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {mg.kind === 'numeric' && (
        <View style={[styles.row, { marginBottom: 10 }]}>
          <TouchableOpacity
            style={[styles.stepper, { backgroundColor: p.line, opacity: (mg.current ?? 0) <= 0 ? 0.4 : 1 }]}
            onPress={() => onUpdate({ ...mg, current: steppedMinorGoalValue(mg, -1) })}
            disabled={(mg.current ?? 0) <= 0}
            accessibilityLabel={`Subtract ${fmtNum(minorGoalStep(mg))} ${mg.unit ?? ''}`.trim()}
          >
            <Ionicons name="remove" size={15} color={p.text} />
          </TouchableOpacity>
          <Text style={[styles.stepperVal, { color: p.text }]}>
            {formatAmount(mg.current ?? 0, mg.unit)} / {formatAmount(mg.target ?? 0, mg.unit)}
          </Text>
          <TouchableOpacity
            style={[styles.stepper, {
              backgroundColor: p.line,
              opacity: (mg.target ?? 0) > 0 && (mg.current ?? 0) >= (mg.target ?? 0) ? 0.4 : 1,
            }]}
            onPress={() => onUpdate({ ...mg, current: steppedMinorGoalValue(mg, 1) })}
            disabled={(mg.target ?? 0) > 0 && (mg.current ?? 0) >= (mg.target ?? 0)}
            accessibilityLabel={`Add ${fmtNum(minorGoalStep(mg))} ${mg.unit ?? ''}`.trim()}
          >
            <Ionicons name="add" size={15} color={p.text} />
          </TouchableOpacity>
        </View>
      )}

      <View style={[styles.progressTrack, { backgroundColor: p.line }]}>
        <View style={[styles.progressFill, { backgroundColor: p.accent, width: `${frac * 100}%` }]} />
      </View>

      {/* Accountable steps */}
      {mg.steps.length > 0 && (
        <View style={{ marginTop: 12 }}>
          <Text style={[styles.stepsEyebrow, { color: p.muted }]}>ACCOUNTABLE STEPS</Text>
          {mg.steps.map((step) => (
            step.ramp
              ? (
                <RampStepRow
                  key={step.id}
                  step={step}
                  palette={p}
                  expanded={expandedStepId === step.id}
                  onToggleExpand={() => setExpandedStepId((id) => (id === step.id ? null : step.id))}
                  onToggleCheckIn={() => onToggleCheckIn(step.id)}
                  onToggleWeek={(weekId) => onToggleRampWeek(step.id, weekId)}
                  onOpenSchedule={() => onOpenSchedule(step)}
                  onDelete={() => onDeleteStep(step.id, step.label)}
                />
              )
              : (
                <FlatStepRow
                  key={step.id}
                  step={step}
                  palette={p}
                  onToggleCheckIn={() => onToggleCheckIn(step.id)}
                  onOpenSchedule={() => onOpenSchedule(step)}
                  onDelete={() => onDeleteStep(step.id, step.label)}
                />
              )
          ))}
        </View>
      )}

      {/* Ways to get a step: manual, progressive ramp, arithmetic, or the coach */}
      {addingStep ? (
        <View style={{ marginTop: 10 }}>
          <TextInput
            style={[styles.input, { backgroundColor: p.bg, color: p.text, borderColor: p.line }]}
            placeholder='e.g. "Save $1,000 per month"'
            placeholderTextColor={p.muted}
            value={stepLabel}
            onChangeText={setStepLabel}
          />
          <View style={[styles.segmented, { backgroundColor: p.line, marginTop: 8 }]}>
            {(['weekly', 'monthly', 'custom'] as const).map((c) => (
              <TouchableOpacity
                key={c}
                style={[styles.segBtn, stepCadence === c && { backgroundColor: p.ink }]}
                onPress={() => setStepCadence(c)}
              >
                <Text style={[styles.segText, {
                  color: stepCadence === c ? (p.isDark ? p.bg : '#fff') : p.muted,
                }]}>
                  {c === 'weekly' ? 'Weekly' : c === 'monthly' ? 'Monthly' : 'Custom'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.formActions}>
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: stepLabel.trim() ? p.ink : p.muted }]}
              onPress={commitStep}
              disabled={!stepLabel.trim()}
            >
              <Text style={[styles.primaryText, { color: p.isDark ? p.bg : '#fff' }]}>Add step</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setAddingStep(false); setStepLabel(''); }}>
              <Text style={[styles.linkText, { color: p.muted }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : addingRamp ? (
        <RampForm
          minorGoal={mg}
          palette={p}
          onAdd={(step) => { onAddStep(step); setAddingRamp(false); }}
          onCancel={() => setAddingRamp(false)}
        />
      ) : (
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.ghostBtn, { borderColor: p.line }]}
            onPress={() => setAddingStep(true)}
          >
            <Ionicons name="add" size={13} color={p.text} />
            <Text style={[styles.ghostText, { color: p.text }]}>Step</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.ghostBtn, { borderColor: `${p.accent}66` }]}
            onPress={() => setAddingRamp(true)}
          >
            <Ionicons name="trending-up-outline" size={13} color={p.accent} />
            <Text style={[styles.ghostText, { color: p.accent }]}>Ramp</Text>
          </TouchableOpacity>

          {canBreakDown && (
            <TouchableOpacity
              style={[styles.ghostBtn, { borderColor: `${p.accent}66` }]}
              onPress={onBreakdown}
            >
              <Ionicons name="calculator-outline" size={13} color={p.accent} />
              <Text style={[styles.ghostText, { color: p.accent }]}>Break down</Text>
            </TouchableOpacity>
          )}

          {mg.kind === 'effort' && (
            <TouchableOpacity
              style={[styles.ghostBtn, { borderColor: `${p.accent}66` }]}
              onPress={onAskCoach}
            >
              <Ionicons name="sparkles-outline" size={13} color={p.accent} />
              <Text style={[styles.ghostText, { color: p.accent }]}>Ask coach</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

// ── One flat (non-ramp) accountable step row ──────────────────

function FlatStepRow({
  step, palette: p, onToggleCheckIn, onOpenSchedule, onDelete,
}: {
  step: AccountableStep; palette: Palette;
  onToggleCheckIn: () => void; onOpenSchedule: () => void; onDelete: () => void;
}) {
  const doneNow = isStepDoneThisPeriod(step);
  return (
    <View style={[styles.stepRow, { borderColor: p.line }]}>
      <TouchableOpacity
        onPress={onToggleCheckIn}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityLabel={doneNow ? `Undo ${step.label}` : `Check in: ${step.label}`}
      >
        <Ionicons
          name={doneNow ? 'checkbox' : 'square-outline'}
          size={19}
          color={doneNow ? p.accent : p.muted}
        />
      </TouchableOpacity>
      <View style={{ flex: 1 }}>
        <Text
          style={[
            styles.stepLabel,
            { color: doneNow ? p.muted : p.text },
            doneNow && { textDecorationLine: 'line-through' },
          ]}
        >
          {step.label}
        </Text>
        <Text style={[styles.stepMeta, { color: p.muted }]}>
          {cadenceLabel(step)} · {describeSchedule(step)}
          {step.completions.length > 0 && ` · ${step.completions.length} done`}
        </Text>
      </View>
      <TouchableOpacity
        onPress={onOpenSchedule}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityLabel={`Edit reminder for ${step.label}`}
        style={[styles.bellTarget, step.schedule.on && { backgroundColor: `${p.accent}1f` }]}
      >
        <Ionicons
          name={step.schedule.on ? 'notifications' : 'notifications-outline'}
          size={21}
          color={step.schedule.on ? p.accent : p.muted}
        />
      </TouchableOpacity>
      <TouchableOpacity onPress={onDelete} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Ionicons name="close" size={14} color={p.muted} />
      </TouchableOpacity>
    </View>
  );
}

// ── One progressive-ramp accountable step row ─────────────────
//
// Collapsed: a single row like a flat step, but the checkbox/label track the
// CURRENT ramp week. Expanded: every week, mirroring ladder measurables
// exactly (value + due date + individually-toggleable checkbox).

function RampStepRow({
  step, palette: p, expanded, onToggleExpand, onToggleCheckIn, onToggleWeek, onOpenSchedule, onDelete,
}: {
  step: AccountableStep; palette: Palette; expanded: boolean;
  onToggleExpand: () => void; onToggleCheckIn: () => void;
  onToggleWeek: (weekId: string) => void; onOpenSchedule: () => void; onDelete: () => void;
}) {
  const weeks = step.ramp ?? [];
  const doneCount = weeks.filter((w) => w.done).length;
  const current = currentRampWeek(step);
  const doneNow = current?.done ?? false;
  const fmt = (v: number) => v % 1 === 0 ? String(Math.round(v)) : v.toFixed(1);

  return (
    <View style={[styles.stepRow, { borderColor: p.line, alignItems: 'flex-start' }]}>
      <TouchableOpacity
        onPress={onToggleCheckIn}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        style={{ marginTop: 1 }}
        accessibilityLabel={doneNow ? `Undo this week's target` : `Check in: ${step.label}`}
      >
        <Ionicons
          name={doneNow ? 'checkbox' : 'square-outline'}
          size={19}
          color={doneNow ? p.accent : p.muted}
        />
      </TouchableOpacity>
      <TouchableOpacity style={{ flex: 1 }} onPress={onToggleExpand} activeOpacity={0.7}>
        <Text style={[styles.stepLabel, { color: p.text }]}>{step.label}</Text>
        <Text style={[styles.stepMeta, { color: p.muted }]}>
          {cadenceLabel(step)} · {doneCount}/{weeks.length} weeks · {describeSchedule(step)}
          {current && !doneNow && ` · this week: ${fmt(current.value)} ${step.unit ?? ''}`.trimEnd()}
        </Text>
        {expanded && (
          <View style={{ marginTop: 8 }}>
            {weeks.map((week, idx) => {
              const due = new Date(week.targetDate);
              const dueStr = due.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
              const isCurrent = current?.id === week.id;
              return (
                <View key={week.id} style={[styles.rampWeekRow, isCurrent && { opacity: 1 }]}>
                  <TouchableOpacity
                    style={[
                      styles.ladderBox,
                      { borderColor: week.done ? p.accent : p.line },
                      week.done && { backgroundColor: p.accent },
                    ]}
                    onPress={() => onToggleWeek(week.id)}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  >
                    {week.done && <Ionicons name="checkmark" size={10} color={p.surface} />}
                  </TouchableOpacity>
                  <Text style={[styles.rampWeekVal, { color: week.done ? p.muted : p.text }]}>
                    {fmt(week.value)} {step.unit ?? ''}
                  </Text>
                  <Text style={[styles.rampWeekDue, { color: p.muted }]}>by {dueStr}</Text>
                  <Text style={[styles.rampWeekIdx, { color: isCurrent ? p.accent : p.muted }]}>
                    Wk {idx + 1}{isCurrent ? ' · now' : ''}
                  </Text>
                </View>
              );
            })}
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
        <Ionicons
          name={step.schedule.on ? 'notifications' : 'notifications-outline'}
          size={21}
          color={step.schedule.on ? p.accent : p.muted}
        />
      </TouchableOpacity>
      <TouchableOpacity onPress={onDelete} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ marginTop: 1 }}>
        <Ionicons name="close" size={14} color={p.muted} />
      </TouchableOpacity>
    </View>
  );
}

// ── Ramp creation form ─────────────────────────────────────────

function RampForm({
  minorGoal: mg, palette: p, onAdd, onCancel,
}: { minorGoal: MinorGoal; palette: Palette; onAdd: (step: AccountableStep) => void; onCancel: () => void }) {
  const [label, setLabel] = useState('');
  const [startStr, setStartStr] = useState('');
  const [endStr, setEndStr] = useState('');
  const [unit, setUnit] = useState(mg.unit ?? '');
  const [weeksStr, setWeeksStr] = useState(String(defaultRampWeeks(mg)));

  const start = parseFloat(startStr);
  const end = parseFloat(endStr);
  const weeksCount = Math.max(1, parseInt(weeksStr, 10) || 1);
  const valid = label.trim() && Number.isFinite(start) && Number.isFinite(end) && end !== start;

  const commit = () => {
    if (!valid) return;
    const ramp = buildAccountableRamp(start, end, weeksCount, mg.deadline);
    onAdd(newAccountableStep({
      label: label.trim(), cadence: 'weekly', unit: unit || undefined, amount: end, ramp,
    }));
  };

  return (
    <View style={{ marginTop: 10 }}>
      <TextInput
        style={[styles.input, { backgroundColor: p.bg, color: p.text, borderColor: p.line }]}
        placeholder='e.g. "Weekly long-run build-up"'
        placeholderTextColor={p.muted}
        value={label}
        onChangeText={setLabel}
      />
      <View style={styles.inputRow}>
        <TextInput
          style={[styles.inputSmall, { backgroundColor: p.bg, color: p.text, flex: 1 }]}
          placeholder="Start"
          placeholderTextColor={p.muted}
          keyboardType="numeric"
          value={startStr}
          onChangeText={setStartStr}
        />
        <Text style={{ color: p.muted }}>→</Text>
        <TextInput
          style={[styles.inputSmall, { backgroundColor: p.bg, color: p.text, flex: 1 }]}
          placeholder="End"
          placeholderTextColor={p.muted}
          keyboardType="numeric"
          value={endStr}
          onChangeText={setEndStr}
        />
        <TextInput
          style={[styles.inputSmall, { backgroundColor: p.bg, color: p.text, flex: 1 }]}
          placeholder="Unit"
          placeholderTextColor={p.muted}
          value={unit}
          onChangeText={setUnit}
        />
        <TextInput
          style={[styles.inputSmall, { backgroundColor: p.bg, color: p.text, flex: 1 }]}
          placeholder="Weeks"
          placeholderTextColor={p.muted}
          keyboardType="numeric"
          value={weeksStr}
          onChangeText={setWeeksStr}
        />
      </View>
      <Text style={[styles.formHint, { color: p.muted }]}>
        Builds {weeksStr || '?'} weekly targets from {startStr || '…'} up to {endStr || '…'}
        {unit ? ` ${unit}` : ''} — same week-by-week ramp as a ladder measurable, just
        attached to this minor goal.
      </Text>
      <View style={styles.formActions}>
        <TouchableOpacity
          style={[styles.primaryBtn, { backgroundColor: valid ? p.ink : p.muted }]}
          onPress={commit}
          disabled={!valid}
        >
          <Text style={[styles.primaryText, { color: p.isDark ? p.bg : '#fff' }]}>Add ramp</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onCancel}>
          <Text style={[styles.linkText, { color: p.muted }]}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Manual add form ───────────────────────────────────────────

function AddMinorGoalForm({
  goal, palette: p, onAdd,
}: { goal: Goal; palette: Palette; onAdd: (mg: MinorGoal) => void }) {
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<MinorGoalKind>('numeric');
  const [targetStr, setTargetStr] = useState('');
  const [unit, setUnit] = useState('');
  const [stepStr, setStepStr] = useState('');
  // Defaults to the parent goal's date, which is usually what the user means.
  const [deadline, setDeadline] = useState<string | undefined>(goal.targetDate);
  const [showPicker, setShowPicker] = useState(false);

  const commit = () => {
    const t = title.trim();
    if (!t) return;
    const parsedStep = parseFloat(stepStr);
    onAdd(newMinorGoal({
      title: t,
      kind,
      target: kind === 'numeric' ? (parseFloat(targetStr) || 1) : undefined,
      current: kind === 'numeric' ? 0 : undefined,
      unit: kind === 'numeric' ? unit : undefined,
      step: kind === 'numeric' && Number.isFinite(parsedStep) && parsedStep > 0
        ? parsedStep
        : undefined,
      deadline,
      // Track this deadline as "borrowed" from the goal only when it still
      // matches — a user who picked a different date here made a deliberate
      // choice, and later goal-date changes should never flag that as stale.
      sizedForGoalDate: deadline === goal.targetDate ? goal.targetDate : undefined,
    }));
    setTitle(''); setTargetStr(''); setUnit(''); setStepStr('');
  };

  return (
    <View style={[styles.formCard, { backgroundColor: `${p.surface}99` }]}>
      <TextInput
        style={[styles.input, { backgroundColor: p.surface, color: p.text, borderColor: p.line }]}
        placeholder="Minor goal — e.g. Save $10,000"
        placeholderTextColor={p.muted}
        value={title}
        onChangeText={setTitle}
      />

      <View style={[styles.segmented, { backgroundColor: p.line, marginTop: 10 }]}>
        {([['numeric', '# Numeric'], ['effort', '◎ Effort']] as const).map(([k, label]) => (
          <TouchableOpacity
            key={k}
            style={[styles.segBtn, kind === k && { backgroundColor: p.ink }]}
            onPress={() => setKind(k)}
          >
            <Text style={[styles.segText, {
              color: kind === k ? (p.isDark ? p.bg : '#fff') : p.muted,
            }]}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {kind === 'numeric' ? (
        <>
          <View style={styles.inputRow}>
            <TextInput
              style={[styles.inputSmall, { backgroundColor: p.surface, color: p.text, flex: 1 }]}
              placeholder="Target"
              placeholderTextColor={p.muted}
              keyboardType="numeric"
              value={targetStr}
              onChangeText={setTargetStr}
            />
            <TextInput
              style={[styles.inputSmall, { backgroundColor: p.surface, color: p.text, flex: 1.4 }]}
              placeholder="Unit ($, km)"
              placeholderTextColor={p.muted}
              value={unit}
              onChangeText={setUnit}
            />
            <TextInput
              style={[styles.inputSmall, { backgroundColor: p.surface, color: p.text, flex: 1 }]}
              placeholder="Step"
              placeholderTextColor={p.muted}
              keyboardType="numeric"
              value={stepStr}
              onChangeText={setStepStr}
            />
          </View>
          <Text style={[styles.formHint, { color: p.muted }]}>
            Give it a target and a date and I'll offer to split it into weekly or
            monthly amounts.
          </Text>
        </>
      ) : (
        <Text style={[styles.formHint, { color: p.muted }]}>
          Effort goals aren't arithmetic — add your own recurring step, or ask the
          coach for one simple weekly target.
        </Text>
      )}

      <TouchableOpacity
        style={[styles.dateRow, { borderColor: p.line }]}
        onPress={() => setShowPicker(true)}
      >
        <Ionicons name="calendar-outline" size={14} color={p.muted} />
        <Text style={[styles.dateText, { color: deadline ? p.text : p.muted }]}>
          {deadline
            ? new Date(deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            : 'Deadline (optional)'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.primaryBtn, { backgroundColor: title.trim() ? p.ink : p.muted, marginTop: 10 }]}
        onPress={commit}
        disabled={!title.trim()}
      >
        <Text style={[styles.primaryText, { color: p.isDark ? p.bg : '#fff' }]}>
          Add minor goal
        </Text>
      </TouchableOpacity>

      <CalendarPicker
        visible={showPicker}
        value={deadline}
        palette={p}
        onSelect={(iso) => { setDeadline(iso); setShowPicker(false); }}
        onClear={() => { setDeadline(undefined); setShowPicker(false); }}
        onDismiss={() => setShowPicker(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  sectionHead: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 10,
  },
  eyebrow: { fontSize: 11, fontWeight: '600', letterSpacing: 1.5 },
  addPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderWidth: 1, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5,
  },
  addPillText: { fontSize: 12, fontWeight: '600' },
  emptyHint: { fontSize: 13, lineHeight: 19, marginBottom: 6 },
  layerHint: { fontSize: 11, lineHeight: 15, marginBottom: 10 },
  formCard: { borderRadius: 16, padding: 14, marginBottom: 12 },
  card: { borderRadius: 14, padding: 14, marginBottom: 10 },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  cardTitle: { fontSize: 15, fontWeight: '700' },
  cardMeta: { fontSize: 12, marginTop: 2 },
  outdatedBanner: {
    flexDirection: 'row', gap: 8, borderWidth: 1, borderRadius: 12,
    padding: 10, marginBottom: 10,
  },
  outdatedText: { fontSize: 12, lineHeight: 16 },
  outdatedActions: { flexDirection: 'row', gap: 16, marginTop: 6 },
  outdatedActionText: { fontSize: 12, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepper: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  stepperVal: { fontSize: 14, fontWeight: '700' },
  progressTrack: { height: 5, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: 5, borderRadius: 3 },
  stepsEyebrow: { fontSize: 10, fontWeight: '700', letterSpacing: 1.1, marginBottom: 6 },
  stepRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderTopWidth: 1, paddingVertical: 9,
  },
  stepLabel: { fontSize: 14, fontWeight: '500' },
  stepMeta: { fontSize: 11, marginTop: 2 },
  // A bigger tap target with a soft tint when active — the bare 17px glyph
  // on its own (no padding, no background) was too easy to miss/mis-tap.
  bellTarget: {
    width: 30, height: 30, borderRadius: 15,
    alignItems: 'center', justifyContent: 'center',
  },
  rampWeekRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  ladderBox: { width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  rampWeekVal: { fontSize: 13, fontWeight: '500', flex: 1 },
  rampWeekDue: { fontSize: 11 },
  rampWeekIdx: { fontSize: 10, fontWeight: '700', marginLeft: 6 },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' },
  ghostBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderWidth: 1, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6,
  },
  ghostText: { fontSize: 12, fontWeight: '600' },
  input: { borderRadius: 10, padding: 11, fontSize: 14, borderWidth: 1, minWidth: 0 },
  inputRow: { flexDirection: 'row', gap: 6, marginTop: 10, alignItems: 'center' },
  inputSmall: { borderRadius: 8, padding: 8, fontSize: 13, minWidth: 0 },
  formHint: { fontSize: 11, lineHeight: 16, marginTop: 8 },
  dateRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderRadius: 10, padding: 11, marginTop: 10,
  },
  dateText: { fontSize: 13, fontWeight: '500' },
  segmented: { flexDirection: 'row', borderRadius: 18, padding: 3, gap: 2 },
  segBtn: { flex: 1, paddingVertical: 6, borderRadius: 15, alignItems: 'center' },
  segText: { fontSize: 12, fontWeight: '600' },
  formActions: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 10 },
  primaryBtn: { borderRadius: 12, paddingVertical: 11, paddingHorizontal: 16, alignItems: 'center' },
  primaryText: { fontSize: 14, fontWeight: '700' },
  linkText: { fontSize: 13, fontWeight: '500' },
});
