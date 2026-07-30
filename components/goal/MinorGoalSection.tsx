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
  onAddStep, onUpdateStep, onDeleteStep, onToggleCheckIn, onAskCoach,
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

      {showForm && (
        <AddMinorGoalForm goal={goal} palette={p} onAdd={handleAdd} />
      )}

      {minorGoals.map((mg) => (
        <MinorGoalCard
          key={mg.id}
          minorGoal={mg}
          palette={p}
          onUpdate={onUpdateMinorGoal}
          onDelete={() => confirmDelete(mg.title, () => onDeleteMinorGoal(mg.id))}
          onAddStep={(step) => onAddStep(step, mg.id)}
          onDeleteStep={(stepId, label) =>
            confirmDelete(label, () => onDeleteStep(stepId, mg.id))}
          onToggleCheckIn={(stepId) => onToggleCheckIn(stepId, mg.id)}
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
  palette: Palette;
  onUpdate: (mg: MinorGoal) => void;
  onDelete: () => void;
  onAddStep: (step: AccountableStep) => void;
  onDeleteStep: (stepId: string, label: string) => void;
  onToggleCheckIn: (stepId: string) => void;
  onOpenSchedule: (step: AccountableStep) => void;
  onBreakdown: () => void;
  onAskCoach: () => void;
}

function MinorGoalCard({
  minorGoal: mg, palette: p, onUpdate, onDelete,
  onAddStep, onDeleteStep, onToggleCheckIn, onOpenSchedule, onBreakdown, onAskCoach,
}: CardProps) {
  const [addingStep, setAddingStep] = useState(false);
  const [stepLabel, setStepLabel] = useState('');
  const [stepCadence, setStepCadence] = useState<Cadence>('weekly');

  const frac = minorGoalFraction(mg);
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
          {mg.steps.map((step) => {
            const doneNow = isStepDoneThisPeriod(step);
            return (
              <View key={step.id} style={[styles.stepRow, { borderColor: p.line }]}>
                <TouchableOpacity
                  onPress={() => onToggleCheckIn(step.id)}
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
                  onPress={() => onOpenSchedule(step)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityLabel={`Edit reminder for ${step.label}`}
                >
                  <Ionicons
                    name={step.schedule.on ? 'notifications' : 'notifications-outline'}
                    size={17}
                    color={step.schedule.on ? p.accent : p.muted}
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => onDeleteStep(step.id, step.label)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="close" size={14} color={p.muted} />
                </TouchableOpacity>
              </View>
            );
          })}
        </View>
      )}

      {/* Ways to get a step: manual, arithmetic, or the coach */}
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
      ) : (
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.ghostBtn, { borderColor: p.line }]}
            onPress={() => setAddingStep(true)}
          >
            <Ionicons name="add" size={13} color={p.text} />
            <Text style={[styles.ghostText, { color: p.text }]}>Step</Text>
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
  formCard: { borderRadius: 16, padding: 14, marginBottom: 12 },
  card: { borderRadius: 14, padding: 14, marginBottom: 10 },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  cardTitle: { fontSize: 15, fontWeight: '700' },
  cardMeta: { fontSize: 12, marginTop: 2 },
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
