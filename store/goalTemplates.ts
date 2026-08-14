import {
  Goal, TrackableItem, newId, newMeasurable,
  newMilestone, newCommitment, buildCommitmentRamp,
} from './models';
import { ITEMS_SCHEMA_VERSION } from './migration';

export interface GoalTemplate {
  id: string;
  emoji: string;
  title: string;
  category: string;
  stepCount: number;
  // Every item (Milestones and their child Measurables, already flattened
  // and parented) this template seeds a new goal with.
  build: () => TrackableItem[];
}

export interface TemplateCategory {
  name: string;
  templates: GoalTemplate[];
}

// A one-off binary win with nothing to tick up — a top-level Milestone on
// its own, no child Measurable needed.
function mkCheck(label: string): TrackableItem {
  return newMilestone({ label });
}

// A quantified goal — a Milestone (the win) with one child Measurable (the
// number) tracking it. `step` is how far one tap of +/- moves the counter —
// 1 for day/session counts, coarser for targets counted in hundreds.
function mkNumber(label: string, target: number, unit: string, step = 1): TrackableItem[] {
  const milestone = newMilestone({ label });
  const measurable = newMeasurable({
    type: 'number', label, target, unit, step, parentId: milestone.id,
  });
  return [milestone, measurable];
}

// A progressive build-up — a Milestone (the win) with one child Measurable
// (type 'commitment', no target/current of its own) carrying a single
// weekly-ramp Commitment. Gives it commitment machinery (reminders, the
// Tasks tab) a bare ladder Measurable doesn't have.
function mkBuildUpMilestone(
  title: string, start: number, end: number, weekCount: number, unit: string,
): TrackableItem[] {
  const ramp = buildCommitmentRamp(start, end, weekCount);
  const milestone = newMilestone({ label: title });
  const measurable = newMeasurable({
    type: 'commitment', label: title, parentId: milestone.id,
    commitments: [newCommitment({ label: title, unit, cadence: 'weekly', ramp })],
  });
  return [milestone, measurable];
}

export const TEMPLATE_CATEGORIES: TemplateCategory[] = [
  {
    name: 'Health & Body',
    templates: [
      {
        id: 'health-run-half', emoji: '🏃', title: 'Run a half marathon',
        category: 'Health & Body', stepCount: 3,
        build: () => [
          mkCheck('Sign up for a race'),
          mkCheck('Get fitted running shoes'),
          ...mkBuildUpMilestone('Weekly long-run build-up', 5, 21, 10, 'km'),
        ],
      },
      {
        id: 'health-move-daily', emoji: '💪', title: 'Move every day',
        category: 'Health & Body', stepCount: 2,
        build: () => [
          ...mkNumber('Days active', 150, 'days'),
          mkCheck('Find a workout I enjoy'),
        ],
      },
      {
        id: 'health-sleep', emoji: '😴', title: 'Sleep 8 hours',
        category: 'Health & Body', stepCount: 2,
        build: () => [
          ...mkNumber('Nights on track', 60, 'nights'),
          mkCheck('Set a wind-down routine'),
        ],
      },
    ],
  },
  {
    name: 'Mind & Growth',
    templates: [
      {
        id: 'mind-read', emoji: '📚', title: 'Read 24 books',
        category: 'Mind & Growth', stepCount: 2,
        build: () => [
          ...mkNumber('Books finished', 24, 'bk'),
          mkCheck('Join a book club'),
        ],
      },
      {
        id: 'mind-language', emoji: '🌍', title: 'Learn a language',
        category: 'Mind & Growth', stepCount: 2,
        build: () => [
          mkCheck('Hold a 5-min conversation'),
          // Days-per-week studied, ramping up — NOT weeks (a ladder that
          // ramped 1 -> 30 "wk" produced meaningless fractional week values
          // like "5.8 wk", and a 30-week streak can't be reached within a
          // 12-week ladder anyway).
          ...mkBuildUpMilestone('Weekly study days build-up', 2, 6, 12, 'days/week'),
        ],
      },
      {
        id: 'mind-mindful', emoji: '🧘', title: 'Mindful mornings',
        category: 'Mind & Growth', stepCount: 2,
        build: () => [
          ...mkNumber('Days meditated', 60, 'days'),
          mkCheck('No phone first hour'),
        ],
      },
    ],
  },
  {
    name: 'Money',
    templates: [
      {
        id: 'money-emergency', emoji: '🏦', title: 'Build an emergency fund',
        category: 'Money', stepCount: 2,
        build: () => [
          ...mkNumber('Amount saved', 5000, '$', 50),
          mkCheck('Open a savings account'),
        ],
      },
      {
        id: 'money-trip', emoji: '✈️', title: 'Save for a dream trip',
        category: 'Money', stepCount: 2,
        build: () => [
          ...mkNumber('Amount set aside', 6000, '$', 50),
          mkCheck('Choose destination'),
        ],
      },
    ],
  },
  {
    name: 'Creativity',
    templates: [
      {
        id: 'creative-cook', emoji: '🍳', title: 'Cook 5 signature dishes',
        category: 'Creativity', stepCount: 5,
        build: () => [
          mkCheck('Dish one'),
          mkCheck('Dish two'),
          mkCheck('Dish three'),
          mkCheck('Dish four'),
          mkCheck('Dish five'),
        ],
      },
      {
        id: 'creative-photo', emoji: '📷', title: 'Learn film photography',
        category: 'Creativity', stepCount: 3,
        build: () => [
          mkCheck('Buy a film camera'),
          mkCheck('Shoot first roll'),
          mkCheck('Develop and print'),
        ],
      },
      {
        id: 'creative-write', emoji: '✍️', title: 'Write every week',
        category: 'Creativity', stepCount: 1,
        build: () => [
          ...mkBuildUpMilestone('Weekly word-count build-up', 200, 2000, 12, 'words'),
        ],
      },
    ],
  },
  {
    name: 'Life & Home',
    templates: [
      {
        id: 'life-declutter', emoji: '🏠', title: 'Declutter the home',
        category: 'Life & Home', stepCount: 1,
        build: () => [
          ...mkNumber('Rooms cleared', 6, 'rm'),
        ],
      },
      {
        id: 'life-circle', emoji: '🤝', title: 'Grow my circle',
        category: 'Life & Home', stepCount: 2,
        build: () => [
          ...mkNumber('New connections', 12, 'ppl'),
          mkCheck('Reconnect with an old friend'),
        ],
      },
    ],
  },
];

export function instantiateTemplate(t: GoalTemplate, colorIndex: number): Goal {
  return {
    id: newId(),
    title: t.title,
    colorIndex,
    reminder: { on: false, frequency: 'Daily' },
    chat: [],
    pendingActions: [],
    items: t.build(),
    // Already built directly on the current (post-invert) shape — a
    // top-level Milestone from mkCheck/mkBuildUpMilestone/mkNumber, its
    // Measurable children already parented. Stamping this prevents the next
    // rehydrate's normalizeYears pass from treating it as legacy data and
    // re-inverting it (see store/migration.ts's ITEMS_SCHEMA_VERSION comment).
    itemsSchema: ITEMS_SCHEMA_VERSION,
  };
}
