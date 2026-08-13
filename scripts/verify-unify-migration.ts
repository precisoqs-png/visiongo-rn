/**
 * Standalone verification for:
 *   1. The Measurable/Milestone -> TrackableItem merge (v5, store/models.ts +
 *      store/migration.ts normalizeYears).
 *   2. The Milestones/Measurables INVERT (v6, invertItemsForGoal) — a
 *      top-level `milestone: true` item used to be the quantified one; now a
 *      top-level Milestone is a pure binary win and the quantified item
 *      becomes a child Measurable (`parentId`).
 *
 * Proves, against a realistic OLD-shape (pre-v6) persisted blob:
 *   1. normalizeYears is lossless — every meaningful field survives into the
 *      new hierarchy (counts, types, targets, current values, schedules,
 *      deadlines, streak-relevant completion history), and reparented items
 *      keep their ORIGINAL id.
 *   2. The new hierarchy round-trips through normalizeYears without loss.
 *   3. normalizeYears is idempotent — running it twice does not corrupt or
 *      duplicate anything, both starting from a legacy blob and from an
 *      already-`itemsSchema: 6` blob.
 *   4. goalProgress/isCompleted/milestoneCheckpoints do not double-count once
 *      items have children, and a commitment on a child whose deadline lives
 *      on the parent resolves correctly (not 0%, not falsely 100%).
 *
 * Run: NODE_PATH=/opt/node22/lib/node_modules npx tsx scripts/verify-unify-migration.ts
 */
import { normalizeYears, ITEMS_SCHEMA_VERSION } from '../store/migration';
import {
  goalProgress, isCompleted, measurableFraction, commitmentStreak, commitmentProgress,
  milestoneCheckpoints, itemDeadline, Goal, newId,
} from '../store/models';
import { TEMPLATE_CATEGORIES, instantiateTemplate } from '../store/goalTemplates';

// Key-order-independent structural equality — plain JSON.stringify would
// spuriously fail two structurally-identical objects whose keys were built
// in a different order (e.g. `itemsSchema` landing before vs. after `items`
// depending on whether it was already present going in), which is not a
// real data difference.
function canonical(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as object).sort()) out[k] = canonical((v as any)[k]);
    return out;
  }
  return v;
}
function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    failures++;
    console.error(`✗ ${msg}`);
  } else {
    console.log(`✓ ${msg}`);
  }
}

// ── Build a realistic OLD-shape (pre-v6) persisted blob ─────────────
//
// Already on the v5 unified `items` shape (this is what a real persisted
// blob from just before the invert would look like) — covers:
//   - old milestone-flagged numeric items with commitments (mg1)
//   - old milestone-flagged effort items with commitments incl. a ramp and a
//     schedule-less legacy commitment (mg2)
//   - plain (non-milestone-flagged) check items (m1, m4)
//   - plain (non-milestone-flagged) standalone number/ladder items (m2, m3)
//   - an already-complete milestone-flagged item with no commitments (mg3)

