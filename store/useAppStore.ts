import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  YearData, Goal, Measurable, ChatMessage,
  CoachAction, PendingAction,
  Milestone, Commitment, StepSchedule, Reminder,
  BoardLayout, BoardViewMode,
  newId, newMeasurable, newMilestone, newCommitment, buildLadderWeeks,
  resolveMeasurable, resolveMilestone, periodKey, milestoneStep, snapToStep,
  DEFAULT_SCHEDULE, currentBuildUpWeek, isStepDoneThisPeriod, currentStepPeriodDueDate,
  formatNumber, isCompleted,
} from './models';
import { GOAL_NOTE_COLORS as COLORS } from '../theme/themes';

export const COACH_DAILY_LIMIT = 20;

// Bumped whenever the persisted shape changes — see migrateState below.
// v3: Goal.minorGoals -> Goal.milestones, and the matching CoachAction kind/
// field renames (addMinorGoal -> addMilestone, minorGoalId -> milestoneId,
// etc.) from the "Minor Goal" -> "Milestone" rename.
// v4: CoachAction kind addAccountableStep -> addCommitment, from the
// "Accountable Step" -> "Commitment" rename.
const STORE_VERSION = 4;

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

  // Milestones — the layer between a goal and its commitments.
  addMilestone: (mg: Milestone, goalId: string) => void;
  updateMilestone: (mg: Milestone, goalId: string) => void;
  deleteMilestone: (mgId: string, goalId: string) => void;

  // Commitments — one recurring commitment each, under a milestone.
  addCommitment: (step: Commitment, mgId: string, goalId: string) => void;
  updateCommitment: (step: Commitment, mgId: string, goalId: string) => void;
  deleteCommitment: (stepId: string, mgId: string, goalId: string) => void;
  setStepSchedule: (schedule: StepSchedule, stepId: string, mgId: string, goalId: string) => void;
  // Confirms (or un-confirms) this period's commitment; numeric milestones
  // also advance by the step's amount. For a build-up step, toggles the
  // current (earliest not-yet-due) build-up week rather than a period key.
  toggleStepCheckIn: (stepId: string, mgId: string, goalId: string) => void;
  // Toggles one specific week of a progressive-build-up step — any week, not
  // just the current one, matching ladder-measurable week toggling.
  toggleRampWeek: (stepId: string, weekId: string, mgId: string, goalId: string) => void;

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

  // Marks a goal's board completion-flight animation as played (see
  // Goal.completionCelebrated) — called once the pop/confetti/fly finishes.
  markGoalCelebrated: (goalId: string) => void;
}

export interface TaskItem {
  id: string;
  goalId: string;
  goalTitle: string;
  goalColorIndex: number;
  label: string;
  dueDate?: Date;
  done: boolean;
  // Measurable-based task (check, or one ladder week).
  measurableId?: string;
  ladderWeekId?: string;
  // Commitment task (from a Milestone) — either a flat step's current
  // period, or one week of a progressive build-up.
  milestoneId?: string;
  stepId?: string;
  rampWeekId?: string;
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
          chat: [], pendingActions: [], measurables: [], milestones: [],
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

      addMilestone: (mg, goalId) => {
        get()._patchGoal(goalId, (g) => ({ ...g, milestones: [...(g.milestones ?? []), mg] }));
      },

      updateMilestone: (mg, goalId) => {
        get()._patchGoal(goalId, (g) => ({
          ...g,
          milestones: (g.milestones ?? []).map((m) => (m.id === mg.id ? mg : m)),
        }));
      },

      deleteMilestone: (mgId, goalId) => {
        get()._patchGoal(goalId, (g) => ({
          ...g,
          milestones: (g.milestones ?? []).filter((m) => m.id !== mgId),
        }));
      },

      addCommitment: (step, mgId, goalId) => {
        get()._patchGoal(goalId, (g) => patchMilestone(g, mgId, (mg) => ({
          ...mg, steps: [...mg.steps, step],
        })));
      },

      updateCommitment: (step, mgId, goalId) => {
        get()._patchGoal(goalId, (g) => patchMilestone(g, mgId, (mg) => ({
          ...mg, steps: mg.steps.map((s) => (s.id === step.id ? step : s)),
        })));
      },

      deleteCommitment: (stepId, mgId, goalId) => {
        get()._patchGoal(goalId, (g) => patchMilestone(g, mgId, (mg) => ({
          ...mg, steps: mg.steps.filter((s) => s.id !== stepId),
        })));
      },

      setStepSchedule: (schedule, stepId, mgId, goalId) => {
        get()._patchGoal(goalId, (g) => patchMilestone(g, mgId, (mg) => ({
          ...mg,
          steps: mg.steps.map((s) => (s.id === stepId ? { ...s, schedule } : s)),
        })));
      },

