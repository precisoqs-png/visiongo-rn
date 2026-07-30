import { Goal, Measurable, newId, newMeasurable, buildLadderWeeks } from './models';

export interface GoalTemplate {
  id: string;
  emoji: string;
  title: string;
  category: string;
  stepCount: number;
  buildMeasurables: () => Measurable[];
}

export interface TemplateCategory {
  name: string;
  templates: GoalTemplate[];
}

function mkCheck(label: string): Measurable {
  return newMeasurable({ type: 'check', label });
}
// `step` is how far one tap of +/- moves the counter — 1 for day/session
// counts, coarser for targets counted in hundreds.
function mkNumber(label: string, target: number, unit: string, step = 1): Measurable {
  return newMeasurable({ type: 'number', label, target, unit, step });
}
function mkLadder(label: string, start: number, end: number, weekCount: number, unit: string): Measurable {
  return newMeasurable({
    type: 'ladder', label, target: end, unit,
    weeks: buildLadderWeeks(start, end, weekCount),
  });
}

export const TEMPLATE_CATEGORIES: TemplateCategory[] = [
  {
    name: 'Health & Body',
    templates: [
      {
        id: 'health-run-half', emoji: '🏃', title: 'Run a half marathon',
        category: 'Health & Body', stepCount: 3,
        buildMeasurables: () => [
          mkLadder('Weekly km buildup', 5, 21, 10, 'km'),
          mkCheck('Sign up for a race'),
          mkCheck('Get fitted running shoes'),
        ],
      },
      {
        id: 'health-move-daily', emoji: '💪', title: 'Move every day',
        category: 'Health & Body', stepCount: 2,
        buildMeasurables: () => [
          mkNumber('Days active', 150, 'days'),
          mkCheck('Find a workout I enjoy'),
        ],
      },
      {
        id: 'health-sleep', emoji: '😴', title: 'Sleep 8 hours',
        category: 'Health & Body', stepCount: 2,
        buildMeasurables: () => [
          mkNumber('Nights on track', 60, 'nights'),
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
        buildMeasurables: () => [
          mkNumber('Books finished', 24, 'bk'),
          mkCheck('Join a book club'),
        ],
      },
      {
        id: 'mind-language', emoji: '🌍', title: 'Learn a language',
        category: 'Mind & Growth', stepCount: 2,
        buildMeasurables: () => [
          // Days-per-week studied, ramping up — NOT weeks (a ladder that
          // ramped 1 -> 30 "wk" produced meaningless fractional week values
          // like "5.8 wk", and a 30-week streak can't be reached within a
          // 12-week ladder anyway).
          mkLadder('Weekly study days build-up', 2, 6, 12, 'days/week'),
          mkCheck('Hold a 5-min conversation'),
        ],
      },
      {
        id: 'mind-mindful', emoji: '🧘', title: 'Mindful mornings',
        category: 'Mind & Growth', stepCount: 2,
        buildMeasurables: () => [
          mkNumber('Days meditated', 60, 'days'),
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
        buildMeasurables: () => [
          mkNumber('Amount saved', 5000, '$', 50),
          mkCheck('Open a savings account'),
        ],
      },
      {
        id: 'money-trip', emoji: '✈️', title: 'Save for a dream trip',
        category: 'Money', stepCount: 2,
        buildMeasurables: () => [
          mkNumber('Amount set aside', 6000, '$', 50),
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
        buildMeasurables: () => [
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
        buildMeasurables: () => [
          mkCheck('Buy a film camera'),
          mkCheck('Shoot first roll'),
          mkCheck('Develop and print'),
        ],
      },
      {
        id: 'creative-write', emoji: '✍️', title: 'Write every week',
        category: 'Creativity', stepCount: 1,
        buildMeasurables: () => [
          mkLadder('Weekly word-count build-up', 200, 2000, 12, 'words'),
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
        buildMeasurables: () => [
          mkNumber('Rooms cleared', 6, 'rm'),
        ],
      },
      {
        id: 'life-circle', emoji: '🤝', title: 'Grow my circle',
        category: 'Life & Home', stepCount: 2,
        buildMeasurables: () => [
          mkNumber('New connections', 12, 'ppl'),
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
    measurables: t.buildMeasurables(),
    minorGoals: [],
  };
}