const oldYears = [
  {
    year: 2026,
    motto: 'Dream it. Plan it. Live it.',
    goals: [
      // Goal 1: mix of plain check/number/ladder items, no milestone-flagged
      // items at all.
      {
        id: 'g1',
        title: 'Get fit',
        colorIndex: 0,
        targetDate: '2026-12-31',
        reminder: { on: true, frequency: 'Daily' },
        chat: [],
        pendingActions: [],
        items: [
          { id: 'm1', type: 'check', label: 'Sign up for a race', done: true, current: 0, target: 0, unit: '', step: 1, weeks: [], commitments: [] },
          { id: 'm2', type: 'number', label: 'Days active', done: false, current: 45, target: 150, unit: 'days', step: 1, weeks: [], commitments: [],
            cadence: 'weekly', schedule: { on: true, weekday: 2, dayOfMonth: 1, hour: 9, minute: 0 } },
          { id: 'm3', type: 'ladder', label: 'Weekly long run', done: false, current: 0, target: 21, unit: 'km', step: 1, commitments: [],
            sizedForGoalDate: '2026-12-31',
            weeks: [
              { id: 'w1', value: 5, targetDate: '2026-01-10', done: true },
              { id: 'w2', value: 10, targetDate: '2026-01-17', done: false },
            ] },
        ],
      },
      // Goal 2: numeric milestone-flagged item with flat commitment + effort
      // milestone-flagged item with a build-up (ramp) commitment plus a
      // second, schedule-less legacy commitment — exercises both cadence
      // shapes and the "no schedule key at all" legacy case.
      {
        id: 'g2',
        title: 'Save for a trip',
        colorIndex: 1,
        targetDate: '2026-10-01',
        reminder: { on: false, frequency: 'Daily' },
        chat: [],
        pendingActions: [],
        items: [
          {
            id: 'mg1', type: 'number', label: 'Save $10,000', milestone: true,
            target: 10000, current: 3000, unit: '$', step: 100, done: false,
            deadline: '2026-10-01', sizedForGoalDate: '2026-10-01', weeks: [],
            commitments: [
              {
                id: 's1', label: 'Save $830 per month', amount: 830, unit: '$',
                cadence: 'monthly', completions: ['2026-01', '2026-02', '2026-03'],
                createdAt: '2026-01-01T00:00:00.000Z',
                schedule: { on: true, weekday: 2, dayOfMonth: 28, hour: 9, minute: 0 },
              },
            ],
          },
          {
            id: 'mg2', type: 'commitment', label: 'Weekly training build-up', milestone: true,
            done: false, current: 0, target: 0, unit: '', step: 1, weeks: [],
            deadline: '2026-06-01', sizedForGoalDate: undefined,
            commitments: [
              {
                id: 's2', label: 'Weekly km build-up', unit: 'km', cadence: 'weekly',
                completions: [], createdAt: '2026-01-01T00:00:00.000Z',
                schedule: { on: false, weekday: 2, dayOfMonth: 1, hour: 9, minute: 0 },
                ramp: [
                  { id: 'r1', value: 5, targetDate: '2026-01-08', done: true },
                  { id: 'r2', value: 10, targetDate: '2026-01-15', done: false },
                ],
              },
              // s3: a commitment with a full completion history but no
              // schedule of its own — must survive verbatim.
              {
                id: 's3', label: 'Stretch after each run', cadence: 'weekly',
                completions: ['2026-W02', '2026-W03'],
                createdAt: '2026-01-01T00:00:00.000Z',
                schedule: { on: false, weekday: 2, dayOfMonth: 1, hour: 9, minute: 0 },
              },
            ],
          },
        ],
      },
      // Goal 3: an already-complete plain check item + an already-complete
      // milestone-flagged item with no commitments — regression check for
      // isCompleted() across the invert.
      {
        id: 'g3',
        title: 'Read a book',
        colorIndex: 2,
        reminder: { on: false, frequency: 'Daily' },
        chat: [],
        pendingActions: [],
        items: [
          { id: 'm4', type: 'check', label: 'Finish it', done: true, current: 0, target: 0, unit: '', step: 1, weeks: [], commitments: [] },
          { id: 'mg3', type: 'commitment', label: 'Write a review', milestone: true, done: true, current: 0, target: 0, unit: '', step: 1, weeks: [], commitments: [] },
        ],
      },
    ],
  },
];

// ── 1. Invert and verify losslessness + id preservation ────────────────

const migrated = normalizeYears(oldYears as any);
const g1 = migrated[0].goals.find((g) => g.id === 'g1')!;
const g2 = migrated[0].goals.find((g) => g.id === 'g2')!;
const g3 = migrated[0].goals.find((g) => g.id === 'g3')!;

assert(g1.itemsSchema === ITEMS_SCHEMA_VERSION, 'g1 stamped with current itemsSchema after invert');
assert(g2.itemsSchema === ITEMS_SCHEMA_VERSION, 'g2 stamped with current itemsSchema after invert');
assert(g3.itemsSchema === ITEMS_SCHEMA_VERSION, 'g3 stamped with current itemsSchema after invert');