      toggleStepCheckIn: (stepId, mgId, goalId) => {
        get()._patchGoal(goalId, (g) => patchMilestone(g, mgId, (mg) => {
          const step = mg.steps.find((s) => s.id === stepId);
          if (!step) return mg;

          // A build-up tracks completion per week (like a ladder measurable),
          // not via a period key — toggle whichever week is currently active.
          if (step.ramp) {
            const week = currentBuildUpWeek(step);
            if (!week) return mg;
            return {
              ...mg,
              steps: mg.steps.map((s) => (s.id === stepId
                ? { ...s, ramp: s.ramp!.map((w) => (w.id === week.id ? { ...w, done: !w.done } : w)) }
                : s)),
            };
          }

          const key = periodKey(step);
          const wasDone = step.completions.includes(key);
          const completions = wasDone
            ? step.completions.filter((k) => k !== key)
            : [...step.completions, key];
          // A numeric milestone moves by the step's own amount, so checking off
          // "Save $830 per month" adds exactly $830 — deliberately NOT snapped
          // to the +/- grid, which would silently inflate the commitment.
          let current = mg.current;
          if (mg.kind === 'numeric' && step.amount) {
            const delta = wasDone ? -step.amount : step.amount;
            const next = Math.round(((current ?? 0) + delta) * 1000) / 1000;
            current = Math.min(Math.max(next, 0), Math.max(mg.target ?? 0, 0));
          }
          return {
            ...mg,
            current,
            steps: mg.steps.map((s) => (s.id === stepId ? { ...s, completions } : s)),
          };
        }));
      },

      toggleRampWeek: (stepId, weekId, mgId, goalId) => {
        get()._patchGoal(goalId, (g) => patchMilestone(g, mgId, (mg) => ({
          ...mg,
          steps: mg.steps.map((s) => (s.id === stepId && s.ramp
            ? { ...s, ramp: s.ramp.map((w) => (w.id === weekId ? { ...w, done: !w.done } : w)) }
            : s)),
        })));
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
                  label: `${formatNumber(week.value)} ${m.unit} – ${m.label}`,
                  dueDate: due, done: week.done,
                };
                if (due < todayStart) buckets['Overdue'].push(item);
                else if (due <= weekEnd) buckets['This Week'].push(item);
                else if (due <= monthEnd) buckets['This Month'].push(item);
                else buckets['Upcoming'].push(item);
              }
            }
          }

          // Commitments — same due-date buckets as measurable tasks,
          // so a "Save $830 per month" or "Run 40 km this week" commitment
          // shows up right alongside ladder/check tasks instead of only
          // living on the goal's own screen.
          for (const mg of goal.milestones ?? []) {
            for (const step of mg.steps) {
              if (step.ramp) {
                for (const week of step.ramp) {
                  if (week.done) continue;
                  const due = localDate(week.targetDate);
                  const item: TaskItem = {
                    id: `task-step-${step.id}-${week.id}`, milestoneId: mg.id, stepId: step.id, rampWeekId: week.id,
                    goalId: goal.id, goalTitle: goal.title, goalColorIndex: goal.colorIndex,
                    label: `${formatNumber(week.value)} ${step.unit ?? ''} – ${step.label}`.trim(),
                    dueDate: due, done: false,
                  };
                  if (due < todayStart) buckets['Overdue'].push(item);
                  else if (due <= weekEnd) buckets['This Week'].push(item);
                  else if (due <= monthEnd) buckets['This Month'].push(item);
                  else buckets['Upcoming'].push(item);
                }
              } else if (!isStepDoneThisPeriod(step, now)) {
                const due = currentStepPeriodDueDate(step, now);
                const item: TaskItem = {
                  id: `task-step-${step.id}`, milestoneId: mg.id, stepId: step.id,
                  goalId: goal.id, goalTitle: goal.title, goalColorIndex: goal.colorIndex,
                  label: step.amount != null
                    ? `${formatNumber(step.amount)} ${step.unit ?? ''} – ${step.label}`.trim()
                    : step.label,
                  dueDate: due, done: false,
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
        // A Commitment task — delegate to the same actions the goal
        // screen uses, so the numeric-milestone current-value bump and
        // build-up/period bookkeeping stay in exactly one place. These toggle
        // done<->not-done, but the Tasks UI only ever calls completeTaskItem
        // on an item it knows is not yet done, so a toggle here always lands
        // on "done" — never flips a genuinely-done item back off.
        if (item.stepId && item.milestoneId) {
          if (item.rampWeekId) {
            get().toggleRampWeek(item.stepId, item.rampWeekId, item.milestoneId, item.goalId);
          } else {
            get().toggleStepCheckIn(item.stepId, item.milestoneId, item.goalId);
          }
          return;
        }

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

      markGoalCelebrated: (goalId) => {
        set((s) => ({
          years: s.years.map((y) => ({
            ...y,
            goals: y.goals.map((g) => (g.id === goalId ? { ...g, completionCelebrated: true } : g)),
          })),
        }));
      },
    }),
    {
      name: 'visiongo-app-data',
      storage: createJSONStorage(() => AsyncStorage),
      version: STORE_VERSION,
      migrate: migrateState,
      merge: mergeState,
      // Persist would otherwise call rehydrate() itself the instant this
      // module loads, racing against whatever else renders on that same
      // tick. Under SSR (EXPO_WEB_OUTPUT=server) the server always builds
      // this store fresh — no localStorage there — so the very first client
      // render starts from the same empty defaults too, matching the SSR
      // markup exactly. If ANY store-mutating action fires (from a mounted
      // screen's effect, a stray tap, etc.) before the async AsyncStorage
      // read resolves, `persist` would happily write that still-default
      // state straight over the real data already on disk — silent data
      // loss with no error. skipHydration hands control of *when*
      // rehydrate() runs to app/_layout.tsx, which holds the entire route
      // tree unmounted (rendering nothing that could dispatch an action)
      // until rehydration has actually finished. See scripts/repro-hydration-race.ts
      // for a standalone reproduction of the race this prevents.
      skipHydration: true,
      onRehydrateStorage: () => (_state, error) => {
        if (error) {
          console.warn('[VisionGo] Failed to restore saved data:', error);
        }
      },
    }
  )
);

