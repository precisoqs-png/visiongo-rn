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

// ── ID generation ─────────────────────────────────────────────

export function newId(): string {
  return Crypto.randomUUID();
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
