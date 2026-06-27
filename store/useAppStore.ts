import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  YearData, Goal, Measurable, Suggestion, ChatMessage,
  BoardLayout, BoardViewMode,
  newId, buildSeedData, buildLadderWeeks,
  goalProgress, isCompleted, isoDate,
} from './models';
import { GOAL_NOTE_COLORS as COLORS } from '../theme/themes';


interface AppState {
  // Data
  years: YearData[];
  notificationsMasterOn: boolean;
  hasCompletedOnboarding: boolean;

  // UI state
  selectedYear: number;
  boardLayout: BoardLayout;
  boardViewMode: BoardViewMode;

  // ─── Year ────────────────────────────────────────────
  selectYear: (year: number) => void;
  currentYearData: () => YearData | undefined;
  setMotto: (motto: string) => void;

  // ─── Goals ──────────────────────────────────────────
  addGoal: (title?: string) => string;
  updateGoal: (goal: Goal) => void;
  deleteGoal: (id: string) => void;
  getGoal: (id: string) => Goal | undefined;

  // ─── Measurables ─────────────────────────────────────
  addMeasurable: (m: Measurable, goalId: string) => void;
  updateMeasurable: (m: Measurable, goalId: string) => void;
  deleteMeasurable: (mid: string, goalId: string) => void;

  // ─── Suggestions ─────────────────────────────────────
  addSuggestion: (s: Suggestion, goalId: string) => void;
  addSuggestionAsMeasurable: (s: Suggestion, goalId: string) => void;
  removeSuggestion: (sid: string, goalId: string) => void;

  // ─── Chat ───────────────────────────────────────────
  addChatMessage: (msg: ChatMessage, goalId: string) => void;

  // ─── Tasks ──────────────────────────────────────────
  allTasks: () => TaskGroup[];
  completeTaskItem: (item: TaskItem) => void;

  // ─── Onboarding ─────────────────────────────────────
  completeOnboarding: (year: number, motto: string, goalTitles: string[]) => void;
  resetOnboarding: () => void;

  // ─── Board helpers ───────────────────────────────────
  setBoardLayout: (l: BoardLayout) => void;
  setBoardViewMode: (m: BoardViewMode) => void;
  setNotificationsMaster: (on: boolean) => void;
}

// ── Task types ────────────────────────────────────────────

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

