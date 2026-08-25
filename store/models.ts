// expo-crypto is required lazily, only inside newId() below, rather than
// imported at module scope — a static top-level import pulls in
// expo-modules-core -> react-native's Flow-typed source, which breaks a
// plain Node/esbuild run (e.g. scripts/verify-unify-migration.ts). Every
// runtime that matters here (Node, web, and modern Hermes) already exposes
// crypto.randomUUID as a global, so the require below is only ever reached
// as a fallback.
const globalCrypto: { randomUUID?: () => string } | undefined =
  typeof globalThis !== 'undefined' ? (globalThis as any).crypto : undefined;

export type MeasurableType = 'check' | 'number' | 'ladder' | 'commitment';

export interface LadderWeek {
  id: string;
  value: number;
  targetDate: string; // ISO date string
  done: boolean;
}

// ── Commitments (recurring, cadence-driven tracking) ────────────

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
  // buildLadderWeeks), so a build-up Commitment and a ladder item behave
  // identically week to week; only the container differs. Always weekly
  // cadence.
  ramp?: LadderWeek[];
}

// ── The unified trackable item ───────────────────────────────────
//
// VisionGo used to have two competing sibling types on a Goal: a flat
// "Measurable" (check/number/ladder, no sub-steps) and a "Milestone" (a
// sub-goal owning recurring Commitments). Users could not tell a numeric
// Measurable apart from a numeric Milestone in their mental model — both are
// just "a moment I'm tracking toward". TrackableItem merges them: ONE object
// represents both the moment (what "done" looks like: check/number/ladder)
// AND, optionally, the recurring commitment(s) that drive it there.
//
// Design: `type` still picks the moment's own shape (unchanged from
// Measurable) — 'commitment' is new, for what used to be an "effort"
// Milestone with no single current/target of its own, whose progress comes
// entirely from its `commitments`. A 'number' item MAY also carry
// `commitments` (this is what a numeric Milestone was: checking off a
// Commitment bumps `current` by the step's amount, same math as before) —
// the commitments don't change how a 'number' item's OWN fraction is
// computed (current/target still drives it), they're just the mechanism
// that moves `current`. `milestone: true` marks anything that used to be a
// Milestone (numeric or effort) — it exists purely to drive UI/behavior that
// only ever applied to Milestones (checkpoint dots, its own deadline +
// outdated-flagging, breakdown suggestions, the "Add milestone" vs "Add"
// coach phrasing) and is never set on a plain check/number/ladder item.
export interface TrackableItem {
  id: string;
  type: MeasurableType;
  label: string;
  // check
  done: boolean;
  // number
  current: number;
  target: number;
  unit: string;
  // How much one tap of +/- moves `current`. Chosen per item so a
  // "150 days" step ticks by 1 and a "10,000 £ saved" step can tick by 500.
  step: number;
  // ladder
  weeks: LadderWeek[];
  // ladder only — the goal's targetDate the week dates above were actually
  // built against (buildLadderWeeks paces every week back from it). Set
  // whenever the ladder is created or resized; left unset for ladders built
  // before this existed, so old data is never retroactively flagged. See
  // isItemDeadlineOutdated.
  sizedForGoalDate?: string;
  // Optional reminder for the item's OWN check/number/ladder tracking —
  // absent/schedule.on=false means no reminder.
  cadence?: Cadence;
  intervalDays?: number;
  schedule?: StepSchedule;
  // Own deadline (formerly Milestone.deadline) — independent of the parent
  // goal's targetDate unless `sizedForGoalDate` says it was inherited.
  deadline?: string;
  // True for anything migrated from (or created as) what used to be a
  // Milestone. See the interface comment above for what this drives.
  milestone?: boolean;
  // Recurring commitments attached to this item — empty for a plain
  // check/number/ladder item, one-or-more for a former Milestone. See the
  // interface comment above for how these interact with `current`/`target`.
  commitments: Commitment[];
  // Set on a Measurable (a quantified child) to point at its parent
  // Milestone's id. Absent on a top-level Milestone. See the Goal →
  // Milestone → Measurable model below.
  parentId?: string;
  // When this item's own `schedule` carries a reminder cadence, the Tasks
  // tab emits one dated task per period instead of a persistent Anytime
  // row (see allTasks in useAppStore.ts) — these are the periods already
  // ticked off, same completions-tracking pattern as Commitment.completions.
  // Absent for items created before this existed; treated as empty.
  reminderCompletions?: string[];
  // When set, anchors this item's own reminder periods (custom cadence
  // only needs it — weekly/monthly derive their boundaries from "now").
  // Absent for items created before this existed.
  createdAt?: string;
  // Number measurable only — the specific calendar days ('YYYY-MM-DD')
  // marked as done, an alternative to the +/- steppers for something like
  // "days active" where WHICH day matters, not just how many. Once this is
  // non-empty, `current` is kept equal to its length (see
  // toggleMarkedDate) — the steppers still work independently for a
  // measurable that never uses the calendar (e.g. a dollar amount, where
  // per-day tracking doesn't mean anything), so the two are only in
  // tension if a user mixes both on the same measurable, in which case
  // whichever was touched most recently wins, same as any shared value.
  markedDates?: string[];
}

