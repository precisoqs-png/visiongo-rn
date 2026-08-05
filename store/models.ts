import * as Crypto from 'expo-crypto';

export type MeasurableType = 'check' | 'number' | 'ladder';

export interface LadderWeek {
  id: string;
  value: number;
  targetDate: string; // ISO date string
  done: boolean;
}

export interface Measurable {
  id: string;
  type: MeasurableType;
  label: string;
  // check
  done: boolean;
  // number
  current: number;
  target: number;
  unit: string;
  // How much one tap of +/- moves `current`. Chosen per measurable so a
  // "150 days" step ticks by 1 and a "10,000 £ saved" step can tick by 500.
  step: number;
  // ladder
  weeks: LadderWeek[];
  // ladder only — the goal's targetDate the week dates above were actually
  // built against (buildLadderWeeks paces every week back from it). Set
  // whenever the ladder is created or resized; left unset for ladders built
  // before this existed, so old data is never retroactively flagged. See
  // isMeasurableDeadlineOutdated.
  sizedForGoalDate?: string;
}

// Data persisted before per-measurable steps existed has no `step`, and a
// zero/negative step would freeze the +/- buttons — always read it via this.
export function measurableStep(m: Measurable): number {
  return typeof m.step === 'number' && m.step > 0 ? m.step : 1;
}

/**
 * True when a ladder Measurable's week dates were paced against the goal's
 * PRIOR targetDate and that date has since changed. Unlike a Milestone (which
 * can have its own independent deadline), a ladder's weeks are always paced
 * off the parent goal's date, so there is no "the user chose differently"
 * case to protect — any mismatch means the weekly dates are stale.
 */
export function isMeasurableDeadlineOutdated(m: Measurable, goalTargetDate?: string): boolean {
  return m.type === 'ladder' && m.sizedForGoalDate != null && m.sizedForGoalDate !== goalTargetDate;
}

// Snap a value onto the measurable's step grid. Steps may be fractional
// (0.5 kg), so round the multiple rather than the value to avoid float noise.
export function snapToStep(value: number, step: number): number {
  if (!(step > 0)) return value;
  const snapped = Math.round(value / step) * step;
  return Math.round(snapped * 1000) / 1000;
}

// Next/previous value for the +/- controls, clamped to [0, target].
export function steppedValue(m: Measurable, direction: 1 | -1): number {
  const step = measurableStep(m);
  const raw = m.current + direction * step;
  const snapped = snapToStep(raw, step);
  // Snapping can round back onto `current` when the stored value is off-grid
  // (e.g. 145 with a step of 6) — nudge past it so a tap always moves.
  const moved = snapped === m.current ? m.current + direction * step : snapped;
  return Math.min(Math.max(moved, 0), Math.max(m.target, 0));
}

export function measurableFraction(m: Measurable): number {
  switch (m.type) {
    case 'check':
      return m.done ? 1 : 0;
    case 'number':
      if (m.target <= 0) return 0;
      return Math.min(Math.max(m.current / m.target, 0), 1);
    case 'ladder':
      if (m.weeks.length === 0) return 0;
      return m.weeks.filter((w) => w.done).length / m.weeks.length;
  }
}

// ── Milestones and commitments ────────────────────────────────
//
// A goal breaks down into Milestones ("Save $10,000", "Run a marathon"), and
// each Milestone carries Commitments — one concrete recurring commitment
// ("Save $1,000 per month") that can drive a push reminder.

export type Cadence = 'weekly' | 'monthly' | 'custom';

// Notification config for one commitment. The user picks the day and
// time; nothing is scheduled while `on` is false.
export interface StepSchedule {
  on: boolean;
  weekday: number;    // 1 = Sunday … 7 = Saturday (expo convention), weekly
  dayOfMonth: number; // 1–28, monthly — capped so every month has the day
  hour: number;
  minute: number;
}