// g1: 3 plain items -> m1 (check) becomes a top-level Milestone directly;
// m2/m3 (plain number/ladder) each get wrapped with a synthesized Milestone
// parent -> 3 originals + 2 synthesized parents = 5 items.
assert(g1.items.length === 5, `g1: 3 plain items -> 5 (m1 becomes a Milestone in place; m2/m3 each gain a synthesized parent) — got ${g1.items.length}`);

const m1 = g1.items.find((it) => it.id === 'm1')!;
assert(!!m1, 'm1 kept its original id');
assert(m1.milestone === true && m1.parentId == null, 'm1 (plain check) -> top-level Milestone, same id');
assert(m1.type === 'check' && m1.done === true, 'm1 type/done carried over');
assert(m1.cadence === undefined && m1.schedule === undefined, 'm1 predates the reminder feature: cadence/schedule stay absent');

const m2 = g1.items.find((it) => it.id === 'm2')!;
assert(!!m2, 'm2 kept its original id');
assert(m2.parentId != null && m2.milestone !== true, 'm2 (plain number) -> child Measurable with a parentId, same id');
const m2Parent = g1.items.find((it) => it.id === m2.parentId)!;
assert(!!m2Parent && m2Parent.milestone === true && m2Parent.type === 'check', 'm2 got a freshly synthesized binary Milestone parent');
assert(m2.current === 45 && m2.target === 150 && m2.unit === 'days', 'm2 current/target/unit carried over');
assert(m2.cadence === 'weekly' && m2.schedule?.on === true, 'm2 reminder cadence/schedule carried over');

const m3 = g1.items.find((it) => it.id === 'm3')!;
assert(!!m3, 'm3 kept its original id');
assert(m3.parentId != null && m3.parentId !== m2.parentId, 'm3 (plain ladder) got its OWN synthesized parent, distinct from m2\'s');
assert(m3.weeks.length === 2 && m3.weeks[0].done === true && m3.weeks[1].done === false, 'm3 weeks + done-state carried over');
assert(m3.sizedForGoalDate === '2026-12-31', 'm3 sizedForGoalDate carried over');

// g2: 2 milestone-flagged items, each splits into [synthesized parent, same-id child] -> 4 items.
assert(g2.items.length === 4, `g2: 2 milestone-flagged items -> 4 (each splits into a synthesized parent + same-id child) — got ${g2.items.length}`);

const mg1 = g2.items.find((it) => it.id === 'mg1')!;
assert(!!mg1, 'mg1 kept its original id');
assert(mg1.parentId != null && mg1.milestone !== true, 'mg1 (former numeric milestone) -> child Measurable, same id');
assert(mg1.type === 'number' && mg1.current === 3000 && mg1.target === 10000, 'mg1 type/current/target carried over');
assert(mg1.deadline === undefined, 'mg1 no longer carries its own deadline — it resolves via its parent now');
const mg1Parent = g2.items.find((it) => it.id === mg1.parentId)!;
assert(!!mg1Parent && mg1Parent.milestone === true && mg1Parent.deadline === '2026-10-01', 'mg1\'s synthesized parent inherited the OLD deadline');
assert(mg1.commitments.length === 1 && mg1.commitments[0].completions.length === 3, 'mg1 commitment + completion history carried over');
assert(commitmentStreak(mg1.commitments[0], new Date('2026-04-01')) === 3, 'mg1 commitment streak computes correctly post-invert');

const mg2 = g2.items.find((it) => it.id === 'mg2')!;
assert(!!mg2, 'mg2 kept its original id');
assert(mg2.parentId != null && mg2.milestone !== true, 'mg2 (former effort milestone) -> child Measurable, same id');
assert(mg2.type === 'commitment', 'mg2 type carried over');
assert(mg2.commitments.length === 2, 'mg2 kept BOTH commitments (s2 ramp + s3 schedule-bearing) — no sibling dropped');
assert(mg2.commitments.find((c) => c.id === 's2')?.ramp?.length === 2, 's2 ramp carried over');
const s3 = mg2.commitments.find((c) => c.id === 's3')!;
assert(!!s3, 's3 (legacy commitment) survived');
assert(s3.completions.length === 2 && s3.completions[0] === '2026-W02' && s3.completions[1] === '2026-W03', 's3 full completion history survived intact');
assert(commitmentStreak(s3, new Date('2026-01-20')) === 2, 's3 streak computes correctly post-invert');

