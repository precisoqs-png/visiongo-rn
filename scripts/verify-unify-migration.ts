/**
 * Standalone verification for the Measurable/Milestone -> TrackableItem
 * merge (store/models.ts + store/useAppStore.ts normalizeYears).
 *
 * Proves, against a realistic OLD-shape persisted blob:
 *   1. normalizeYears is lossless — every meaningful field survives into the
 *      new unified `items` shape (counts, types, targets, current values,
 *      schedules, deadlines, streak-relevant completion history).
 *   2. normalizeYears is idempotent — running it twice does not corrupt or
 *      duplicate anything.
 *   3. Blended progress math (goalProgress/isCompleted) is preserved exactly
 *      for equivalent items pre/post-migration — in particular a goal that
 *      was NOT 100% before (an incomplete milestone) is still NOT 100% after.
 *
 * Run: NODE_PATH=/opt/node22/lib/node_modules npx tsx scripts/verify-unify-migration.ts
 */
import { normalizeYears } from '../store/migration';
import { goalProgress, isCompleted, measurableFraction, commitmentStreak, commitmentProgress } from '../store/models';

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    failures++;
    console.error(`✗ ${msg}`);
  } else {
    console.log(`✓ ${msg}`);
  }
}

// ── Build a realistic OLD-shape (pre-merge) persisted blob ─────────────

const oldYears = [
  {
    year: 2026,
    motto: 'Dream it. Plan it. Live it.',
    goals: [
      // Goal 1: mix of check/number/ladder measurables, no milestones.
      {
        id: 'g1',
        title: 'Get fit',
        colorIndex: 0,
        targetDate: '2026-12-31',
        reminder: { on: true, frequency: 'Daily' },
        chat: [],
        pendingActions: [],
        measurables: [
          { id: 'm1', type: 'check', label: 'Sign up for a race', done: true, current: 0, target: 0, unit: '', step: 1, weeks: [] },
          { id: 'm2', type: 'number', label: 'Days active', done: false, current: 45, target: 150, unit: 'days', step: 1, weeks: [],
            cadence: 'weekly', schedule: { on: true, weekday: 2, dayOfMonth: 1, hour: 9, minute: 0 } },
          { id: 'm3', type: 'ladder', label: 'Weekly long run', done: false, current: 0, target: 21, unit: 'km', step: 1,
            sizedForGoalDate: '2026-12-31',
            weeks: [
              { id: 'w1', value: 5, targetDate: '2026-01-10', done: true },
              { id: 'w2', value: 10, targetDate: '2026-01-17', done: false },
            ] },
        ],
        milestones: [],
      },
      // Goal 2: numeric milestone with flat commitment + effort milestone
      // with a build-up (ramp) commitment — exercises both cadence shapes.
      {
        id: 'g2',
        title: 'Save for a trip',
        colorIndex: 1,
        targetDate: '2026-10-01',
        reminder: { on: false, frequency: 'Daily' },
        chat: [],
        pendingActions: [],
        measurables: [],
        milestones: [
          {
            id: 'mg1', title: 'Save $10,000', kind: 'numeric',
            target: 10000, current: 3000, unit: '$', step: 100,
            deadline: '2026-10-01', sizedForGoalDate: '2026-10-01', done: false,
            steps: [
              {
                id: 's1', label: 'Save $830 per month', amount: 830, unit: '$',
                cadence: 'monthly', completions: ['2026-01', '2026-02', '2026-03'],
                createdAt: '2026-01-01T00:00:00.000Z',
                schedule: { on: true, weekday: 2, dayOfMonth: 28, hour: 9, minute: 0 },
              },
            ],
          },
          {
            id: 'mg2', title: 'Weekly training build-up', kind: 'effort',
            deadline: '2026-06-01', sizedForGoalDate: undefined, done: false,
            steps: [
              {
                id: 's2', label: 'Weekly km build-up', unit: 'km', cadence: 'weekly',
                completions: [], createdAt: '2026-01-01T00:00:00.000Z',
                schedule: { on: false, weekday: 2, dayOfMonth: 1, hour: 9, minute: 0 },
                ramp: [
                  { id: 'r1', value: 5, targetDate: '2026-01-08', done: true },
                  { id: 'r2', value: 10, targetDate: '2026-01-15', done: false },
                ],
              },
              // s3: a commitment persisted before the reminder feature
              // existed at all — no `schedule` key whatsoever (not even
              // `{ on: false }`). Must backfill to DEFAULT_SCHEDULE without
              // crashing or losing its own completion history.
              {
                id: 's3', label: 'Stretch after each run', cadence: 'weekly',
                completions: ['2026-W02', '2026-W03'],
                createdAt: '2026-01-01T00:00:00.000Z',
              },
            ],
          },
        ],
      },
      // Goal 3: already-complete goal (all measurables/milestones done) —
      // regression check for isCompleted() across the migration.
      {
        id: 'g3',
        title: 'Read a book',
        colorIndex: 2,
        reminder: { on: false, frequency: 'Daily' },
        chat: [],
        pendingActions: [],
        measurables: [
          { id: 'm4', type: 'check', label: 'Finish it', done: true, current: 0, target: 0, unit: '', step: 1, weeks: [] },
        ],
        milestones: [
          { id: 'mg3', title: 'Write a review', kind: 'effort', done: true, steps: [] },
        ],
      },
    ],
  },
];

