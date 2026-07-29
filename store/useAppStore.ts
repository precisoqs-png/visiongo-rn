import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  YearData, Goal, Measurable, ChatMessage,
  CoachAction, PendingAction,
  BoardLayout, BoardViewMode,
  newId, newMeasurable, buildLadderWeeks, resolveMeasurable,
} from './models';
import { GOAL_NOTE_COLORS as COLORS } from '../theme/themes';

const COACH_DAILY_LIMIT = 20;

// Bumped whenever the persisted shape changes — see migrateState below.
const STORE_VERSION = 1;

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface AppState {
  years: YearData[];
  notificationsMasterOn: boolean;
  hasCompletedOnboarding: boolean;
  selectedYear: number;
  boardLayout: BoardLayout;
  boardViewMode: BoardViewMode;

  // Daily coach usage — { date: 'YYYY-MM-DD', count: number }
  coachUsage: { date: string; count: number };

  selectYear: (year: number) => void;
  currentYearData: () => YearData | undefined;
  setMotto: (motto: string) => void;

  // Internal: run a pure updater against one goal of the selected year.
  _patchGoal: (goalId: string, fn: (g: Goal) => Goal) => void;

  addGoal: (title?: string) => string;
  addGoalFull: (goal: Goal) => string;
  updateGoal: (goal: Goal) => void;
  deleteGoal: (id: string) => void;
  getGoal: (id: string) => Goal | undefined;

  addMeasurable: (m: Measurable, goalId: string) => void;
  updateMeasurable: (m: Measurable, goalId: string) => void;
  deleteMeasurable: (mid: string, goalId: string) => void;

  // Coach-proposed edits: queued on the goal, applied only on confirmation.
  addPendingActions: (actions: CoachAction[], goalId: string) => void;
  applyPendingAction: (pid: string, goalId: string) => void;
  applyAllPendingActions: (goalId: string) => void;
  dismissPendingAction: (pid: string, goalId: string) => void;
  clearPendingActions: (goalId: string) => void;

  addChatMessage: (msg: ChatMessage, goalId: string) => void;

  allTasks: () => TaskGroup[];
  completeTaskItem: (item: TaskItem) => void;

  // Returns true if the send is allowed, false if the daily cap is reached.
  incrementCoachUsage: () => boolean;

  completeOnboarding: (year: number, motto: string, goals: Goal[]) => void;
  resetOnboarding: () => void;

  setBoardLayout: (l: BoardLayout) => void;
  setBoardViewMode: (m: BoardViewMode) => void;
  setNotificationsMaster: (on: boolean) => void;

  // Drops every hand-placed bubble position so the board re-runs its layout.
  realignBoard: () => void;
}

export interface TaskItem {
  id: string;
  measurableId: string;
  ladderWeekId?: string;
  goalId: string;
  goalTitle: string;
  goalColorIndex: number;
  label: string;
  dueDate?: Date;
  done: boolean;
}

export type TaskGroupKey = 'Overdue' | 'This Week' | 'This Month' | 'Upcoming' | 'Anytime';
export const TASK_GROUP_ORDER: TaskGroupKey[] = [
  'Overdue', 'This Week', 'This Month', 'Upcoming', 'Anytime',
];

export interface TaskGroup {
  key: TaskGroupKey;
  items: TaskItem[];
}