// g3: m4 (plain check) -> top-level Milestone in place; mg3 (milestone-flagged,
// no commitments, already done) splits into a synthesized parent + same-id child.
assert(g3.items.length === 3, `g3: 2 items -> 3 (m4 stays 1; mg3 splits into 2) — got ${g3.items.length}`);
const m4 = g3.items.find((it) => it.id === 'm4')!;
assert(m4.milestone === true && m4.parentId == null && m4.done === true, 'm4 (plain check) -> top-level Milestone, same id, done preserved');
const mg3 = g3.items.find((it) => it.id === 'mg3')!;
assert(!!mg3 && mg3.parentId != null, 'mg3 kept its original id as a child Measurable');
const mg3Parent = g3.items.find((it) => it.id === mg3.parentId)!;
assert(!!mg3Parent && mg3Parent.done === true, 'mg3\'s synthesized parent captured the OLD (already-done) fraction as its own done flag');
assert(isCompleted(g3), 'g3 (already-complete goal) still reads complete after invert');

// ── 2. Reverse-direction shape check: the NEW hierarchy round-trips ────

const reRun = normalizeYears(migrated as any);
assert(
  deepEqual(reRun, migrated),
  'normalizeYears applied to already-inverted output round-trips losslessly (no re-invert, no field drift)',
);

// ── 3. Idempotency — from a legacy blob AND from an already-marked blob ──

const migratedTwiceFromLegacy = normalizeYears(oldYears as any);
assert(
  deepEqual(normalizeYears(migratedTwiceFromLegacy as any), migratedTwiceFromLegacy),
  'normalizeYears(normalizeYears(x)) === normalizeYears(x) starting from a legacy (pre-v6) blob',
);

const alreadyMarked: Goal = {
  id: 'g4', title: 'Already migrated', colorIndex: 0,
  reminder: { on: false, frequency: 'Daily' }, chat: [], pendingActions: [],
  itemsSchema: ITEMS_SCHEMA_VERSION,
  items: [
    { id: 'p1', type: 'check', label: 'Win', milestone: true, done: false, current: 0, target: 0, unit: '', step: 1, weeks: [], commitments: [], deadline: '2026-05-01' },
    { id: 'c1', type: 'number', label: 'Progress', parentId: 'p1', done: false, current: 4, target: 10, unit: 'x', step: 1, weeks: [], commitments: [] },
  ],
};
const markedYears = [{ year: 2026, motto: '', goals: [alreadyMarked] }];
const onceFromMarked = normalizeYears(markedYears as any);
const twiceFromMarked = normalizeYears(onceFromMarked as any);
assert(
  deepEqual(twiceFromMarked, onceFromMarked),
  'normalizeYears(normalizeYears(x)) === normalizeYears(x) starting from an already-itemsSchema:6 blob (hard no-op, not just version-gated)',
);
assert(deepEqual(onceFromMarked[0].goals[0].items, alreadyMarked.items), 'an already-marked goal\'s items are untouched by the invert pass');

// ── 4. goalProgress / isCompleted / milestoneCheckpoints regression ─────
//
// No double-counting once items have children: a top-level Milestone with
// one child Measurable must contribute exactly ONE share to goalProgress,
// not two (its own binary done-flag AND the child's fraction separately).

