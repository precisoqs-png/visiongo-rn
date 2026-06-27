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
  // ladder
  weeks: LadderWeek[];
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

export interface Suggestion {
  id: string;
  label: string;
  type: MeasurableType;
  target?: number;
  unit?: string;
  ladderStart?: number;
  ladderEnd?: number;
  ladderWeeks?: number;
}

export interface Goal {
  id: string;
  title: string;
  colorIndex: number;
  targetDate?: string; // ISO date string
  reminder: Reminder;
  chat: ChatMessage[];
  suggestions: Suggestion[];
  measurables: Measurable[];
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

// ── seed helpers ──────────────────────────────────────────────

// Minimal uuid v4 without the package dependency
export function newId(): string {
  // RFC4122 v4 compatible using Math.random
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function isoDate(year: number, month: number, day: number): string {
  return new Date(year, month - 1, day).toISOString();
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
    const value = start + step * i;
    const date = new Date(endDate);
    date.setDate(date.getDate() - (count - i) * 7);
    weeks.push({ id: newId(), value, targetDate: date.toISOString(), done: false });
  }
  return weeks;
}

export function buildSeedData(): YearData[] {
  const year = new Date().getFullYear();

  const oct = isoDate(year, 10, 4);
  const jun = isoDate(year, 6, 30);
  const dec = isoDate(year, 12, 31);
  const sep = isoDate(year, 9, 1);

  const g0: Goal = {
    id: newId(),
    title: 'Run a half marathon',
    colorIndex: 0,
    targetDate: oct,
    reminder: { on: false, frequency: 'Daily' },
    chat: [],
    suggestions: [],
    measurables: [
      {
        id: newId(), type: 'check', label: 'Sign up for a race',
        done: true, current: 0, target: 0, unit: '', weeks: [],
      },
      {
        id: newId(), type: 'ladder', label: 'Weekly long run',
        done: false, current: 0, target: 13.1, unit: 'miles',
        weeks: buildLadderWeeks(3, 13.1, 12, oct).map((w, i) => ({
          ...w, done: i < 3,
        })),
      },
    ],
  };

  const g1: Goal = {
    id: newId(),
    title: 'Read 24 books',
    colorIndex: 1,
    targetDate: dec,
    reminder: { on: false, frequency: 'Daily' },
    chat: [],
    suggestions: [],
    measurables: [{
      id: newId(), type: 'number', label: 'Books read',
      done: false, current: 7, target: 24, unit: 'books', weeks: [],
    }],
  };

  const g2: Goal = {
    id: newId(),
    title: 'Launch side project',
    colorIndex: 2,
    targetDate: jun,
    reminder: { on: false, frequency: 'Daily' },
    chat: [],
    suggestions: [],
    measurables: [
      { id: newId(), type: 'check', label: 'Define MVP scope', done: true, current: 0, target: 0, unit: '', weeks: [] },
      { id: newId(), type: 'check', label: 'Build landing page', done: true, current: 0, target: 0, unit: '', weeks: [] },
      { id: newId(), type: 'check', label: 'Ship to beta users', done: false, current: 0, target: 0, unit: '', weeks: [] },
    ],
  };

  const g3: Goal = {
    id: newId(),
    title: 'Meditate daily',
    colorIndex: 3,
    targetDate: dec,
    reminder: { on: false, frequency: 'Daily' },
    chat: [],
    suggestions: [],
    measurables: [{
      id: newId(), type: 'number', label: 'Consecutive days',
      done: false, current: 45, target: 365, unit: 'days', weeks: [],
    }],
  };

  const g4: Goal = {
    id: newId(),
    title: 'Save for vacation',
    colorIndex: 4,
    targetDate: sep,
    reminder: { on: false, frequency: 'Daily' },
    chat: [],
    suggestions: [],
    measurables: [{
      id: newId(), type: 'number', label: 'Saved',
      done: false, current: 1200, target: 3000, unit: 'USD', weeks: [],
    }],
  };

  const g5: Goal = {
    id: newId(),
    title: 'Learn Spanish',
    colorIndex: 5,
    targetDate: dec,
    reminder: { on: false, frequency: 'Daily' },
    chat: [],
    suggestions: [],
    measurables: [
      {
        id: newId(), type: 'number', label: 'Duolingo streak',
        done: false, current: 30, target: 365, unit: 'days', weeks: [],
      },
      { id: newId(), type: 'check', label: 'Complete beginner course', done: false, current: 0, target: 0, unit: '', weeks: [] },
    ],
  };

  return [{
    year,
    motto: 'Dream it. Plan it. Live it.',
    goals: [g0, g1, g2, g3, g4, g5],
  }];
}
