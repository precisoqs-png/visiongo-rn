// ── Persist migration ─────────────────────────────────────────
//
// Pulled out of useAppStore.ts so it has no dependency on zustand/React
// Native — normalizeYears only touches plain data (./models types), so it
// can be exercised standalone (see scripts/verify-unify-migration.ts)
// without pulling in the whole app.
//
// v1: measurables gained a per-measurable `step`, and coach `suggestions`
// became `pendingActions`. v2: goals gained `milestones`, each with its own
// accountable steps. v5: `measurables` + `milestones` merged into one
// `items` array. Saved data predating any of these must be backfilled or the
// +/- controls freeze, the goal screen reads an undefined array, or the
// progress math reads a shape that no longer exists.

import {
  YearData, Goal, TrackableItem, CoachAction, PendingAction,
  Commitment, Reminder, DEFAULT_SCHEDULE, newId,
} from './models';

interface LegacySuggestion {
  id: string;
  label: string;
  type: 'check' | 'number' | 'ladder';
  target?: number;
  unit?: string;
  ladderStart?: number;
  ladderEnd?: number;
  ladderWeeks?: number;
}

// v4-and-earlier persisted shapes — kept exactly as they existed before this
// migration, independent of the current (post-merge) TrackableItem/Commitment
// types, so a change to those types can never silently change what old data
// is read as.
interface LegacyLadderWeek { id: string; value: number; targetDate: string; done: boolean }
interface LegacyStepSchedule { on: boolean; weekday: number; dayOfMonth: number; hour: number; minute: number }
type LegacyCadence = 'weekly' | 'monthly' | 'custom';
interface LegacyCommitment {
  id: string;
  label: string;
  amount?: number;
  unit?: string;
  cadence: LegacyCadence;
  intervalDays?: number;
  schedule?: Partial<LegacyStepSchedule>;
  completions?: string[];
  createdAt?: string;
  ramp?: LegacyLadderWeek[];
}
interface LegacyMeasurable {
  id: string;
  type: 'check' | 'number' | 'ladder';
  label: string;
  done: boolean;
  current: number;
  target: number;
  unit: string;
  step?: number;
  weeks: LegacyLadderWeek[];
  sizedForGoalDate?: string;
  cadence?: LegacyCadence;
  intervalDays?: number;
  schedule?: LegacyStepSchedule;
}
interface LegacyMilestone {
  id: string;
  title: string;
  kind: 'numeric' | 'effort';
  target?: number;
  current?: number;
  unit?: string;
  step?: number;
  deadline?: string;
  sizedForGoalDate?: string;
  done?: boolean;
  steps?: LegacyCommitment[];
}
// v2-and-earlier field/action names, from before the "Minor Goal" ->
// "Milestone" rename, and v3-and-earlier action names from before
// "Accountable Step" -> "Commitment" — still readable so nobody's existing
// saved goals silently lose their data on these upgrades.
type LegacyCoachActionKind = 'addMinorGoal' | 'removeMinorGoal' | 'addAccountableStep';
type LegacyCoachAction = Omit<CoachAction, 'kind'> & {
  kind: CoachAction['kind'] | LegacyCoachActionKind;
  minorGoalKind?: 'numeric' | 'effort';
  minorGoalId?: string;
  minorGoalLabel?: string;
};
type LegacyPendingAction = Omit<PendingAction, 'action'> & { action: LegacyCoachAction };
// A goal as it may be found in ANY previously-persisted blob: it may already
// be on the current unified `items` shape, or still carry the pre-v5
// `measurables`/`milestones` split (or, going back further, `minorGoals`/
// `suggestions`).
type LegacyGoal = Omit<Goal, 'pendingActions' | 'items'> & {
  pendingActions?: LegacyPendingAction[];
  items?: TrackableItem[];
  measurables?: LegacyMeasurable[];
  milestones?: LegacyMilestone[];
  minorGoals?: LegacyMilestone[];
  suggestions?: LegacySuggestion[];
};
// Everything normalizeYears (and therefore migrateState/mergeState/
// importBackup) accepts as input — any previously-persisted `years` array,
// on any historical shape.
export type LegacyYears = (Omit<YearData, 'goals'> & { goals: LegacyGoal[] })[] | undefined;

const LEGACY_ACTION_KIND: Record<LegacyCoachActionKind, CoachAction['kind']> = {
  addMinorGoal: 'addMilestone',
  removeMinorGoal: 'removeMilestone',
  addAccountableStep: 'addCommitment',
};

function migratePendingAction(p: LegacyPendingAction): PendingAction {
  const { kind, minorGoalKind, minorGoalId, minorGoalLabel, ...rest } = p.action;
  const migratedKind: CoachAction['kind'] =
    (LEGACY_ACTION_KIND as Record<string, CoachAction['kind']>)[kind] ?? (kind as CoachAction['kind']);
  return {
    id: p.id,
    action: {
      ...rest,
      kind: migratedKind,
      milestoneKind: rest.milestoneKind ?? minorGoalKind,
      milestoneId: rest.milestoneId ?? minorGoalId,
      milestoneLabel: rest.milestoneLabel ?? minorGoalLabel,
    },
  };
}

