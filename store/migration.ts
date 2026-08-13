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
// `items` array. v6: the Milestones/Measurables model INVERTS — a top-level
// `milestone: true` item used to be the quantified one (current/target/
// commitments); now a top-level Milestone is a pure binary win (type
// 'check', no target/unit/commitments) and the quantified item becomes a
// child Measurable (`parentId` pointing at its Milestone) carrying the old
// commitments. See invertItemsForGoal below. Saved data predating any of
// these must be backfilled or the +/- controls freeze, the goal screen reads
// an undefined array, or the progress math reads a shape that no longer
// exists.

import {
  YearData, Goal, TrackableItem, CoachAction, PendingAction,
  Commitment, Reminder, DEFAULT_SCHEDULE, newId, measurableFraction,
} from './models';

// Bumped only when the shape of Goal.items itself changes (not on every
// STORE_VERSION bump) — see invertItemsForGoal. A goal already stamped with
// this exact value is left untouched by the invert pass, which is what makes
// normalizeYears a hard no-op on already-migrated data even though
// mergeState (useAppStore.ts) calls it on EVERY rehydrate, not just when a
// stored version number says to.
export const ITEMS_SCHEMA_VERSION = 6;

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
    goals: (y.goals ?? []).map(({ suggestions, minorGoals, measurables, milestones, items, itemsSchema, ...g }): Goal => {
      const unified: Goal = {
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
        // present) is re-backfilled field-by-field for idempotency rather
        // than re-derived from the old arrays (which have already been
        // dropped from the destructured `g` above, so the stale duplicates
        // never linger in the re-saved blob either way).
        items: items
          ? items.map(normalizeItem)
          : [
              ...(measurables ?? []).map(migrateLegacyMeasurable),
              ...(milestones ?? minorGoals ?? []).map(migrateLegacyMilestone),
            ],
        // Explicitly re-attached here (rather than left to linger wherever it
        // fell in `g`'s own spread order) so `items` and `itemsSchema` are
        // ALWAYS the last two keys, in that fixed order, on every goal this
        // function produces — whether itemsSchema was present on the input or
        // not. Without this, a goal's key order depends on whether itemsSchema
        // already existed going in (it lands right after `items` the first
        // time invertItemsForGoal stamps it, but ends up appended even later,
        // ahead of the freshly-rebuilt `items` key, on the NEXT pass) — same
        // data, different JSON.stringify output, which makes the persisted
        // blob churn on every rehydrate for no data reason. `itemsSchema:
        // undefined` here is dropped by JSON.stringify on legacy goals, so
        // this has no effect on what gets persisted for them.
        itemsSchema,
      };
      // v6: invert the Milestones/Measurables model — see invertItemsForGoal.
      // Runs after the v5 unify above so it always sees the current `items`
      // shape, and is itself gated on `itemsSchema` for idempotency.
      const inverted = invertItemsForGoal(unified);
      // Defensive orphan sweep — deliberately UNCONDITIONAL, unlike the two
      // guards above. Both `itemsSchema` (goal-level) and the `parentId !=
      // null` item-level guard inside invertItemsForGoal exist to protect
      // already-correctly-shaped data from being RE-INVERTED — a different
      // concern from sweeping up a dangling `parentId` that should never
      // have existed in the first place (a since-fixed bug, a hand-edited
      // backup, etc.), regardless of what schema version the goal claims.
      // Gating this behind either guard would mean an orphan riding along on
      // an already-v6-stamped goal — which both guards wave straight through
      // untouched — sails through forever. See sweepOrphanParents below.
      return sweepOrphanParents(inverted);
    }),
  }));
}