// Back-compat type aliases — every call site written against the old
// two-type split still names `Measurable`/`Milestone`; both now resolve to
// the same unified shape so those imports keep compiling unchanged.
export type Measurable = TrackableItem;
export type Milestone = TrackableItem;
export type MilestoneKind = 'numeric' | 'effort';

// Data persisted before per-item steps existed has no `step`, and a
// zero/negative step would freeze the +/- buttons — always read it via this.
export function measurableStep(m: TrackableItem): number {
  return typeof m.step === 'number' && m.step > 0 ? m.step : 1;
}

/**
 * A child Measurable has no deadline of its own — it resolves through its
 * parent Milestone's `deadline`. A top-level Milestone (or any item with no
 * parent) just reads its own `deadline`. Every call site that used to read
 * `item.deadline` directly (commitmentProgress via measurableFraction,
 * isItemDeadlineOutdated) must go through this instead,
 * so a part-done commitment on a child never reads against a stale/absent
 * deadline of its own.
 */
export function itemDeadline(item: TrackableItem, goal: Goal): string | undefined {
  if (item.parentId == null) return item.deadline;
  const parent = goal.items.find((it) => it.id === item.parentId);
  return parent?.deadline;
}

/**
 * True when a ladder item's week dates were paced against the goal's
 * PRIOR targetDate and that date has since changed, OR (for a
 * milestone-flagged item) when its own deadline was inherited from the
 * goal's date and that has since changed. An item the user gave its own
 * independent deadline (sizedForGoalDate unset) is never flagged.
 */
export function isItemDeadlineOutdated(m: TrackableItem, goalTargetDate?: string): boolean {
  return m.sizedForGoalDate != null && m.sizedForGoalDate !== goalTargetDate;
}
// Back-compat aliases for the old, type-specific names.
export const isMeasurableDeadlineOutdated = isItemDeadlineOutdated;
export const isMilestoneDeadlineOutdated = isItemDeadlineOutdated;

// Removing ANY item must also drop its children (a Measurable's `parentId`
// pointing at a Milestone that no longer exists would never resolve or
// render again — see itemDeadline/measurableFraction, both of which walk
// goal.items looking for a parent by id and silently treat "not found" as
// "no parent info", not as an error). A Measurable never has children of
// its own in this model, so applying this to a Measurable's id is a
// harmless no-op; the condition is deliberately unconditional (no
// `milestone: true` check) so every delete path — coach-driven or
// user-driven — behaves identically regardless of what kind of item is
// being removed. Every call site that removes an item from `goal.items`
// (deleteMeasurable, deleteMilestone, deleteMeasurableInPlace, and
// applyCoachAction's removeMilestone) MUST go through this, not a hand-rolled
// `it.id !== id` filter, so a future item type with children doesn't
// silently reopen the orphan bug this closes.
export function removeItemCascade(items: TrackableItem[], id: string): TrackableItem[] {
  return items.filter((it) => it.id !== id && it.parentId !== id);
}