const dcGoal: Goal = {
  id: 'gdc', title: 'Double-count check', colorIndex: 0,
  reminder: { on: false, frequency: 'Daily' }, chat: [], pendingActions: [],
  itemsSchema: ITEMS_SCHEMA_VERSION,
  items: [
    // Milestone A: 50%-done child -> should contribute 0.5 to goalProgress,
    // not (parent's own binary 0 + child's 0.5)/2 or similar.
    { id: 'pA', type: 'check', label: 'A', milestone: true, done: false, current: 0, target: 0, unit: '', step: 1, weeks: [], commitments: [] },
    { id: 'cA', type: 'number', label: 'A-measurable', parentId: 'pA', done: false, current: 5, target: 10, unit: 'x', step: 1, weeks: [], commitments: [] },
    // Milestone B: no children at all, marked done -> contributes 1.
    { id: 'pB', type: 'check', label: 'B', milestone: true, done: true, current: 0, target: 0, unit: '', step: 1, weeks: [], commitments: [] },
  ],
};
assert(Math.abs(goalProgress(dcGoal) - 0.75) < 1e-9, `no double-counting: goalProgress = avg(0.5, 1) = 0.75, got ${goalProgress(dcGoal)}`);
assert(!isCompleted(dcGoal), 'dcGoal not complete (A\'s child is only 50%)');
const cp = milestoneCheckpoints(dcGoal);
assert(cp.total === 2 && cp.done === 1, `milestoneCheckpoints counts top-level Milestones only (A not done, B done): got done=${cp.done} total=${cp.total}`);

// Correct parent-deadline resolution: a commitment living on a CHILD whose
// deadline is only set on the PARENT must resolve that deadline via
// itemDeadline, not read as "no deadline" (which would floor to 0%) or as
// its own stale/absent deadline (which could misread as 100%).
const deadlineGoal: Goal = {
  id: 'gdl', title: 'Deadline resolution check', colorIndex: 0,
  reminder: { on: false, frequency: 'Daily' }, chat: [], pendingActions: [],
  itemsSchema: ITEMS_SCHEMA_VERSION,
  items: [
    { id: 'pD', type: 'check', label: 'Save for a trip', milestone: true, done: false, current: 0, target: 0, unit: '', step: 1, weeks: [], commitments: [], deadline: '2026-12-31' },
    {
      id: 'cD', type: 'commitment', label: 'Monthly savings', parentId: 'pD',
      done: false, current: 0, target: 0, unit: '', step: 1, weeks: [],
      commitments: [
        {
          id: 'stepD', label: 'Save $500/mo', amount: 500, unit: '$', cadence: 'monthly',
          completions: ['2026-01', '2026-02'], createdAt: '2026-01-01T00:00:00.000Z',
          schedule: { on: false, weekday: 2, dayOfMonth: 1, hour: 9, minute: 0 },
        },
      ],
    },
  ],
};
const cD = deadlineGoal.items.find((it) => it.id === 'cD')!;
assert(itemDeadline(cD, deadlineGoal) === '2026-12-31', 'a child\'s itemDeadline resolves through its PARENT\'s deadline, not its own (absent) one');
const resolvedFraction = measurableFraction(cD, deadlineGoal);
assert(resolvedFraction > 0 && resolvedFraction < 1, `commitment-driven child fraction using the parent's deadline is a real partial value (not 0, not falsely 100%): got ${resolvedFraction}`);
// Cross-check against calling commitmentProgress directly with the resolved deadline.
const expectedFraction = commitmentProgress(cD.commitments[0], '2026-12-31');
assert(Math.abs(resolvedFraction - expectedFraction) < 1e-9, 'measurableFraction(child, goal) matches commitmentProgress computed with the parent-resolved deadline directly');

// ── 5. Regression: a freshly-created goal must never be re-inverted ─────
//
// Bug: addGoal/addGoalFull/instantiateTemplate built a Goal with no
// `itemsSchema`, so on the very next rehydrate mergeState's normalizeYears
// (-> invertItemsForGoal) treated it as pre-v6 legacy data and re-inverted
// it — demoting a real top-level Milestone into a synthesized parent's
// child, and severing a Measurable's `parentId` by pointing it at a NEW
// synthetic parent. Fixed by stamping `itemsSchema: ITEMS_SCHEMA_VERSION` on
// every goal-construction call site. This proves it stays fixed: run a
// freshly-built goal (exactly the shape addGoal/addGoalFull now produce)
// through normalizeYears twice and require byte-for-byte (structural)
// equality both times — any re-invert would change item count/ids/shape.