export interface Commitment {
  id: string;
  label: string;          // "Save $1,000 per month"
  amount?: number;        // per-period target, for flat (non-ramp) steps
  unit?: string;
  cadence: Cadence;
  intervalDays?: number;  // custom cadence only
  schedule: StepSchedule;
  // Period keys ("2026-W31", "2026-08", "2026-08-14") the user has checked
  // off. Unused when `ramp` is set — a ramp tracks completion per week
  // instead (see LadderWeek.done below), same as ladder measurables.
  completions: string[];
  createdAt: string;
  // Optional progressive build-up — the target increases week by week (5 -> 10
  // km building to week 5) instead of repeating one flat amount. Reuses the
  // same weekly-target shape as ladder measurables (built with
  // buildLadderWeeks), so a build-up Commitment and a ladder Measurable
  // behave identically week to week; only the container differs. Always
  // weekly cadence.
  ramp?: LadderWeek[];
}

export type MilestoneKind = 'numeric' | 'effort';

export interface Milestone {
  id: string;
  title: string;
  kind: MilestoneKind;
  // numeric only
  target?: number;
  current?: number;
  unit?: string;
  step?: number;
  deadline?: string;      // ISO date string
  // Set only when `deadline` was inherited from (or explicitly re-synced to)
  // the parent Goal's own targetDate, so the milestone's sizing can be
  // flagged as outdated if that parent date later changes. Left unset when
  // the user picked a deliberately different date for this milestone —
  // that choice is never second-guessed.
  sizedForGoalDate?: string;
  // effort goals are simply marked done; numeric ones derive from current/target
  done: boolean;
  steps: Commitment[];
}

/**
 * True when this milestone's deadline was sized against the parent goal's
 * PRIOR targetDate and that date has since changed (or been cleared/added).
 * A milestone the user gave its own independent deadline is never flagged.
 */
export function isMilestoneDeadlineOutdated(mg: Milestone, goalTargetDate?: string): boolean {
  return mg.sizedForGoalDate != null && mg.sizedForGoalDate !== goalTargetDate;
}

export const DEFAULT_SCHEDULE: StepSchedule = {
  on: false, weekday: 2, dayOfMonth: 1, hour: 9, minute: 0,
};

export function newCommitment(
  init: Partial<Commitment> & { label: string; cadence: Cadence },
): Commitment {
  return {
    id: newId(),
    completions: [],
    createdAt: new Date().toISOString(),
    ...init,
    schedule: { ...DEFAULT_SCHEDULE, ...(init.schedule ?? {}) },
  };
}

export function newMilestone(
  init: Partial<Milestone> & { title: string; kind: MilestoneKind },
): Milestone {
  return { id: newId(), done: false, steps: [], ...init };
}

export function milestoneStep(mg: Milestone): number {
  return typeof mg.step === 'number' && mg.step > 0 ? mg.step : 1;
}

// ── Cadence periods ───────────────────────────────────────────

export function cadenceIntervalDays(step: Commitment): number {
  switch (step.cadence) {
    case 'weekly': return 7;
    case 'monthly': return 30;
    case 'custom': return step.intervalDays && step.intervalDays > 0 ? step.intervalDays : 7;
  }
}

export function cadenceLabel(step: Commitment): string {
  if (step.ramp) {
    const first = step.ramp[0], last = step.ramp[step.ramp.length - 1];
    return first && last
      ? `Build-up · ${formatNumber(first.value)}→${formatNumber(last.value)} ${step.unit ?? ''}`.trim()
      : 'Build-up';
  }
  switch (step.cadence) {
    case 'weekly': return 'Weekly';
    case 'monthly': return 'Monthly';
    case 'custom': {
      const d = cadenceIntervalDays(step);
      return d === 1 ? 'Daily' : `Every ${d} days`;
    }
  }
}

// The single source of truth for displaying a Measurable/Milestone/
// Commitment value — "1,000" for whole numbers, "3.4" for anything
// with a fractional part. Every call site (cadence labels, breakdown
// suggestions, coach confirmation chips, measurable/milestone cards) used to
// carry its own slightly different copy of this; formatAmount below adds
// unit-aware wrapping on top of it.
export function formatNumber(v: number): string {
  return v % 1 === 0 ? v.toLocaleString('en-US') : v.toFixed(1);
}