// Re-parents any item whose `parentId` points at an id that doesn't match
// any other item on the same goal. Left unrepaired, such an item is
// invisible to goalProgress/isCompleted (both filter to `parentId == null`
// top-level items only) while still rendering its own card at whatever
// fraction its no-parent-found deadline/progress fallbacks produce — worst
// case, an orphan under a goal's ONLY top-level Milestone leaves that goal
// with zero top-level items, and isCompleted() returns false unconditionally
// for a goal with no top-level items, making it permanently uncompletable.
//
// All of a goal's orphans (there's normally at most one, but this doesn't
// assume that) are re-parented under ONE freshly synthesized top-level
// Milestone, rather than one synthetic parent each — an orphan's original
// intended parent is unrecoverable by definition (that's what makes it an
// orphan), so there's no more "correct" grouping to reconstruct, and one
// visibly-labeled "Recovered items" container is easier for a user to
// notice and clean up than several. A promoted top-level item for the
// orphan itself (instead of wrapping it) was considered and rejected: a
// quantified ('number'/'commitment'/etc) item at top level violates the
// "a top-level Milestone is always type 'check'" invariant the rest of this
// model (and measurableFraction's children-average branch) relies on.
//
// Idempotent by construction: once swept, every formerly-orphaned item's
// `parentId` resolves to the synthesized Milestone, which is itself a
// present item with no `parentId` of its own — a second pass finds zero
// orphans and returns `items` unchanged (same array reference, even, since
// the empty-orphans branch below short-circuits before building anything).
function sweepOrphanParents(goal: Goal): Goal {
  const ids = new Set(goal.items.map((it) => it.id));
  const orphans = goal.items.filter((it) => it.parentId != null && !ids.has(it.parentId));
  if (orphans.length === 0) return goal;

  const orphanIds = new Set(orphans.map((it) => it.id));
  const recoveryParent: TrackableItem = {
    id: newId(),
    type: 'check',
    label: 'Recovered items',
    done: false,
    current: 0,
    target: 0,
    unit: '',
    step: 1,
    weeks: [],
    commitments: [],
    milestone: true,
  };
  const items = [
    recoveryParent,
    ...goal.items.map((it) => (orphanIds.has(it.id) ? { ...it, parentId: recoveryParent.id } : it)),
  ];
  return { ...goal, items };
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

// Inverts one goal's `items` from the pre-v6 shape (a `milestone: true` item
// was the quantified one, carrying current/target/commitments; a plain
// `type: 'check'` item was a one-off win) to the target shape (a top-level
// Milestone is a pure binary win; the quantified thing becomes a child
// Measurable with `parentId` pointing at its Milestone). Hard no-op once
// `goal.itemsSchema === ITEMS_SCHEMA_VERSION` — required because mergeState
// (useAppStore.ts) runs normalizeYears on EVERY rehydrate, not just when a
// stored version number says a migration is due.
//
// Every reparented item keeps its ORIGINAL id (measurableBubblePositions and
// notification identifiers are keyed by item id) — only synthesized parent
// Milestones get a new id.
export function invertItemsForGoal(goal: Goal): Goal {
  if (goal.itemsSchema === ITEMS_SCHEMA_VERSION) return goal;

  const nextItems: TrackableItem[] = [];
  for (const item of goal.items) {
    // Defensive, ITEM-level guard — the `itemsSchema` check above is a
    // goal-level idempotency marker, and it is the ONLY thing that stops this
    // function from re-inverting already-correctly-shaped items IF something
    // upstream forgot to stamp it (e.g. a goal built and saved without ever
    // going through normalizeYears, then edited in-session before the next
    // rehydrate — see the onboarding custom-goal bug this guards against).
    // Without this, an already-v6 item would get blindly re-wrapped/re-split
    // by the branches below, which only look at the item's OWN shape and have
    // no idea whether it was already migrated.
    //
    // Both shapes checked here are UNAMBIGUOUS post-invert-only shapes that
    // never occur in any pre-v6 persisted data:
    //  - `parentId` is a brand new field this very function introduces —
    //    no pre-v6 item shape (LegacyMeasurable, LegacyMilestone, or a
    //    plain pre-invert TrackableItem) ever has it set, so ANY item
    //    carrying one is unambiguously already a v6 child Measurable.
    //  - `milestone: true` + `type: 'check'` together only ever come out of
    //    THIS function (the two branches below, for a former quantified
    //    Milestone's synthesized parent and for a plain check item promoted
    //    in place) — a pre-v6 milestone-flagged item was always type
    //    'number' or 'commitment' (see migrateLegacyMilestone), never
    //    'check', so this combination is unambiguously a v6 top-level
    //    Milestone.
    // A goal that genuinely still needs converting (the fixtures below) never
    // produces either shape on its OWN pre-invert items, so this can't mask a
    // real legacy item that actually needs splitting/wrapping.
    if (item.parentId != null || (item.milestone === true && item.type === 'check')) {
      nextItems.push(item);
      continue;
    }
    if (item.milestone) {
      // Former quantified Milestone (numeric or effort, carries commitments)
      // -> child Measurable under a freshly synthesized binary parent.
      // Completion is captured on the OLD fraction semantics (before any
      // field changes) so the synthesized parent starts out done/not-done
      // exactly as the old milestone read.
      // Pre-invert `goal.items` never has any `parentId` set (that's the
      // shape this function is about to introduce), so passing the
      // in-progress `goal` here as the required `goal` arg is equivalent to
      // the old optional-arg omission: measurableFraction's children lookup
      // finds nothing and falls through to reading `item` on its own, same
      // as before.
      const wasDone = measurableFraction(item, goal) >= 1;
      const parentId = newId();
      nextItems.push({
        id: parentId,
        type: 'check',
        label: item.label,
        done: wasDone,
        current: 0,
        target: 0,
        unit: '',
        step: 1,
        weeks: [],
        commitments: [],
        deadline: item.deadline,
        milestone: true,
      }, {
        ...item,
        milestone: undefined,
        deadline: undefined,
        parentId,
      });
      continue;
    }
    if (item.type === 'check') {
      // Plain one-off win -> top-level Milestone, same id, no other changes.
      nextItems.push({ ...item, milestone: true });
      continue;
    }
    // Plain quantified item (number/ladder, e.g. template mkNumber output)
    // -> wrapped with a synthesized binary Milestone parent. Same id on the
    // reparented Measurable; new id on the synthesized parent. Same
    // pre-invert-shape reasoning as the `goal` arg above applies here too.
    const wasDone = measurableFraction(item, goal) >= 1;
    const parentId = newId();
    nextItems.push({
      id: parentId,
      type: 'check',
      label: item.label,
      done: wasDone,
      current: 0,
      target: 0,
      unit: '',
      step: 1,
      weeks: [],
      commitments: [],
      deadline: item.deadline,
      milestone: true,
    }, {
      ...item,
      deadline: undefined,
      parentId,
    });
  }

  return { ...goal, items: nextItems, itemsSchema: ITEMS_SCHEMA_VERSION };
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