const freshGoal: Goal = {
  id: newId(),
  title: 'New Goal',
  colorIndex: 0,
  reminder: { on: false, frequency: 'Daily' },
  chat: [],
  pendingActions: [],
  items: [],
  itemsSchema: ITEMS_SCHEMA_VERSION,
};
const freshYears = [{ year: 2026, motto: '', goals: [freshGoal] }];
const freshOnce = normalizeYears(freshYears as any);
const freshTwice = normalizeYears(freshOnce as any);
assert(
  deepEqual(freshTwice, freshOnce),
  'a freshly-created (itemsSchema-stamped) goal survives two normalizeYears passes unchanged — never re-inverted',
);
assert(
  freshOnce[0].goals[0].items.length === 0,
  `a freshly-created empty goal stays empty after normalizeYears — got ${freshOnce[0].goals[0].items.length} items`,
);

// ── 6. Regression: a template-instantiated goal survives rehydrate ──────
//
// Exercises the REAL instantiateTemplate (store/goalTemplates.ts), which now
// stamps itemsSchema too — a template with both a plain Milestone (mkCheck)
// and a Milestone+Measurable pair (mkBuildUpMilestone) must come back from
// normalizeYears with the same item count, the same top-level Milestone
// still a Milestone, and the Measurable's parentId still pointing at its
// REAL parent (not a freshly synthesized one).
const halfMarathonTemplate = TEMPLATE_CATEGORIES
  .flatMap((c) => c.templates)
  .find((t) => t.id === 'health-run-half')!;
const templateGoal = instantiateTemplate(halfMarathonTemplate, 0);
assert(templateGoal.itemsSchema === ITEMS_SCHEMA_VERSION, 'instantiateTemplate stamps itemsSchema on the built goal');

const templateYears = [{ year: 2026, motto: '', goals: [templateGoal] }];
const templateNormalized = normalizeYears(templateYears as any);
const templateGoalOut = templateNormalized[0].goals[0];
assert(
  templateGoalOut.items.length === templateGoal.items.length,
  `template goal item count unchanged by normalizeYears — expected ${templateGoal.items.length}, got ${templateGoalOut.items.length}`,
);
assert(
  deepEqual(templateGoalOut.items, templateGoal.items),
  'template goal items are byte-for-byte unchanged after normalizeYears (not re-inverted)',
);
const templateMeasurable = templateGoal.items.find((it) => it.parentId != null)!;
assert(!!templateMeasurable, 'template goal has at least one Measurable child (the build-up ramp)');
const templateMeasurableOut = templateGoalOut.items.find((it) => it.id === templateMeasurable.id)!;
assert(
  !!templateMeasurableOut && templateMeasurableOut.parentId === templateMeasurable.parentId,
  'template Measurable\'s parentId still points at its REAL original parent, not a newly synthesized one'
);
const templateMilestone = templateGoal.items.find((it) => it.milestone && it.parentId == null)!;
assert(!!templateMilestone, 'template goal has at least one top-level Milestone');
const templateMilestoneOut = templateGoalOut.items.find((it) => it.id === templateMilestone.id)!;
assert(
  !!templateMilestoneOut && templateMilestoneOut.milestone === true && templateMilestoneOut.parentId == null,
  'template Milestone is still a top-level Milestone after normalizeYears (not demoted into a child)'
);