function localDate(iso: string): Date {
  const [y, mo, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, mo - 1, d);
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      years: [],
      notificationsMasterOn: true,
      hasCompletedOnboarding: false,
      selectedYear: new Date().getFullYear(),
      boardLayout: 'radial',
      boardViewMode: 'wholeYear',
      coachUsage: { date: '', count: 0 },

      currentYearData: () => get().years.find((y) => y.year === get().selectedYear),

      selectYear: (year) => {
        const existing = get().years.find((y) => y.year === year);
        if (!existing) {
          set((s) => ({
            years: [...s.years, { year, motto: 'Dream it. Plan it. Live it.', goals: [] }]
              .sort((a, b) => a.year - b.year),
          }));
        }
        set({ selectedYear: year });
      },

      setMotto: (motto) => {
        const year = get().selectedYear;
        set((s) => ({
          years: s.years.map((y) => y.year === year ? { ...y, motto } : y),
        }));
      },

      _patchGoal: (goalId, fn) => {
        const year = get().selectedYear;
        set((s) => ({
          years: s.years.map((y) =>
            y.year === year
              ? { ...y, goals: y.goals.map((g) => (g.id === goalId ? fn(g) : g)) }
              : y
          ),
        }));
      },

      addGoal: (title = 'New Goal') => {
        const year = get().selectedYear;
        const existing = get().years.find((y) => y.year === year);
        if (!existing) get().selectYear(year);
        const colorIndex = (get().years.find((y) => y.year === year)?.goals.length ?? 0) % COLORS.length;
        const goal: Goal = {
          id: newId(), title, colorIndex,
          reminder: { on: false, frequency: 'Daily' },
          chat: [], pendingActions: [], measurables: [],
        };
        set((s) => ({
          years: s.years.map((y) =>
            y.year === year ? { ...y, goals: [...y.goals, goal] } : y
          ),
        }));
        return goal.id;
      },

      addGoalFull: (goal) => {
        const year = get().selectedYear;
        const existing = get().years.find((y) => y.year === year);
        if (!existing) get().selectYear(year);
        set((s) => ({
          years: s.years.map((y) =>
            y.year === year ? { ...y, goals: [...y.goals, goal] } : y
          ),
        }));
        return goal.id;
      },

      updateGoal: (goal) => {
        const year = get().selectedYear;
        set((s) => ({
          years: s.years.map((y) =>
            y.year === year
              ? { ...y, goals: y.goals.map((g) => g.id === goal.id ? goal : g) }
              : y
          ),
        }));
      },

      deleteGoal: (id) => {
        const year = get().selectedYear;
        set((s) => ({
          years: s.years.map((y) =>
            y.year === year ? { ...y, goals: y.goals.filter((g) => g.id !== id) } : y
          ),
        }));
      },

      getGoal: (id) => get().currentYearData()?.goals.find((g) => g.id === id),

      addMeasurable: (m, goalId) => {
        const year = get().selectedYear;
        set((s) => ({
          years: s.years.map((y) =>
            y.year === year
              ? { ...y, goals: y.goals.map((g) =>
                  g.id === goalId ? { ...g, measurables: [...g.measurables, m] } : g
                )}
              : y
          ),
        }));
      },

      updateMeasurable: (m, goalId) => {
        const year = get().selectedYear;
        set((s) => ({
          years: s.years.map((y) =>
            y.year === year
              ? { ...y, goals: y.goals.map((g) =>
                  g.id === goalId
                    ? { ...g, measurables: g.measurables.map((mm) => mm.id === m.id ? m : mm) }
                    : g
                )}
              : y
          ),
        }));
      },

      deleteMeasurable: (mid, goalId) => {
        const year = get().selectedYear;
        set((s) => ({
          years: s.years.map((y) =>
            y.year === year
              ? { ...y, goals: y.goals.map((g) =>
                  g.id === goalId
                    ? { ...g, measurables: g.measurables.filter((m) => m.id !== mid) }
                    : g
                )}
              : y
          ),
        }));
      },

      addPendingActions: (actions, goalId) => {
        if (actions.length === 0) return;
        const queued: PendingAction[] = actions.map((action) => ({ id: newId(), action }));
        get()._patchGoal(goalId, (g) => ({
          ...g, pendingActions: [...g.pendingActions, ...queued],
        }));
      },

      applyPendingAction: (pid, goalId) => {
        const goal = get().getGoal(goalId);
        const pending = goal?.pendingActions.find((pa) => pa.id === pid);
        if (!goal || !pending) return;
        get()._patchGoal(goalId, (g) => ({
          ...applyCoachAction(g, pending.action),
          pendingActions: g.pendingActions.filter((pa) => pa.id !== pid),
        }));
      },

      applyAllPendingActions: (goalId) => {
        get()._patchGoal(goalId, (g) => ({
          // Fold the queue in order so a later edit can build on an earlier add.
          ...g.pendingActions.reduce((acc, pa) => applyCoachAction(acc, pa.action), g),
          pendingActions: [],
        }));
      },

      dismissPendingAction: (pid, goalId) => {
        get()._patchGoal(goalId, (g) => ({
          ...g, pendingActions: g.pendingActions.filter((pa) => pa.id !== pid),
        }));
      },

      clearPendingActions: (goalId) => {
        get()._patchGoal(goalId, (g) => ({ ...g, pendingActions: [] }));
      },

      addChatMessage: (msg, goalId) => {
        const year = get().selectedYear;
        set((s) => ({
          years: s.years.map((y) =>
            y.year === year
              ? { ...y, goals: y.goals.map((g) =>
                  g.id === goalId ? { ...g, chat: [...g.chat, msg] } : g
                )}
              : y
          ),
        }));
      },

      allTasks: () => {
        const yd = get().currentYearData();
        if (!yd) return [];
        const now = new Date();
        // A task is overdue only once its due date is fully in the past —
        // something due today belongs in "This Week", not "Overdue".
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const weekEnd = new Date(now); weekEnd.setDate(weekEnd.getDate() + 7);
        const monthEnd = new Date(now); monthEnd.setMonth(monthEnd.getMonth() + 1);
        const buckets: Record<TaskGroupKey, TaskItem[]> = {
          'Overdue': [], 'This Week': [], 'This Month': [], 'Upcoming': [], 'Anytime': [],
        };
        for (const goal of yd.goals) {
          for (const m of goal.measurables) {
            if (m.type === 'check') {
              const dueDate = goal.targetDate ? localDate(goal.targetDate) : undefined;
              const item: TaskItem = {
                id: `task-${m.id}`, measurableId: m.id, goalId: goal.id,
                goalTitle: goal.title, goalColorIndex: goal.colorIndex,
                label: m.label, dueDate, done: m.done,
              };
              if (!dueDate) buckets['Anytime'].push(item);
              else if (dueDate < todayStart) buckets['Overdue'].push(item);
              else if (dueDate <= weekEnd) buckets['This Week'].push(item);
              else if (dueDate <= monthEnd) buckets['This Month'].push(item);
              else buckets['Upcoming'].push(item);
            } else if (m.type === 'ladder') {
              for (const week of m.weeks) {
                const due = localDate(week.targetDate);
                const item: TaskItem = {
                  id: `task-${m.id}-${week.id}`, measurableId: m.id, ladderWeekId: week.id,
                  goalId: goal.id, goalTitle: goal.title, goalColorIndex: goal.colorIndex,
                  label: `${fmtVal(week.value)} ${m.unit} – ${m.label}`,
                  dueDate: due, done: week.done,
                };
                if (due < todayStart) buckets['Overdue'].push(item);
                else if (due <= weekEnd) buckets['This Week'].push(item);
                else if (due <= monthEnd) buckets['This Month'].push(item);
                else buckets['Upcoming'].push(item);
              }
            }
          }
        }
        return TASK_GROUP_ORDER
          .map((key) => ({ key, items: buckets[key] }))
          .filter((g) => g.items.length > 0);
      },

      completeTaskItem: (item) => {
        const year = get().selectedYear;
        set((s) => ({
          years: s.years.map((y) => {
            if (y.year !== year) return y;
            return {
              ...y,
              goals: y.goals.map((g) => {
                if (g.id !== item.goalId) return g;
                return {
                  ...g,
                  measurables: g.measurables.map((m) => {
                    if (m.id !== item.measurableId) return m;
                    if (item.ladderWeekId) {
                      return { ...m, weeks: m.weeks.map((w) =>
                        w.id === item.ladderWeekId ? { ...w, done: true } : w
                      )};
                    }
                    return { ...m, done: true };
                  }),
                };
              }),
            };
          }),
        }));
      },

      incrementCoachUsage: () => {
        const today = todayKey();
        const { coachUsage } = get();
        if (coachUsage.date !== today) {
          // New day — reset counter and allow
          set({ coachUsage: { date: today, count: 1 } });
          return true;
        }
        if (coachUsage.count >= COACH_DAILY_LIMIT) {
          return false;
        }
        set({ coachUsage: { date: today, count: coachUsage.count + 1 } });
        return true;
      },

      completeOnboarding: (year, motto, goals) => {
        const yd: YearData = { year, motto: motto || 'Dream it. Plan it. Live it.', goals };
        set((s) => ({
          years: s.years.filter((y) => y.year !== year).concat(yd).sort((a, b) => a.year - b.year),
          selectedYear: year,
          hasCompletedOnboarding: true,
        }));
      },

      resetOnboarding: () => set({ hasCompletedOnboarding: false }),

      setBoardLayout: (l) => set({ boardLayout: l }),
      setBoardViewMode: (m) => set({ boardViewMode: m }),
      setNotificationsMaster: (on) => set({ notificationsMasterOn: on }),

      realignBoard: () => {
        const year = get().selectedYear;
        set((s) => ({
          years: s.years.map((y) =>
            y.year === year
              ? {
                  ...y,
                  goals: y.goals.map(({ boardPosition, ...rest }) => rest),
                }
              : y
          ),
        }));
      },
    }),
    {
      name: 'visiongo-app-data',
      storage: createJSONStorage(() => AsyncStorage),
      version: STORE_VERSION,
      migrate: migrateState,
      merge: mergeState,
      onRehydrateStorage: () => (_state, error) => {
        if (error) {
          console.warn('[VisionGo] Failed to restore saved data:', error);
        }
      },
    }
  )
);