// ── Store ────────────────────────────────────────────────

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      years: [],
      notificationsMasterOn: true,
      hasCompletedOnboarding: false,
      selectedYear: new Date().getFullYear(),
      boardLayout: 'radial',
      boardViewMode: 'wholeYear',

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

      addGoal: (title = 'New Goal') => {
        const year = get().selectedYear;
        const existing = get().years.find((y) => y.year === year);
        if (!existing) get().selectYear(year);

        const colorIndex = (get().years.find((y) => y.year === year)?.goals.length ?? 0) % COLORS.length;
        const goal: Goal = {
          id: newId(),
          title,
          colorIndex,
          reminder: { on: false, frequency: 'Daily' },
          chat: [],
          suggestions: [],
          measurables: [],
        };
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
              ? {
                  ...y,
                  goals: y.goals.map((g) =>
                    g.id === goalId ? { ...g, measurables: [...g.measurables, m] } : g
                  ),
                }
              : y
          ),
        }));
      },

      updateMeasurable: (m, goalId) => {
        const year = get().selectedYear;
        set((s) => ({
          years: s.years.map((y) =>
            y.year === year
              ? {
                  ...y,
                  goals: y.goals.map((g) =>
                    g.id === goalId
                      ? { ...g, measurables: g.measurables.map((mm) => mm.id === m.id ? m : mm) }
                      : g
                  ),
                }
              : y
          ),
        }));
      },

      deleteMeasurable: (mid, goalId) => {
        const year = get().selectedYear;
        set((s) => ({
          years: s.years.map((y) =>
            y.year === year
              ? {
                  ...y,
                  goals: y.goals.map((g) =>
                    g.id === goalId
                      ? { ...g, measurables: g.measurables.filter((m) => m.id !== mid) }
                      : g
                  ),
                }
              : y
          ),
        }));
      },

      addSuggestion: (s, goalId) => {
        const year = get().selectedYear;
        set((st) => ({
          years: st.years.map((y) =>
            y.year === year
              ? {
                  ...y,
                  goals: y.goals.map((g) =>
                    g.id === goalId ? { ...g, suggestions: [...g.suggestions, s] } : g
                  ),
                }
              : y
          ),
        }));
      },

      addSuggestionAsMeasurable: (s, goalId) => {
        const goal = get().getGoal(goalId);
        if (!goal) return;
        let m: Measurable = {
          id: newId(),
          type: s.type,
          label: s.label,
          done: false,
          current: 0,
          target: 0,
          unit: '',
          weeks: [],
        };
        if (s.type === 'number') {
          m.target = s.target ?? 1;
          m.unit = s.unit ?? '';
        } else if (s.type === 'ladder') {
          m.target = s.ladderEnd ?? 1;
          m.unit = s.unit ?? '';
          m.weeks = buildLadderWeeks(s.ladderStart ?? 0, s.ladderEnd ?? 1, s.ladderWeeks ?? 4, goal.targetDate);
        }
        get().addMeasurable(m, goalId);
        get().removeSuggestion(s.id, goalId);
      },

      removeSuggestion: (sid, goalId) => {
        const year = get().selectedYear;
        set((s) => ({
          years: s.years.map((y) =>
            y.year === year
              ? {
                  ...y,
                  goals: y.goals.map((g) =>
                    g.id === goalId
                      ? { ...g, suggestions: g.suggestions.filter((ss) => ss.id !== sid) }
                      : g
                  ),
                }
              : y
          ),
        }));
      },

      addChatMessage: (msg, goalId) => {
        const year = get().selectedYear;
        set((s) => ({
          years: s.years.map((y) =>
            y.year === year
              ? {
                  ...y,
                  goals: y.goals.map((g) =>
                    g.id === goalId ? { ...g, chat: [...g.chat, msg] } : g
                  ),
                }
              : y
          ),
        }));
      },

      allTasks: () => {
        const yd = get().currentYearData();
        if (!yd) return [];
        const now = new Date();
        const weekEnd = new Date(now); weekEnd.setDate(weekEnd.getDate() + 7);
        const monthEnd = new Date(now); monthEnd.setMonth(monthEnd.getMonth() + 1);

        const buckets: Record<TaskGroupKey, TaskItem[]> = {
          'Overdue': [], 'This Week': [], 'This Month': [], 'Upcoming': [], 'Anytime': [],
        };

        for (const goal of yd.goals) {
          for (const m of goal.measurables) {
            if (m.type === 'check') {
              const item: TaskItem = {
                id: newId(),
                measurableId: m.id,
                goalId: goal.id,
                goalTitle: goal.title,
                goalColorIndex: goal.colorIndex,
                label: m.label,
                done: m.done,
              };
              buckets['Anytime'].push(item);
            } else if (m.type === 'ladder') {
              for (const week of m.weeks) {
                const due = new Date(week.targetDate);
                const item: TaskItem = {
                  id: newId(),
                  measurableId: m.id,
                  ladderWeekId: week.id,
                  goalId: goal.id,
                  goalTitle: goal.title,
                  goalColorIndex: goal.colorIndex,
                  label: `${fmtVal(week.value)} ${m.unit} – ${m.label}`,
                  dueDate: due,
                  done: week.done,
                };
                if (due < now) buckets['Overdue'].push(item);
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
                      return {
                        ...m,
                        weeks: m.weeks.map((w) =>
                          w.id === item.ladderWeekId ? { ...w, done: true } : w
                        ),
                      };
                    }
                    return { ...m, done: true };
                  }),
                };
              }),
            };
          }),
        }));
      },

      completeOnboarding: (year, motto, goalTitles) => {
        const goals: Goal[] = goalTitles
          .filter((t) => t.trim().length > 0)
          .map((title, i) => ({
            id: newId(),
            title,
            colorIndex: i % COLORS.length,
            reminder: { on: false, frequency: 'Daily' as const },
            chat: [],
            suggestions: [],
            measurables: [],
          }));
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
    }),
    {
      name: 'visiongo-app-data',
      storage: createJSONStorage(() => AsyncStorage),
      onRehydrateStorage: () => (state) => {
        if (state && state.years.length === 0) {
          state.years = buildSeedData();
        }
      },
    }
  )
);

function fmtVal(v: number): string {
  return v % 1 === 0 ? String(Math.round(v)) : v.toFixed(1);
}