// ── 7. measurableFraction(child, goal) end-to-end deadline resolution ───
//
// Now that `goal` is a required argument (bug 3's fix), the only way to call
// measurableFraction on a commitment-driven child is through the real
// parent-deadline resolution path — there is no more optional-arg footgun
// to have a runtime test for (npx tsc --noEmit already enforces every call
// site passes a goal). This re-asserts, through the real signature, that a
// child's fraction differs meaningfully depending on which deadline is used
// — i.e. the parent-resolved deadline is genuinely driving the computation,
// not being silently ignored.
const cD2 = deadlineGoal.items.find((it) => it.id === 'cD')!;
const fractionWithRealParentDeadline = measurableFraction(cD2, deadlineGoal);
// Hypothetical: what the SAME commitment would read as if resolved against
// no deadline at all (the old broken fallback) — expected floors to 0,
// so completions.length > 0 makes commitmentProgress read 100%.
const fractionWithNoDeadline = commitmentProgress(cD2.commitments[0], undefined);
assert(
  fractionWithNoDeadline === 1,
  `sanity: with no deadline, commitmentProgress reads false-positive 100% (the bug this guards against) — got ${fractionWithNoDeadline}`,
);
assert(
  fractionWithRealParentDeadline < fractionWithNoDeadline,
  `measurableFraction resolved through the real parent deadline (${fractionWithRealParentDeadline}) must read LOWER than the broken no-deadline fallback (${fractionWithNoDeadline}) — proves the parent deadline is actually driving the math`
);

// ── 8. Regression: onboarding-built custom goals (bug A) ────────────────
//
// Bug: app/onboarding.tsx built custom-goal Goal literals directly (bypassing
// addGoalFull/instantiateTemplate) with no itemsSchema stamp, then
// completeOnboarding stored them verbatim (no normalizeYears run at save
// time either). Items started empty so nothing looked wrong immediately —
// but if the user added a Milestone + Measurable in that SAME session
// (before any rehydrate), the pair landed in `items` already correctly
// shaped (the v6 shape addMilestone/addMeasurable produce) on a goal that
// still had no itemsSchema marker at all. The NEXT rehydrate's
// normalizeYears saw a goal with no itemsSchema, treated the whole thing as
// pre-v6 legacy, and re-inverted already-correct items — duplicating them
// and severing the Measurable's parentId from its real parent.
//
// Fixed two ways: (1) onboarding now stamps itemsSchema on every goal it
// builds, and (2) invertItemsForGoal is now defensive at the ITEM level too.
// This fixture deliberately leaves itemsSchema OFF the goal (as if fix (1)
// did not exist) specifically so the goal-level short-circuit cannot be
// what's saving it — only fix (2), the item-level shape check, can. That
// makes this a real regression test for the item-level guard, not just a
// duplicate of the "freshly-stamped goal" checks in section 5/6 above.

const onboardingMilestoneId = newId();
const onboardingMeasurableId = newId();
const onboardingGoal: Goal = {
  id: newId(),
  title: 'Learn guitar',
  colorIndex: 0,
  reminder: { on: false, frequency: 'Daily' },
  chat: [],
  pendingActions: [],
  // Deliberately no itemsSchema — reproduces the unfixed onboarding
  // construction site so this test exercises the item-level guard alone.
  items: [
    // "Added live, in-session" — already correctly shaped v6 items (a
    // childless top-level Milestone + its child Measurable), never passed
    // through normalizeYears before this rehydrate.
    { id: onboardingMilestoneId, type: 'check', label: 'Play a full song', milestone: true, done: false, current: 0, target: 0, unit: '', step: 1, weeks: [], commitments: [] },
    { id: onboardingMeasurableId, type: 'number', label: 'Practice sessions', parentId: onboardingMilestoneId, done: false, current: 8, target: 30, unit: 'sessions', step: 1, weeks: [], commitments: [] },
  ],
};
const onboardingYears = [{ year: 2026, motto: '', goals: [onboardingGoal] }];
const onboardingNormalized = normalizeYears(onboardingYears as any);
const onboardingGoalOut = onboardingNormalized[0].goals[0];
assert(
  onboardingGoalOut.items.length === 2,
  `onboarding-shaped goal (missing itemsSchema) with already-v6 items must not be re-inverted — expected 2 items, got ${onboardingGoalOut.items.length}`,
);
const onboardingMilestoneOut = onboardingGoalOut.items.find((it) => it.id === onboardingMilestoneId)!;
const onboardingMeasurableOut = onboardingGoalOut.items.find((it) => it.id === onboardingMeasurableId)!;
assert(
  !!onboardingMilestoneOut && onboardingMilestoneOut.milestone === true && onboardingMilestoneOut.parentId == null,
  'onboarding Milestone stays a top-level Milestone, not demoted into a child',
);
assert(
  !!onboardingMeasurableOut && onboardingMeasurableOut.parentId === onboardingMilestoneId,
  'onboarding Measurable\'s parentId still points at its REAL original parent, not a newly synthesized one',
);
assert(
  onboardingGoalOut.items.filter((it) => it.label === 'Play a full song').length === 1,
  'onboarding Milestone label not duplicated by a spurious re-wrap',
);
assert(
  onboardingGoalOut.items.filter((it) => it.label === 'Practice sessions').length === 1,
  'onboarding Measurable label not duplicated by a spurious re-wrap',
);
assert(
  Math.abs(goalProgress(onboardingGoalOut) - goalProgress(onboardingGoal)) < 1e-9,
  `goalProgress unchanged by normalizeYears on already-correct onboarding items — expected ${goalProgress(onboardingGoal)}, got ${goalProgress(onboardingGoalOut)}`,
);