/**
 * The build-up week that is currently "live" — the earliest not-yet-due week,
 * or the final week once every due date has passed. Build-up weeks are built
 * in chronological order (see buildLadderWeeks), so this is just the first
 * week whose target date has not yet arrived.
 */
export function currentBuildUpWeek(step: Commitment, when: Date = new Date()): LadderWeek | undefined {
  if (!step.ramp || step.ramp.length === 0) return undefined;
  return step.ramp.find((w) => new Date(w.targetDate) >= when) ?? step.ramp[step.ramp.length - 1];
}

function isoWeekKey(d: Date): string {
  // ISO week number, so a "weekly" check-in maps to one stable key per week.
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** Key identifying the period `when` falls in, for this step's cadence. */
export function periodKey(step: Commitment, when: Date = new Date()): string {
  switch (step.cadence) {
    case 'weekly':
      return isoWeekKey(when);
    case 'monthly':
      return `${when.getFullYear()}-${String(when.getMonth() + 1).padStart(2, '0')}`;
    case 'custom': {
      // Fixed windows counted from the step's creation date.
      const start = new Date(step.createdAt);
      const days = Math.floor((when.getTime() - start.getTime()) / 86400000);
      const idx = Math.max(0, Math.floor(days / cadenceIntervalDays(step)));
      return `${step.createdAt.slice(0, 10)}+${idx}`;
    }
  }
}

export function isStepDoneThisPeriod(step: Commitment, when: Date = new Date()): boolean {
  if (step.ramp) return currentBuildUpWeek(step, when)?.done ?? false;
  return step.completions.includes(periodKey(step, when));
}

// One period back from `when`, on this step's cadence — the walking-backward
// primitive commitmentStreak uses to count consecutive completed periods.
function priorPeriodDate(step: Commitment, when: Date): Date {
  const d = new Date(when);
  switch (step.cadence) {
    case 'weekly': d.setDate(d.getDate() - 7); return d;
    case 'monthly': d.setMonth(d.getMonth() - 1); return d;
    case 'custom': d.setDate(d.getDate() - cadenceIntervalDays(step)); return d;
  }
}

/**
 * Consecutive completed periods, walking back from `when`. A not-yet-done
 * current period doesn't break the streak (it just hasn't been checked in
 * yet) — counting starts from the most recent period that IS complete.
 * Ramp (build-up) steps track completion per week already surfaced as
 * "N/M weeks" elsewhere, so this only applies to flat commitments.
 */
export function commitmentStreak(step: Commitment, when: Date = new Date()): number {
  if (step.ramp || step.completions.length === 0) return 0;
  let cursor = when;
  if (!step.completions.includes(periodKey(step, cursor))) {
    cursor = priorPeriodDate(step, cursor);
  }
  let streak = 0;
  while (step.completions.includes(periodKey(step, cursor))) {
    streak++;
    cursor = priorPeriodDate(step, cursor);
  }
  return streak;
}

/**
 * When the CURRENT period's commitment is due, for a flat (non-build-up) step
 * — the end of this ISO week, this calendar month, or this custom window.
 * Lets a recurring Commitment slot into the same Overdue/This Week/This
 * Month/Upcoming buckets the Tasks tab already groups measurable tasks by,
 * even though it has no single fixed due date the way a ladder week does.
 */
export function currentStepPeriodDueDate(step: Commitment, when: Date = new Date()): Date {
  switch (step.cadence) {
    case 'weekly': {
      // ISO weeks run Monday–Sunday; find this week's Sunday, end of day.
      const t = new Date(when.getFullYear(), when.getMonth(), when.getDate());
      const day = t.getDay() || 7; // 1=Mon..7=Sun
      t.setDate(t.getDate() + (7 - day));
      t.setHours(23, 59, 59, 999);
      return t;
    }
    case 'monthly':
      return new Date(when.getFullYear(), when.getMonth() + 1, 0, 23, 59, 59, 999);
    case 'custom': {
      const start = new Date(step.createdAt);
      const days = Math.floor((when.getTime() - start.getTime()) / 86400000);
      const idx = Math.max(0, Math.floor(days / cadenceIntervalDays(step)));
      const end = new Date(start);
      end.setDate(end.getDate() + (idx + 1) * cadenceIntervalDays(step));
      end.setHours(23, 59, 59, 999);
      return end;
    }
  }
}

/** How many periods of this cadence fit between now and the deadline. */
export function periodsUntil(deadline: string, cadence: Cadence, intervalDays = 7, today = new Date()): number {
  const end = new Date(deadline);
  const days = Math.ceil((end.getTime() - today.getTime()) / 86400000);
  if (days <= 0) return 0;
  switch (cadence) {
    case 'weekly': return Math.max(1, Math.ceil(days / 7));
    case 'monthly': return Math.max(1, Math.round(days / 30.44));
    case 'custom': return Math.max(1, Math.ceil(days / Math.max(intervalDays, 1)));
  }
}

// ── Breakdown suggestions (case 1: arithmetic milestones) ────

export interface BreakdownOption {
  cadence: Cadence;
  intervalDays?: number; // set alongside cadence 'custom' — daily habit options
  periods: number;
  amountPerPeriod: number;
  label: string;       // "Save $1,000 per month"
  summary: string;     // "12 payments of $1,000"
}

// Round to something a human would actually commit to, scaled to size.
function friendlyAmount(v: number): number {
  if (v >= 1000) return Math.round(v / 50) * 50;
  if (v >= 100) return Math.round(v / 10) * 10;
  if (v >= 10) return Math.round(v);
  return Math.round(v * 10) / 10;
}

/** "$1,000" for currency symbols, "40 km" for everything else. */
export function formatAmount(v: number, unit?: string): string {
  const n = formatNumber(v);
  if (!unit) return n;
  // Currency-ish units read better in front: $1,000 not 1,000 $
  return /^[$£€¥]$/.test(unit.trim()) ? `${unit.trim()}${n}` : `${n} ${unit}`;
}
const fmtAmount = formatAmount;

// Explicit recurrence language in the title — "each morning", "every day",
// "daily", "each week", "weekly" — marks a milestone as a repeating HABIT
// rather than a one-time cumulative sum. For a habit, `target` is already the
// per-occurrence amount ("30 min each morning" means 30 min EVERY morning,
// not 30 min total to divide across the weeks remaining).
const DAILY_HABIT_CUE = /\b(each|every)\s+(day|morning|evening|night)\b|\bdaily\b/i;
const WEEKLY_HABIT_CUE = /\b(each|every)\s+week\b|\bweekly\b/i;

export function isRecurringHabit(mg: Milestone): boolean {
  return mg.kind === 'numeric' && (DAILY_HABIT_CUE.test(mg.title) || WEEKLY_HABIT_CUE.test(mg.title));
}

/**
 * Turns "Save $10,000 by <deadline>" into weekly/monthly commitments sized
 * from what is still OUTSTANDING, so a part-funded goal is not over-split.
 * Returns [] when there is no numeric target or no time left to plan over.
 *
 * Recurring habits ("No phone 30 min each morning") are a different shape of
 * problem — the target already IS the per-occurrence amount, so it is routed
 * to suggestHabitCadence instead of being divided by the weeks remaining.
 */
export function suggestBreakdowns(mg: Milestone, today: Date = new Date()): BreakdownOption[] {
  if (mg.kind !== 'numeric' || !mg.target || !mg.deadline) return [];
  const remaining = Math.max(0, mg.target - (mg.current ?? 0));
  if (remaining <= 0) return [];

  if (isRecurringHabit(mg)) {
    return suggestHabitCadence(mg, today);
  }

  const verb = /save|fund|budget|invest/i.test(mg.title) ? 'Save' : 'Add';
  const out: BreakdownOption[] = [];
  for (const cadence of ['weekly', 'monthly'] as const) {
    const periods = periodsUntil(mg.deadline, cadence, 7, today);
    if (periods < 2) continue;
    const amountPerPeriod = friendlyAmount(remaining / periods);
    if (amountPerPeriod <= 0) continue;
    const per = cadence === 'weekly' ? 'per week' : 'per month';
    out.push({
      cadence,
      periods,
      amountPerPeriod,
      label: `${verb} ${fmtAmount(amountPerPeriod, mg.unit)} ${per}`,
      summary: `${periods} × ${fmtAmount(amountPerPeriod, mg.unit)}`,
    });
  }
  return out;
}

// Case: recurring habits. The stated target repeats as-is on the cadence
// named in the title — never divided by the weeks remaining, since the
// "amount" is a per-occurrence dose (30 min of no-phone time every single
// morning), not a cumulative sum being paid off over time.
function suggestHabitCadence(mg: Milestone, today: Date): BreakdownOption[] {
  const target = mg.target as number;
  const daily = DAILY_HABIT_CUE.test(mg.title);
  const cadence: Cadence = daily ? 'custom' : 'weekly';
  const intervalDays = daily ? 1 : undefined;
  const periods = periodsUntil(mg.deadline as string, cadence, intervalDays ?? 7, today);
  if (periods < 1) return [];
  const per = daily ? 'each day' : 'each week';
  return [{
    cadence,
    intervalDays,
    periods,
    amountPerPeriod: target,
    label: `${fmtAmount(target, mg.unit)} ${per}`,
    summary: `Every ${daily ? 'day' : 'week'} until ${new Date(mg.deadline as string).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} (${periods} ${daily ? 'days' : 'weeks'})`,
  }];
}

// ── Progress ──────────────────────────────────────────────────

export function commitmentProgress(step: Commitment, deadline?: string): number {
  if (step.ramp) {
    if (step.ramp.length === 0) return 0;
    return step.ramp.filter((w) => w.done).length / step.ramp.length;
  }
  const expected = deadline
    ? periodsUntil(deadline, step.cadence, cadenceIntervalDays(step), new Date(step.createdAt))
    : 0;
  if (expected <= 0) return step.completions.length > 0 ? 1 : 0;
  return Math.min(1, step.completions.length / expected);
}

export function milestoneFraction(mg: Milestone): number {
  if (mg.done) return 1;
  if (mg.kind === 'numeric' && (mg.target ?? 0) > 0) {
    return Math.min(Math.max((mg.current ?? 0) / (mg.target as number), 0), 1);
  }
  // Effort goals move as their recurring commitments get checked off.
  if (mg.steps.length === 0) return 0;
  const sum = mg.steps.reduce((acc, s) => acc + commitmentProgress(s, mg.deadline), 0);
  return Math.min(1, sum / mg.steps.length);
}

export function milestonePercent(mg: Milestone): number {
  return Math.round(milestoneFraction(mg) * 100);
}

export function steppedMilestoneValue(mg: Milestone, direction: 1 | -1): number {
  const step = milestoneStep(mg);
  const raw = (mg.current ?? 0) + direction * step;
  const snapped = snapToStep(raw, step);
  const moved = snapped === (mg.current ?? 0) ? (mg.current ?? 0) + direction * step : snapped;
  return Math.min(Math.max(moved, 0), Math.max(mg.target ?? 0, 0));
}

export type ReminderFrequency = 'Daily' | 'Weekly' | 'Monthly';

export interface Reminder {
  on: boolean;
  frequency: ReminderFrequency;
}

export type ChatSender = 'coach' | 'user';

export interface ChatMessage {
  id: string;
  sender: ChatSender;
  text: string;
  timestamp: string;
}

// ── Coach actions ─────────────────────────────────────────────
//
// The coach does not just describe steps — it proposes concrete edits to the
// goal. Each action is queued on the goal as a PendingAction and only touches
// the store once the user confirms it.

export type CoachActionKind =
  | 'addTask' | 'editTask' | 'removeTask' | 'setTarget'
  | 'addMilestone' | 'addCommitment' | 'removeMilestone';

export interface CoachAction {
  kind: CoachActionKind;
  // addTask / editTask
  type?: MeasurableType;
  label?: string;
  target?: number;
  unit?: string;
  step?: number;
  ladderStart?: number;
  ladderEnd?: number;
  ladderWeeks?: number;
  // editTask / removeTask / setTarget — which existing measurable it hits.
  // `measurableLabel` is what the coach called it, kept for display and as a
  // fallback match if the measurable was edited after the action was proposed.
  measurableId?: string;
  measurableLabel?: string;
  // addMilestone
  milestoneKind?: MilestoneKind;
  deadline?: string;
  // addCommitment — attaches to a milestone, recurring at `cadence`
  cadence?: Cadence;
  intervalDays?: number;
  amount?: number;
  // addCommitment / removeMilestone — which milestone it hits
  milestoneId?: string;
  milestoneLabel?: string;
}

export interface PendingAction {
  id: string;
  action: CoachAction;
}

// One-line human summary shown on the confirmation chip.
export function describeAction(a: CoachAction, goal: Goal): string {
  const existing = resolveMeasurable(a, goal);
  const name = existing?.label ?? a.measurableLabel ?? a.label ?? 'step';
  const unit = a.unit ?? existing?.unit ?? '';
  switch (a.kind) {
    case 'addTask':
      if (a.type === 'ladder') {
        return `Add "${a.label}" — ${formatNumber(a.ladderStart ?? 0)}→${formatNumber(a.ladderEnd ?? 0)} ${unit} over ${a.ladderWeeks ?? 0} weeks`;
      }
      if (a.type === 'number') {
        return `Add "${a.label}" — target ${formatNumber(a.target ?? 0)} ${unit}`.trimEnd();
      }
      return `Add "${a.label}"`;
    case 'editTask': {
      const bits: string[] = [];
      if (a.label && a.label !== existing?.label) bits.push(`rename to "${a.label}"`);
      if (a.target != null) bits.push(`target ${formatNumber(a.target)} ${unit}`.trimEnd());
      if (a.step != null) bits.push(`step ${formatNumber(a.step)}`);
      if (a.unit != null && a.unit !== existing?.unit) bits.push(`unit ${a.unit}`);
      return `Edit "${name}"${bits.length ? ` — ${bits.join(', ')}` : ''}`;
    }
    case 'removeTask':
      return `Remove "${name}"`;
    case 'setTarget':
      return `Set "${name}" target to ${formatNumber(a.target ?? 0)} ${unit}`.trimEnd();
    case 'addMilestone': {
      const bits: string[] = [];
      if (a.target != null) bits.push(`${formatNumber(a.target)} ${a.unit ?? ''}`.trim());
      if (a.deadline) bits.push(`by ${new Date(a.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`);
      return `Add milestone "${a.label}"${bits.length ? ` — ${bits.join(' ')}` : ''}`;
    }
    case 'addCommitment': {
      const every = a.cadence === 'monthly'
        ? 'monthly'
        : a.cadence === 'custom'
          ? `every ${a.intervalDays ?? 7} days`
          : 'weekly';
      const target = resolveMilestone(a, goal);
      const under = target?.title ?? a.milestoneLabel;
      return `Add ${every} step "${a.label}"${under ? ` under "${under}"` : ''}`;
    }
    case 'removeMilestone': {
      const target = resolveMilestone(a, goal);
      return `Remove milestone "${target?.title ?? a.milestoneLabel}"`;
    }
  }
}

// Match an action to the measurable it refers to: by id when the coach echoed
// one back, otherwise by a case-insensitive label match.
export function resolveMeasurable(a: CoachAction, goal: Goal): Measurable | undefined {
  if (a.measurableId) {
    const byId = goal.measurables.find((m) => m.id === a.measurableId);
    if (byId) return byId;
  }
  const wanted = (a.measurableLabel ?? a.label ?? '').trim().toLowerCase();
  if (!wanted) return undefined;
  return (
    goal.measurables.find((m) => m.label.trim().toLowerCase() === wanted) ??
    goal.measurables.find((m) => m.label.toLowerCase().includes(wanted))
  );
}

export function resolveMilestone(a: CoachAction, goal: Goal): Milestone | undefined {
  const list = goal.milestones ?? [];
  if (a.milestoneId) {
    const byId = list.find((mg) => mg.id === a.milestoneId);
    if (byId) return byId;
  }
  const wanted = (a.milestoneLabel ?? '').trim().toLowerCase();
  if (!wanted) return undefined;
  return (
    list.find((mg) => mg.title.trim().toLowerCase() === wanted) ??
    list.find((mg) => mg.title.toLowerCase().includes(wanted))
  );
}

// Normalized (0..1) position of a goal bubble on the radial board.
// Absent = auto-placed on the orbit ring.
export interface BoardPosition {
  x: number;
  y: number;
}

export interface Goal {
  id: string;
  title: string;
  colorIndex: number;
  targetDate?: string; // ISO date string
  reminder: Reminder;
  chat: ChatMessage[];
  pendingActions: PendingAction[];
  measurables: Measurable[];
  milestones: Milestone[];
  boardPosition?: BoardPosition;
  // Optional freeform "why this matters" note — surfaced under the title on
  // the goal detail screen and passed to the coach for context. Absent on
  // every goal created before this existed; never backfilled.
  motivation?: string;
  // Per-measurable bubble position on the goal's own bubble canvas, keyed by
  // Measurable.id — same normalized (0..1) shape as a goal's own
  // boardPosition on the main board. Absent entries auto-place on a ring
  // around the central goal bubble.
  measurableBubblePositions?: Record<string, BoardPosition>;
}

// Measurables and milestones each count as one unit of the goal, so adding a
// milestone shows real movement on the board instead of sitting at 0%.
export function goalProgress(g: Goal): number {
  const parts = [
    ...g.measurables.map(measurableFraction),
    ...(g.milestones ?? []).map(milestoneFraction),
  ];
  if (parts.length === 0) return 0;
  return parts.reduce((acc, f) => acc + f, 0) / parts.length;
}

export function goalProgressPercent(g: Goal): number {
  return Math.round(goalProgress(g) * 100);
}

export function isCompleted(g: Goal): boolean {
  const tracked = g.measurables.length + (g.milestones?.length ?? 0);
  return tracked > 0 && goalProgress(g) >= 1;
}

export interface YearData {
  year: number;
  motto: string;
  goals: Goal[];
}

export function yearOverallProgress(yd: YearData): number {
  if (yd.goals.length === 0) return 0;
  const sum = yd.goals.reduce((acc, g) => acc + goalProgress(g), 0);
  return sum / yd.goals.length;
}

export type BoardLayout = 'radial' | 'grid';
export type BoardViewMode = 'wholeYear' | 'byMonth';

// ── ID generation ─────────────────────────────────────────────

export function newId(): string {
  return Crypto.randomUUID();
}

// Single place where a Measurable's defaults live, so every creation path
// (templates, the add form, coach actions) agrees on them.
export function newMeasurable(
  init: Partial<Measurable> & { type: MeasurableType; label: string },
): Measurable {
  return {
    id: newId(),
    done: false,
    current: 0,
    target: 0,
    unit: '',
    step: 1,
    weeks: [],
    ...init,
  };
}

export function buildLadderWeeks(
  start: number,
  end: number,
  count: number,
  goalTargetDate?: string
): LadderWeek[] {
  const endDate = goalTargetDate ? new Date(goalTargetDate) : (() => {
    const d = new Date();
    d.setDate(d.getDate() + count * 7);
    return d;
  })();
  const step = (end - start) / count;
  const weeks: LadderWeek[] = [];
  for (let i = 1; i <= Math.max(count, 1); i++) {
    // Round to 1 decimal so week targets never show float noise like 3.4000001
    const value = Math.round((start + step * i) * 10) / 10;
    const date = new Date(endDate);
    date.setDate(date.getDate() - (count - i) * 7);
    weeks.push({ id: newId(), value, targetDate: date.toISOString(), done: false });
  }
  return weeks;
}

// A progressive build-up for a Commitment is exactly a ladder measurable's
// weekly schedule (same shape, same math) attached to a Milestone instead of
// standing alone as a Measurable — this is that reuse, named for the call site.
export const buildCommitmentRamp = buildLadderWeeks;
