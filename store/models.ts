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
}

// Data persisted before per-measurable steps existed has no `step`, and a
// zero/negative step would freeze the +/- buttons — always read it via this.
export function measurableStep(m: Measurable): number {
  return typeof m.step === 'number' && m.step > 0 ? m.step : 1;
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

export type CoachActionKind = 'addTask' | 'editTask' | 'removeTask' | 'setTarget';

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
}

export interface PendingAction {
  id: string;
  action: CoachAction;
}

function fmtNum(v: number): string {
  return v % 1 === 0 ? String(Math.round(v)) : String(Math.round(v * 10) / 10);
}

// One-line human summary shown on the confirmation chip.
export function describeAction(a: CoachAction, goal: Goal): string {
  const existing = resolveMeasurable(a, goal);
  const name = existing?.label ?? a.measurableLabel ?? a.label ?? 'step';
  const unit = a.unit ?? existing?.unit ?? '';
  switch (a.kind) {
    case 'addTask':
      if (a.type === 'ladder') {
        return `Add "${a.label}" — ${fmtNum(a.ladderStart ?? 0)}→${fmtNum(a.ladderEnd ?? 0)} ${unit} over ${a.ladderWeeks ?? 0} weeks`;
      }
      if (a.type === 'number') {
        return `Add "${a.label}" — target ${fmtNum(a.target ?? 0)} ${unit}`.trimEnd();
      }
      return `Add "${a.label}"`;
    case 'editTask': {
      const bits: string[] = [];
      if (a.label && a.label !== existing?.label) bits.push(`rename to "${a.label}"`);
      if (a.target != null) bits.push(`target ${fmtNum(a.target)} ${unit}`.trimEnd());
      if (a.step != null) bits.push(`step ${fmtNum(a.step)}`);
      if (a.unit != null && a.unit !== existing?.unit) bits.push(`unit ${a.unit}`);
      return `Edit "${name}"${bits.length ? ` — ${bits.join(', ')}` : ''}`;
    }
    case 'removeTask':
      return `Remove "${name}"`;
    case 'setTarget':
      return `Set "${name}" target to ${fmtNum(a.target ?? 0)} ${unit}`.trimEnd();
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
  boardPosition?: BoardPosition;
}

export function goalProgress(g: Goal): number {
  if (g.measurables.length === 0) return 0;
  const sum = g.measurables.reduce((acc, m) => acc + measurableFraction(m), 0);
  return sum / g.measurables.length;
}

export function goalProgressPercent(g: Goal): number {
  return Math.round(goalProgress(g) * 100);
}

export function isCompleted(g: Goal): boolean {
  return g.measurables.length > 0 && goalProgress(g) >= 1;
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