// Re-run the FULL existing legacy-shape suite's inputs through the item-level
// guard's code path one more time, to make sure the new shape check doesn't
// accidentally swallow genuine pre-v6 conversions (the guard must only ever
// pass through items that are ALREADY correctly shaped, never ones that
// still need splitting/wrapping). Sections 1-4 above already assert this in
// detail; this just re-confirms the top-line counts one more time against a
// SECOND fresh run (a new object graph, not reusing `migrated` from above) so
// there's no chance of accidentally asserting against already-mutated state.
const legacyRecheck = normalizeYears(oldYears as any);
const g1Recheck = legacyRecheck[0].goals.find((g) => g.id === 'g1')!;
const g2Recheck = legacyRecheck[0].goals.find((g) => g.id === 'g2')!;
assert(
  g1Recheck.items.length === 5 && g2Recheck.items.length === 4,
  `item-level guard does not suppress genuine legacy conversions — expected g1=5/g2=4, got g1=${g1Recheck.items.length}/g2=${g2Recheck.items.length}`,
);

// ── 9. Regression: itemsSchema key ordering doesn't churn JSON (bug D) ───
//
// Bug: invertItemsForGoal's stamped-goal object literal (`{ ...goal, items,
// itemsSchema }`) put `itemsSchema` wherever it happened to land relative to
// `items` depending on whether the input already had the key — one order the
// FIRST time a goal is inverted, a DIFFERENT order on every rehydrate after
// that (once normalizeYears' own `unified` object rebuild re-shuffles which
// key was destructured/re-added last). Deep-equal (canonical()/deepEqual()
// above) can't see this since it sorts keys before comparing — this needs an
// EXACT JSON.stringify comparison, which is what AsyncStorage's persisted
// string actually is.
// NOTE: each of these calls `normalizeYears(oldYears)`/`normalizeYears(markedYears)`
// exactly ONCE and reuses that single result for both sides of the
// comparison — normalizeYears synthesizes fresh random ids (newId()) for any
// newly-created parent Milestone, so calling it twice independently on the
// same RAW input (rather than chaining: second call fed the first call's
// OUTPUT) would spuriously differ on those ids alone, which has nothing to
// do with the key-ordering bug this section actually guards against.
const legacyOnce = normalizeYears(oldYears as any);
assert(
  JSON.stringify(legacyOnce) === JSON.stringify(normalizeYears(legacyOnce as any)),
  'normalizeYears output is BYTE-STABLE (not just deep-equal) across repeated rehydrates, starting from a legacy (pre-v6) blob',
);
const markedOnce = normalizeYears(markedYears as any);
assert(
  JSON.stringify(markedOnce) === JSON.stringify(normalizeYears(markedOnce as any)),
  'normalizeYears output is byte-stable across repeated rehydrates, starting from an already-itemsSchema:6 blob',
);

// ── Result ───────────────────────────────────────────────────────────

console.log('');
if (failures > 0) {
  console.error(`${failures} check(s) FAILED`);
  process.exit(1);
} else {
  console.log('All checks passed.');
}