// ── Completion-flag watcher ─────────────────────────────────────
//
// Marks Goal.completionCelebrated = false the moment a goal's own
// isCompleted() flips from false to true, and clears it back to unset the
// moment isCompleted() goes false again (so a later re-completion — e.g.
// after deleting and re-adding a measurable — celebrates again). This lives
// here, once, instead of inside every mutation path that could touch a
// measurable or milestone (updateMeasurable, deleteMeasurable, _patchGoal,
// applyCoachAction, direct updateGoal calls…) — subscribing to the store
// sees every one of those regardless of which action fired.
//
// `seen` starts empty, not populated from the persisted snapshot, so goals
// that are ALREADY complete the first time this runs (app boot, or a fresh
// mount after navigating) are never treated as "just transitioned" — only a
// transition observed live, within this store's lifetime, owes a
// celebration. That's what keeps a goal completed before this feature
// existed (or completed in a previous session) from replaying the board
// animation the next time the app loads.
const seenCompletion = new Map<string, boolean>();
useAppStore.subscribe((state) => {
  const patches = new Map<string, boolean | undefined>();
  state.years.forEach((y) => y.goals.forEach((g) => {
    const nowDone = isCompleted(g);
    const wasDone = seenCompletion.get(g.id);
    if (nowDone && wasDone === false && g.completionCelebrated !== false) {
      patches.set(g.id, false);
    } else if (!nowDone && g.completionCelebrated !== undefined) {
      patches.set(g.id, undefined);
    }
    seenCompletion.set(g.id, nowDone);
  }));
  if (patches.size === 0) return;
  useAppStore.setState((s) => ({
    years: s.years.map((y) => ({
      ...y,
      goals: y.goals.map((g) => (patches.has(g.id) ? { ...g, completionCelebrated: patches.get(g.id) } : g)),
    })),
  }));
});

// ── Coach action reducer ──────────────────────────────────────
//
// Pure: takes a goal and one confirmed coach action, returns the updated goal.
// Anything that cannot be resolved (an edit to a step the user already deleted)
// is a no-op rather than an error — the action has already left the queue.

function patchMilestone(goal: Goal, mgId: string, fn: (mg: Milestone) => Milestone): Goal {
  return {
    ...goal,
    milestones: (goal.milestones ?? []).map((mg) => (mg.id === mgId ? fn(mg) : mg)),
  };
}