// ── 1. Migrate and verify losslessness ──────────────────────────────

const migrated = normalizeYears(oldYears as any);
const g1 = migrated[0].goals.find((g) => g.id === 'g1')!;
const g2 = migrated[0].goals.find((g) => g.id === 'g2')!;
const g3 = migrated[0].goals.find((g) => g.id === 'g3')!;

assert(g1.items.length === 3, 'g1: 3 items survived (was 3 measurables + 0 milestones)');
assert(g2.items.length === 2, 'g2: 2 items survived (was 0 measurables + 2 milestones)');
assert(g3.items.length === 2, 'g3: 2 items survived (was 1 measurable + 1 milestone)');

const m1 = g1.items.find((it) => it.id === 'm1')!;
assert(m1.type === 'check' && m1.done === true && !m1.milestone, 'm1 (check) carried over: type, done, not milestone-flagged');
assert(m1.cadence === undefined && m1.schedule === undefined, 'm1 predates the reminder feature: cadence/schedule stay absent (not defaulted) after migration, per models.ts comment');

const m2 = g1.items.find((it) => it.id === 'm2')!;
assert(m2.current === 45 && m2.target === 150 && m2.unit === 'days', 'm2 (number) carried over: current/target/unit');
assert(m2.cadence === 'weekly' && m2.schedule?.on === true, 'm2 reminder cadence/schedule carried over');

const m3 = g1.items.find((it) => it.id === 'm3')!;
assert(m3.weeks.length === 2 && m3.weeks[0].done === true && m3.weeks[1].done === false, 'm3 (ladder) weeks + done-state carried over');
assert(m3.sizedForGoalDate === '2026-12-31', 'm3 sizedForGoalDate carried over');

const mg1 = g2.items.find((it) => it.id === 'mg1')!;
assert(mg1.milestone === true && mg1.type === 'number', 'mg1 (numeric milestone) -> milestone:true, type "number"');
assert(mg1.current === 3000 && mg1.target === 10000 && mg1.deadline === '2026-10-01', 'mg1 current/target/deadline carried over');
assert(mg1.commitments.length === 1 && mg1.commitments[0].completions.length === 3, 'mg1 commitment + completion history carried over');
assert(commitmentStreak(mg1.commitments[0], new Date('2026-04-01')) === 3, 'mg1 commitment streak computes correctly from migrated completions');

const mg2 = g2.items.find((it) => it.id === 'mg2')!;
assert(mg2.milestone === true && mg2.type === 'commitment', 'mg2 (effort milestone) -> milestone:true, type "commitment"');
assert(mg2.commitments[0].ramp?.length === 2 && mg2.commitments[0].ramp[0].done === true, 'mg2 build-up (ramp) commitment carried over with week done-state');
assert(mg2.commitments.length === 2, 'mg2 kept BOTH commitments (s2 ramp + s3 schedule-less) — no sibling dropped');