// ── Coach action reducer ──────────────────────────────────────
//
// Pure: takes a goal and one confirmed coach action, returns the updated goal.
// Anything that cannot be resolved (an edit to a step the user already deleted)
// is a no-op rather than an error — the action has already left the queue.

function applyCoachAction(goal: Goal, a: CoachAction): Goal {
  if (a.kind === 'addTask') {
    const type = a.type ?? 'check';
    const label = (a.label ?? '').trim();
    if (!label) return goal;
    const m = newMeasurable({ type, label, unit: a.unit ?? '' });
    if (type === 'number') {
      m.target = a.target ?? 1;
      m.step = a.step && a.step > 0 ? a.step : 1;
    } else if (type === 'ladder') {
      const end = a.ladderEnd ?? a.target ?? 1;
      m.target = end;
      m.step = a.step && a.step > 0 ? a.step : 1;
      m.weeks = buildLadderWeeks(a.ladderStart ?? 0, end, a.ladderWeeks ?? 4, goal.targetDate);
    }
    return { ...goal, measurables: [...goal.measurables, m] };
  }

  const existing = resolveMeasurable(a, goal);
  if (!existing) return goal;

  if (a.kind === 'removeTask') {
    return { ...goal, measurables: goal.measurables.filter((m) => m.id !== existing.id) };
  }

  const patched: Measurable = { ...existing };
  if (a.kind === 'setTarget') {
    if (a.target == null) return goal;
    patched.target = a.target;
  } else {
    // editTask — only the fields the coach actually named change.
    if (a.label?.trim()) patched.label = a.label.trim();
    if (a.target != null) patched.target = a.target;
    if (a.unit != null) patched.unit = a.unit;
    if (a.step != null && a.step > 0) patched.step = a.step;
  }
  // A lowered target must not leave the step showing 145/100.
  patched.current = Math.min(patched.current, Math.max(patched.target, 0));
  if (patched.type === 'ladder' && patched.target !== existing.target) {
    const start = existing.weeks[0]?.value ?? 0;
    patched.weeks = buildLadderWeeks(
      start, patched.target, existing.weeks.length || 4, goal.targetDate,
    );
  }
  return {
    ...goal,
    measurables: goal.measurables.map((m) => (m.id === existing.id ? patched : m)),
  };
}