function migrateLegacyCommitment(s: LegacyCommitment): Commitment {
  return {
    id: s.id,
    label: s.label,
    amount: s.amount,
    unit: s.unit,
    cadence: s.cadence,
    intervalDays: s.intervalDays,
    completions: s.completions ?? [],
    createdAt: s.createdAt ?? new Date().toISOString(),
    schedule: { ...DEFAULT_SCHEDULE, ...(s.schedule ?? {}) },
    ramp: s.ramp,
  };
}

// A pre-v5 flat Measurable becomes a plain TrackableItem — `milestone` stays
// unset, `commitments` is empty, every field is 1:1 (`step` backfilled the
// same way it always was).
function migrateLegacyMeasurable(m: LegacyMeasurable): TrackableItem {
  return {
    id: m.id,
    type: m.type,
    label: m.label,
    done: m.done ?? false,
    current: m.current ?? 0,
    target: m.target ?? 0,
    unit: m.unit ?? '',
    step: typeof m.step === 'number' && m.step > 0 ? m.step : 1,
    weeks: m.weeks ?? [],
    sizedForGoalDate: m.sizedForGoalDate,
    cadence: m.cadence,
    intervalDays: m.intervalDays,
    schedule: m.schedule,
    commitments: [],
  };
}

// A pre-v5 Milestone becomes a TrackableItem with `milestone: true`: `title`
// -> `label`, `steps` -> `commitments`, `kind` folds into `type` — 'numeric'
// (which drove its fraction off current/target) becomes type 'number',
// 'effort' (which drove its fraction off the average of its steps) becomes
// the new type 'commitment'. Every other field carries over unchanged.
function migrateLegacyMilestone(mg: LegacyMilestone): TrackableItem {
  return {
    id: mg.id,
    type: mg.kind === 'numeric' ? 'number' : 'commitment',
    label: mg.title,
    done: mg.done ?? false,
    current: mg.current ?? 0,
    target: mg.target ?? 0,
    unit: mg.unit ?? '',
    step: typeof mg.step === 'number' && mg.step > 0 ? mg.step : 1,
    weeks: [],
    sizedForGoalDate: mg.sizedForGoalDate,
    deadline: mg.deadline,
    milestone: true,
    commitments: (mg.steps ?? []).map(migrateLegacyCommitment),
  };
}

// Idempotent: safe to run on already-migrated data (every branch below reads
// the NEW `items` key first and only falls back to a legacy array when it's
// absent, so a goal that already has `items` passes straight through — the
// map below still runs to backfill any field-level gaps, but produces the
// same shape it was given). Exported so imported backup JSON
// (Settings > Backup > Import) can be run through the same defensive
// backfilling as any other persisted blob, instead of duplicating this logic.
export function normalizeYears(years: LegacyYears): YearData[] {
  return (years ?? []).map((y) => ({
    ...y,
    goals: (y.goals ?? []).map(({ suggestions, minorGoals, measurables, milestones, items, ...g }): Goal => ({
      ...g,
      // Goals persisted before the reminder feature existed have no
      // `reminder` key at all — every screen that reads goal.reminder.on
      // (Settings, the milestones screen, notificationService) assumes it's
      // always present, so backfill it here rather than scattering `?.`
      // guards across every read site.
      reminder: g.reminder ?? ({ on: false, frequency: 'Daily' } as Reminder),
      pendingActions: g.pendingActions
        ? g.pendingActions.map(migratePendingAction)
        : (suggestions ?? []).map(legacySuggestionToPending),
      // v5: `measurables` + `milestones` (itself `minorGoals` pre-v3) merge
      // into one `items` array. A goal already on the new shape (`items`
      // present) is re-backfilled field-by-field for idempotency rather than
      // re-derived from the old arrays (which have already been dropped from
      // the destructured `g` above, so the stale duplicates never linger in
      // the re-saved blob either way).
      items: items
        ? items.map(normalizeItem)
        : [
            ...(measurables ?? []).map(migrateLegacyMeasurable),
            ...(milestones ?? minorGoals ?? []).map(migrateLegacyMilestone),
          ],
    })),
  }));
}

// Backfills a single already-unified item — covers a step/schedule/history
// gap the same way the pre-v5 measurable/milestone backfills did, and is
// also what makes re-running normalizeYears on already-migrated data a no-op.
function normalizeItem(m: TrackableItem): TrackableItem {
  return {
    ...m,
    step: typeof m.step === 'number' && m.step > 0 ? m.step : 1,
    weeks: m.weeks ?? [],
    commitments: (m.commitments ?? []).map((s) => ({
      ...s,
      completions: s.completions ?? [],
      createdAt: s.createdAt ?? new Date().toISOString(),
      schedule: { ...DEFAULT_SCHEDULE, ...(s.schedule ?? {}) },
    })),
  };
}

function legacySuggestionToPending(s: LegacySuggestion): PendingAction {
  return {
    id: s.id ?? newId(),
    action: {
      kind: 'addTask',
      type: s.type,
      label: s.label,
      target: s.target,
      unit: s.unit,
      ladderStart: s.ladderStart,
      ladderEnd: s.ladderEnd,
      ladderWeeks: s.ladderWeeks,
    },
  };
}