// Snap a value onto the item's step grid. Steps may be fractional
// (0.5 kg), so round the multiple rather than the value to avoid float noise.
export function snapToStep(value: number, step: number): number {
  if (!(step > 0)) return value;
  const snapped = Math.round(value / step) * step;
  return Math.round(snapped * 1000) / 1000;
}

// Next/previous value for the +/- controls, clamped to [0, target].
export function steppedValue(m: TrackableItem, direction: 1 | -1): number {
  const step = measurableStep(m);
  const raw = m.current + direction * step;
  const snapped = snapToStep(raw, step);
  // Snapping can round back onto `current` when the stored value is off-grid
  // (e.g. 145 with a step of 6) — nudge past it so a tap always moves.
  const moved = snapped === m.current ? m.current + direction * step : snapped;
  return Math.min(Math.max(moved, 0), Math.max(m.target, 0));
}
export const steppedMilestoneValue = steppedValue;

/**
 * Toggles one calendar day ('YYYY-MM-DD') on/off a Number measurable's
 * markedDates, keeping `current` equal to the marked count — the calendar
 * view's write path (components/shared/DayCalendar.tsx). Not clamped to
 * `target`: marking more days than the target just reads as >100% via
 * measurableFraction's own min(1, ...) clamp, same as an over-target
 * stepper value already could.
 */