function applyCoachAction(goal: Goal, a: CoachAction): Goal {
  if (a.kind === 'addMilestone') {
    const title = (a.label ?? '').trim();
    if (!title) return goal;
    const mg = newMilestone({
      title,
      kind: a.milestoneKind ?? (a.target != null ? 'numeric' : 'effort'),
      target: a.target,
      current: a.target != null ? 0 : undefined,
      unit: a.unit,
      step: a.step && a.step > 0 ? a.step : undefined,
      // Fall back to the parent goal's date so a breakdown can still be sized.
      deadline: a.deadline ?? goal.targetDate,
      // Only an inherited (not coach-specified) deadline should ever be
      // flagged outdated later — the coach naming its own date is deliberate.
      sizedForGoalDate: a.deadline == null ? goal.targetDate : undefined,
    });
    return { ...goal, milestones: [...(goal.milestones ?? []), mg] };
  }

  if (a.kind === 'addCommitment') {
    const label = (a.label ?? '').trim();
    if (!label) return goal;
    // Attach to the named milestone, or the only one if the coach did not say.
    const list = goal.milestones ?? [];
    const target = resolveMilestone(a, goal) ?? (list.length === 1 ? list[0] : undefined);
    if (!target) return goal;
    const step = newCommitment({
      label,
      cadence: a.cadence ?? 'weekly',
      intervalDays: a.intervalDays,
      amount: a.amount ?? a.target,
      unit: a.unit ?? target.unit,
      // Proposed steps arrive with reminders off — scheduling a push is the
      // user's call, made from the goal screen.
      schedule: { ...DEFAULT_SCHEDULE, on: false },
    });
    return patchMilestone(goal, target.id, (mg) => ({ ...mg, steps: [...mg.steps, step] }));
  }

  if (a.kind === 'removeMilestone') {
    const target = resolveMilestone(a, goal);
    if (!target) return goal;
    return {
      ...goal,
      milestones: (goal.milestones ?? []).filter((mg) => mg.id !== target.id),
    };
  }

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
      m.sizedForGoalDate = goal.targetDate;
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
    patched.sizedForGoalDate = goal.targetDate;
  }
  return {
    ...goal,
    measurables: goal.measurables.map((m) => (m.id === existing.id ? patched : m)),
  };
}

// ── Persist migration ─────────────────────────────────────────
//
// v1: measurables gained a per-measurable `step`, and coach `suggestions`
// became `pendingActions`. v2: goals gained `milestones`, each with its own
// accountable steps. Saved data predating any of these must be backfilled or
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
type LegacyMilestone = Omit<Milestone, 'steps' | 'done'> & {
  done?: boolean;
  steps?: (Omit<Commitment, 'completions' | 'schedule' | 'createdAt'> & {
    completions?: string[];
    schedule?: Partial<StepSchedule>;
    createdAt?: string;
  })[];
};
// v2-and-earlier field/action names, from before the "Minor Goal" ->
// "Milestone" rename, and v3-and-earlier action names from before
// "Accountable Step" -> "Commitment" — still readable so nobody's existing
// saved goals silently lose their data on these upgrades.
type LegacyCoachActionKind = 'addMinorGoal' | 'removeMinorGoal' | 'addAccountableStep';
type LegacyCoachAction = Omit<CoachAction, 'kind'> & {
  kind: CoachAction['kind'] | LegacyCoachActionKind;
  minorGoalKind?: Milestone['kind'];
  minorGoalId?: string;
  minorGoalLabel?: string;
};
type LegacyPendingAction = Omit<PendingAction, 'action'> & { action: LegacyCoachAction };
type LegacyGoal = Omit<Goal, 'pendingActions' | 'measurables' | 'milestones'> & {
  pendingActions?: LegacyPendingAction[];
  measurables?: LegacyMeasurable[];
  milestones?: LegacyMilestone[];
  minorGoals?: LegacyMilestone[];
  suggestions?: LegacySuggestion[];
};
type LegacyState = Omit<AppState, 'years'> & { years?: (Omit<YearData, 'goals'> & { goals: LegacyGoal[] })[] };

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

// Idempotent: safe to run on already-migrated data.
function normalizeYears(years: LegacyState['years']): YearData[] {
  return (years ?? []).map((y) => ({
    ...y,
    goals: (y.goals ?? []).map(({ suggestions, minorGoals, ...g }): Goal => ({
      ...g,
      // Goals persisted before the reminder feature existed have no
      // `reminder` key at all — every screen that reads goal.reminder.on
      // (Settings, the milestones screen, notificationService) assumes it's
      // always present, so backfill it here rather than scattering `?.`
      // guards across every read site.
      reminder: g.reminder ?? ({ on: false, frequency: 'Daily' } as Reminder),
      measurables: (g.measurables ?? []).map((m) => ({
        ...m,
        step: typeof m.step === 'number' && m.step > 0 ? m.step : 1,
      })),
      pendingActions: g.pendingActions
        ? g.pendingActions.map(migratePendingAction)
        : (suggestions ?? []).map(legacySuggestionToPending),
      // v2: goals saved before milestones existed have no array at all, and a
      // step persisted mid-upgrade may be missing its schedule or history.
      // v3: the array itself moved from `minorGoals` to `milestones` — read
      // the old key as a fallback and drop it from the destructured `g` above
      // so the stale duplicate doesn't linger in the re-saved blob.
      milestones: (g.milestones ?? minorGoals ?? []).map((mg) => ({
        ...mg,
        done: mg.done ?? false,
        steps: (mg.steps ?? []).map((s) => ({
          ...s,
          completions: s.completions ?? [],
          createdAt: s.createdAt ?? new Date().toISOString(),
          schedule: { ...DEFAULT_SCHEDULE, ...(s.schedule ?? {}) },
        })),
      })),
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