const s3 = mg2.commitments.find((c) => c.id === 's3')!;
assert(!!s3, 's3 (commitment with no schedule key at all pre-migration) survived');
assert(s3.completions.length === 2 && s3.completions[0] === '2026-W02' && s3.completions[1] === '2026-W03', 's3 full completion history (both periods) survived intact — streak-relevant');
assert(commitmentStreak(s3, new Date('2026-01-20')) === 2, 's3 streak computes correctly post-migration');
assert(
  s3.schedule && typeof s3.schedule.on === 'boolean' && typeof s3.schedule.hour === 'number',
  's3 schedule backfilled to a complete StepSchedule (DEFAULT_SCHEDULE) despite predating the field entirely',
);

assert(isCompleted(g3), 'g3 (already-complete goal) still reads complete after migration');

// ── 2. Idempotency ───────────────────────────────────────────────────

const migratedTwice = normalizeYears(migrated as any);
assert(
  JSON.stringify(migratedTwice) === JSON.stringify(migrated),
  'normalizeYears(normalizeYears(x)) === normalizeYears(x) — idempotent, no duplication/corruption',
);

// ── 3. Blended progress math preserved ──────────────────────────────
//
// Pre-merge equivalent math computed by hand from the OLD shape, using the
// documented pre-#28-successor formula: average of every measurable AND
// milestone fraction (milestoneFraction for milestones, measurableFraction
// for measurables) — i.e. exactly what goalProgress(g2) must still produce.

const oldMg1Fraction = Math.min(Math.max(3000 / 10000, 0), 1); // numeric: current/target
// effort milestone (mg2) now has two commitments (s2 ramp build-up + s3 flat
// weekly against mg2's own deadline): its fraction is the average of
// commitmentProgress across both — computed here via the real production
// function (same one measurableFraction's 'commitment' branch calls) rather
// than hand-re-derived, so this check tracks the actual formula instead of
// drifting from it while still being an independent cross-check (built from
// the OLD-shape fields, not read back off the migrated item).
const oldS2Fraction = 1 / 2; // ramp: 1 of 2 weeks done, ramp short-circuits deadline math
const oldS3Fraction = commitmentProgress(
  { id: 's3', label: 'Stretch after each run', cadence: 'weekly', completions: ['2026-W02', '2026-W03'], createdAt: '2026-01-01T00:00:00.000Z', schedule: { on: false, weekday: 2, dayOfMonth: 1, hour: 9, minute: 0 } },
  '2026-06-01',
);
const oldMg2FractionCorrected = (oldS2Fraction + oldS3Fraction) / 2;
const expectedG2Progress = (oldMg1Fraction + oldMg2FractionCorrected) / 2;

assert(
  Math.abs(goalProgress(g2) - expectedG2Progress) < 1e-9,
  `g2 goalProgress after migration matches hand-computed pre-merge blended average (${goalProgress(g2).toFixed(4)} == ${expectedG2Progress.toFixed(4)})`,
);
assert(!isCompleted(g2), 'g2 (incomplete milestone) is NOT 100% complete after migration — matches pre-merge behavior');
assert(goalProgress(g2) < 1, 'g2 blended progress fraction is < 1, matching isCompleted() — no regression of PR #28 "no 100% while incomplete" rule');

assert(isCompleted(g3) && goalProgress(g3) === 1, 'g3 (fully complete goal) reads 100% blended progress AND isCompleted() — consistent');

// A goal with measurables and NO milestones (g1) — orphan-bucket case the
// merge was chosen specifically to avoid regressing.
const g1ExpectedFractions = [measurableFraction(m1), measurableFraction(m2), measurableFraction(m3)];
const g1Expected = g1ExpectedFractions.reduce((a, b) => a + b, 0) / g1ExpectedFractions.length;
assert(Math.abs(goalProgress(g1) - g1Expected) < 1e-9, 'g1 (measurables-only goal, no milestones) blended progress computed correctly');

// ── Result ───────────────────────────────────────────────────────────

console.log('');
if (failures > 0) {
  console.error(`${failures} check(s) FAILED`);
  process.exit(1);
} else {
  console.log('All checks passed.');
}