// ── Persist migration ─────────────────────────────────────────
//
// v1: measurables gained a per-measurable `step`, and coach `suggestions`
// became `pendingActions`. Saved data predating either must be backfilled or
// the +/- controls freeze and the goal screen reads an undefined array.

interface LegacySuggestion {
  id: string;
  label: string;
  type: Measurable['type'];
  target?: number;
  unit?: string;
  ladderStart?: number;
  ladderEnd?: number;
  ladderWeeks?: number;
}

type LegacyMeasurable = Omit<Measurable, 'step'> & { step?: number };
type LegacyGoal = Omit<Goal, 'pendingActions' | 'measurables'> & {
  pendingActions?: PendingAction[];
  measurables?: LegacyMeasurable[];
  suggestions?: LegacySuggestion[];
};
type LegacyState = Omit<AppState, 'years'> & { years?: (Omit<YearData, 'goals'> & { goals: LegacyGoal[] })[] };

// Idempotent: safe to run on already-migrated data.
function normalizeYears(years: LegacyState['years']): YearData[] {
  return (years ?? []).map((y) => ({
    ...y,
    goals: (y.goals ?? []).map(({ suggestions, ...g }): Goal => ({
      ...g,
      measurables: (g.measurables ?? []).map((m) => ({
        ...m,
        step: typeof m.step === 'number' && m.step > 0 ? m.step : 1,
      })),
      pendingActions: g.pendingActions ?? (suggestions ?? []).map(legacySuggestionToPending),
    })),
  }));
}

function migrateState(persisted: unknown, _version: number): AppState {
  const state = persisted as LegacyState;
  if (!state?.years) return state as AppState;
  return { ...state, years: normalizeYears(state.years) } as AppState;
}

// zustand only calls `migrate` when the stored blob carries a numeric version,
// so anything written without one would slip through unmigrated and crash on
// `goal.pendingActions`. Normalizing here as well closes that gap.
function mergeState(persisted: unknown, current: AppState): AppState {
  const state = persisted as LegacyState;
  if (!state?.years) return { ...current, ...(state as object) } as AppState;
  return { ...current, ...state, years: normalizeYears(state.years) } as AppState;
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

function fmtVal(v: number): string {
  return v % 1 === 0 ? String(Math.round(v)) : v.toFixed(1);
}