export function toggleMarkedDate(m: TrackableItem, iso: string): TrackableItem {
  const marked = new Set(m.markedDates ?? []);
  if (marked.has(iso)) marked.delete(iso);
  else marked.add(iso);
  const markedDates = Array.from(marked).sort();
  return { ...m, markedDates, current: markedDates.length };
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

// ── Cadence periods ───────────────────────────────────────────

export function cadenceIntervalDays(step: { cadence: Cadence; intervalDays?: number }): number {
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

// The single source of truth for displaying a TrackableItem/Commitment
// value — "1,000" for whole numbers, "3.4" for anything with a fractional
// part. Every call site (cadence labels, breakdown suggestions, coach
// confirmation chips, item cards) used to carry its own slightly different
// copy of this; formatAmount below adds unit-aware wrapping on top of it.
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
 * Month/Upcoming buckets the Tasks tab already groups tasks by, even though
 * it has no single fixed due date the way a ladder week does.
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

/**
 * The same period-key/due-date pair as periodKey/currentStepPeriodDueDate
 * above, but for a plain number item's OWN reminder cadence (item.cadence/
 * item.schedule) rather than a Commitment — used by allTasks() to turn a
 * number measurable with a reminder on into one dated Tasks-tab row per
 * period instead of a single persistent Anytime row. Falls back to
 * 'weekly' if the item somehow has no cadence set (schedule.on implies one
 * was chosen, so this only guards stale/partial data).
 */
export function numberItemPeriodKey(item: TrackableItem, when: Date = new Date()): string {
  const cadence = item.cadence ?? 'weekly';
  switch (cadence) {
    case 'weekly':
      return isoWeekKey(when);
    case 'monthly':
      return `${when.getFullYear()}-${String(when.getMonth() + 1).padStart(2, '0')}`;
    case 'custom': {
      const start = new Date(item.createdAt ?? when.toISOString());
      const days = Math.floor((when.getTime() - start.getTime()) / 86400000);
      const idx = Math.max(0, Math.floor(days / cadenceIntervalDays({ cadence, intervalDays: item.intervalDays })));
      return `${(item.createdAt ?? when.toISOString()).slice(0, 10)}+${idx}`;
    }
  }
}

export function numberItemPeriodDueDate(item: TrackableItem, when: Date = new Date()): Date {
  const cadence = item.cadence ?? 'weekly';
  switch (cadence) {
    case 'weekly': {
      const t = new Date(when.getFullYear(), when.getMonth(), when.getDate());
      const day = t.getDay() || 7;
      t.setDate(t.getDate() + (7 - day));
      t.setHours(23, 59, 59, 999);
      return t;
    }
    case 'monthly':
      return new Date(when.getFullYear(), when.getMonth() + 1, 0, 23, 59, 59, 999);
    case 'custom': {
      const start = new Date(item.createdAt ?? when.toISOString());
      const intervalDays = cadenceIntervalDays({ cadence, intervalDays: item.intervalDays });
      const days = Math.floor((when.getTime() - start.getTime()) / 86400000);
      const idx = Math.max(0, Math.floor(days / intervalDays));
      const end = new Date(start);
      end.setDate(end.getDate() + (idx + 1) * intervalDays);
      end.setHours(23, 59, 59, 999);
      return end;
    }
  }
}

export function isNumberItemDoneThisPeriod(item: TrackableItem, when: Date = new Date()): boolean {
  return (item.reminderCompletions ?? []).includes(numberItemPeriodKey(item, when));
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

// ── Amount formatting ──────────────────────────────────────

/** "$1,000" for currency symbols, "40 km" for everything else. */
export function formatAmount(v: number, unit?: string): string {
  const n = formatNumber(v);
  if (!unit) return n;
  // Currency-ish units read better in front: $1,000 not 1,000 $
  return /^[$£€¥]$/.test(unit.trim()) ? `${unit.trim()}${n}` : `${n} ${unit}`;
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

// Fraction complete (0..1) for one TrackableItem.
//
// `goal` is REQUIRED, not optional — every UI call site has a Goal in scope
// (it's the screen/card's own prop), and an earlier optional-with-a-fallback
// signature was a footgun: a 'commitment'-type CHILD has no deadline of its
// own (it lives on its parent, see itemDeadline) and omitting `goal` made
// this silently fall back to `m.deadline` (always undefined on a child),
// which — per commitmentProgress's own "no deadline -> expected 0 -> already
// done if completions.length > 0" fallback — could misread a 3-of-52-done
// commitment as 100% complete. Making `goal` required and letting the
// compiler catch every omission is safer than trusting every future call
// site to remember to pass it.
//
// Hierarchy-aware: a top-level Milestone that HAS children Measurables
// (goal.items.filter(i => i.parentId === m.id)) folds in the average of its
// children's own fractions instead of reading its own (binary, type 'check')
// done flag alone — this is what makes goalProgress / isCompleted /
// milestoneCheckpoints correct once items are nested, without double-counting
// (see those functions below, which iterate top-level items only and rely on
// this recursion to already include each child's share).
//  - The children-average branch is checked BEFORE `done` deliberately: once
//    a Milestone has children, it is a pure container and its own `done`
//    flag is not an independent completion path — see newMilestone/UI call
//    sites, which should not offer a manual done-toggle on a Milestone that
//    has children at all (only on a leaf/childless Milestone), so the
//    affordance and this math stay in agreement.
//  - `done` is an explicit override checked next (a manually-marked-done,
//    childless Measurable/Milestone), same as old milestoneFraction.
//  - 'check' / 'number' / 'ladder' read exactly as the old measurableFraction
//    did — a 'number' item's commitments (if any) only ever move `current`,
//    they don't change how the fraction is computed.
//  - 'commitment' averages commitmentProgress across every attached
//    commitment, resolving the deadline via itemDeadline (walks up to the
//    parent Milestone).
export function measurableFraction(m: TrackableItem, goal: Goal): number {
  const children = goal.items.filter((it) => it.parentId === m.id);
  if (children.length > 0) {
    const sum = children.reduce((acc, c) => acc + measurableFraction(c, goal), 0);
    return sum / children.length;
  }
  if (m.done) return 1;
  switch (m.type) {
    case 'check':
      return m.done ? 1 : 0;
    case 'number':
      if (m.target <= 0) return 0;
      return Math.min(Math.max(m.current / m.target, 0), 1);
    case 'ladder':
      if (m.weeks.length === 0) return 0;
      return m.weeks.filter((w) => w.done).length / m.weeks.length;
    case 'commitment': {
      if (m.commitments.length === 0) return 0;
      const deadline = itemDeadline(m, goal);
      const sum = m.commitments.reduce((acc, s) => acc + commitmentProgress(s, deadline), 0);
      return Math.min(1, sum / m.commitments.length);
    }
  }
}
// Back-compat alias used by the milestone-flavored call sites.
export const milestoneFraction = measurableFraction;

export function milestonePercent(mg: TrackableItem, goal: Goal): number {
  return Math.round(measurableFraction(mg, goal) * 100);
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
  // editTask / removeTask / setTarget — which existing item it hits.
  // `measurableLabel` is what the coach called it, kept for display and as a
  // fallback match if the item was edited after the action was proposed.
  measurableId?: string;
  measurableLabel?: string;
  // addMilestone
  milestoneKind?: MilestoneKind;
  deadline?: string;
  // addCommitment — attaches to a milestone-flagged item, recurring at `cadence`
  cadence?: Cadence;
  intervalDays?: number;
  amount?: number;
  // addCommitment / removeMilestone — which item it hits
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
      const under = target?.label ?? a.milestoneLabel;
      return `Add ${every} step "${a.label}"${under ? ` under "${under}"` : ''}`;
    }
    case 'removeMilestone': {
      const target = resolveMilestone(a, goal);
      return `Remove milestone "${target?.label ?? a.milestoneLabel}"`;
    }
  }
}

// Match an action to the quantified child Measurable it refers to (an item
// with `parentId` set): by id when the coach echoed one back, otherwise by a
// case-insensitive label match.
export function resolveMeasurable(a: CoachAction, goal: Goal): TrackableItem | undefined {
  const list = goal.items.filter((it) => it.parentId != null);
  if (a.measurableId) {
    const byId = list.find((m) => m.id === a.measurableId);
    if (byId) return byId;
  }
  const wanted = (a.measurableLabel ?? a.label ?? '').trim().toLowerCase();
  if (!wanted) return undefined;
  return (
    list.find((m) => m.label.trim().toLowerCase() === wanted) ??
    list.find((m) => m.label.toLowerCase().includes(wanted))
  );
}

// Match an action to the milestone-flagged item it refers to.
export function resolveMilestone(a: CoachAction, goal: Goal): TrackableItem | undefined {
  const list = goal.items.filter((it) => it.milestone);
  if (a.milestoneId) {
    const byId = list.find((mg) => mg.id === a.milestoneId);
    if (byId) return byId;
  }
  const wanted = (a.milestoneLabel ?? '').trim().toLowerCase();
  if (!wanted) return undefined;
  return (
    list.find((mg) => mg.label.trim().toLowerCase() === wanted) ??
    list.find((mg) => mg.label.toLowerCase().includes(wanted))
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
  // Every trackable item on this goal — formerly the two sibling arrays
  // `measurables` and `milestones`, now one unified list (see TrackableItem).
  items: TrackableItem[];
  boardPosition?: BoardPosition;
  // Optional freeform "why this matters" note — surfaced under the title on
  // the goal detail screen and passed to the coach for context. Absent on
  // every goal created before this existed; never backfilled.
  motivation?: string;
  // Per-item bubble position on the goal's own bubble canvas, keyed by
  // TrackableItem.id — same normalized (0..1) shape as a goal's own
  // boardPosition on the main board. Absent entries auto-place on a ring
  // around the central goal bubble.
  measurableBubblePositions?: Record<string, BoardPosition>;
  // Whether the board's pop/confetti/fly-to-completed-column animation has
  // already played for this goal's current completion. `false` means the
  // goal just became complete and the board still owes it that animation;
  // `true` (or unset) means either it was already celebrated, or it isn't
  // complete right now. Managed centrally by the completion-flag watcher in
  // useAppStore (not by any single mutation path) — see there for why. A
  // goal completed before this field existed is treated as already
  // celebrated (unset defaults to "nothing owed"), so old data never
  // replays the animation retroactively.
  completionCelebrated?: boolean;
  // Idempotency marker for the Milestones/Measurables invert migration (see
  // store/migration.ts) — a goal already stamped with the current
  // ITEMS_SCHEMA_VERSION is left untouched by that pass. Absent on every
  // goal that predates the invert, so it always runs at least once on old
  // data.
  itemsSchema?: number;
}

// The bubble/bar fill blends every TOP-LEVEL item into one average, so it can
// never read 100% while isCompleted() below still says the goal isn't done.
// Only top-level items (parentId == null) are iterated — a child Measurable's
// share is already folded into its parent Milestone's own fraction by
// measurableFraction's hierarchy recursion, so including children here too
// would double-count them.
export function goalProgress(g: Goal): number {
  const topLevel = g.items.filter((it) => it.parentId == null);
  if (topLevel.length === 0) return 0;
  const fractions = topLevel.map((it) => measurableFraction(it, g));
  return fractions.reduce((acc, f) => acc + f, 0) / fractions.length;
}

export function goalProgressPercent(g: Goal): number {
  return Math.round(goalProgress(g) * 100);
}

// Checkpoint summary for the discrete milestone markers shown alongside a
// goal's fill (dots on GoalNote) — independent of goalProgress above. Only
// counts top-level milestone-flagged items.
export function milestoneCheckpoints(g: Goal): { done: number; total: number } {
  const milestones = g.items.filter((it) => it.milestone && it.parentId == null);
  return { done: milestones.filter((mg) => measurableFraction(mg, g) >= 1).length, total: milestones.length };
}

// A goal is complete only when EVERY top-level item is fully done —
// independent of goalProgress, which (per above) is an average, not a min.
// Only top-level items are checked; a child's completeness is folded into
// its parent's own fraction via measurableFraction's recursion.
export function isCompleted(g: Goal): boolean {
  const topLevel = g.items.filter((it) => it.parentId == null);
  if (topLevel.length === 0) return false;
  return topLevel.every((m) => measurableFraction(m, g) >= 1);
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
  if (globalCrypto?.randomUUID) return globalCrypto.randomUUID();
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Crypto = require('expo-crypto');
  return Crypto.randomUUID();
}

// Single place where a Measurable's defaults live, so every creation path
// (templates, the add form, coach actions) agrees on them. A Measurable is
// the quantified CHILD of a Milestone — every producer MUST pass `parentId`
// pointing at an existing top-level Milestone's id (auto-creating one first
// if none exists yet); this is enforced at each producer, not here, since
// this factory is also reused by legacy-migration output where the parent is
// synthesized separately (see store/migration.ts).
export function newMeasurable(
  init: Partial<TrackableItem> & { type: MeasurableType; label: string },
): TrackableItem {
  return {
    id: newId(),
    done: false,
    current: 0,
    target: 0,
    unit: '',
    step: 1,
    weeks: [],
    commitments: [],
    createdAt: new Date().toISOString(),
    reminderCompletions: [],
    ...init,
  };
}

// Defaults for a Milestone — a top-level binary win: a title and an optional
// deadline, type always 'check', no target/unit/step/commitments of its own.
// Accepts the old `title` field name too so every existing call site keeps
// compiling unchanged.
export function newMilestone(
  init: { label?: string; title?: string; deadline?: string } & Partial<Omit<TrackableItem, 'commitments' | 'type' | 'target' | 'unit' | 'step'>>,
): TrackableItem {
  const { title, label: initLabel, ...rest } = init;
  const label = initLabel ?? title ?? '';
  return {
    id: newId(),
    type: 'check',
    label,
    done: false,
    current: 0,
    target: 0,
    unit: '',
    step: 1,
    weeks: [],
    commitments: [],
    milestone: true,
    ...rest,
  };
}

export function milestoneStep(mg: TrackableItem): number {
  return measurableStep(mg);
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

// A progressive build-up for a Commitment is exactly a ladder item's
// weekly schedule (same shape, same math) attached to a milestone-flagged
// item's commitment instead of standing alone — this is that reuse, named
// for the call site.
export const buildCommitmentRamp = buildLadderWeeks;
