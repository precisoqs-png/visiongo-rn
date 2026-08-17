import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  YearData, Goal, TrackableItem, ChatMessage,
  CoachAction, PendingAction,
  Commitment, StepSchedule,
  BoardLayout, BoardViewMode,
  newId, newMeasurable, newMilestone, newCommitment, buildLadderWeeks,
  resolveMeasurable, resolveMilestone, periodKey,
  DEFAULT_SCHEDULE, currentBuildUpWeek, isStepDoneThisPeriod, currentStepPeriodDueDate,
  formatNumber, isCompleted, removeItemCascade,
  steppedValue, numberItemPeriodKey, numberItemPeriodDueDate, isNumberItemDoneThisPeriod,
} from './models';
import { normalizeYears, LegacyYears, ITEMS_SCHEMA_VERSION } from './migration';
import { GOAL_NOTE_COLORS as COLORS } from '../theme/themes';

export const COACH_DAILY_LIMIT = 20;

// Bumped whenever the persisted shape changes — see migrateState below.
// v3: Goal.minorGoals -> Goal.milestones, and the matching CoachAction kind/
// field renames (addMinorGoal -> addMilestone, minorGoalId -> milestoneId,
// etc.) from the "Minor Goal" -> "Milestone" rename.
// v4: CoachAction kind addAccountableStep -> addCommitment, from the
// "Accountable Step" -> "Commitment" rename.
// v5: Goal.measurables + Goal.milestones (each with `steps: Commitment[]`)
// merged into one Goal.items: TrackableItem[] array — a measurable becomes a
// plain item, a milestone becomes an item with `milestone: true` and its
// `steps` renamed to `commitments`. See normalizeYears.
// v6: Milestones/Measurables model INVERTS — a top-level Milestone becomes a
// pure binary win, the quantified thing becomes a child Measurable with
// `parentId`. See migration.ts's invertItemsForGoal / ITEMS_SCHEMA_VERSION.
const STORE_VERSION = 6;

// Best-effort raw copy of a persisted blob to AsyncStorage, taken right
// before the v6 invert migration runs on it for the first time — a safety
// net so a data-shape bug in the migration doesn't lose anyone's goals
// silently. Fire-and-forget (never awaited, errors swallowed) so it can
// never block or deadlock the synchronous `merge` path zustand calls this
// from. Only fires when some goal actually lacks the itemsSchema marker
// (i.e. the invert is genuinely about to run on this blob) — not on every
// rehydrate forever.
const PRE_V6_BACKUP_KEY = 'visiongo-app-data.pre-v6-backup';
function backupBeforeV6Invert(state: { years?: LegacyYears }): void {
  try {
    const years = state.years ?? [];
    const needsInvert = years.some((y) =>
      (y.goals ?? []).some((g) => (g as { itemsSchema?: number }).itemsSchema !== ITEMS_SCHEMA_VERSION));
    if (!needsInvert) return;
    // Defensive, in addition to the needsInvert gate above: this backup must
    // be taken exactly once per device, ever — the first pre-invert state,
    // never a later (already-migrated, or worse re-re-inverted) one. Before
    // this repo's bug 1 fix, a freshly-created goal was missing itemsSchema
    // and made needsInvert a false positive on nearly every rehydrate, which
    // kept clobbering the one genuine backup with post-migration data. That
    // false positive is now fixed at the source, but this existence check
    // stays as a second line of defense against any future gap in the same
    // gate re-triggering the same clobber.
    void AsyncStorage.getItem(PRE_V6_BACKUP_KEY).then((existing) => {
      if (existing != null) return;
      return AsyncStorage.setItem(PRE_V6_BACKUP_KEY, JSON.stringify(state));
    }).catch(() => {});
  } catch {
    // Never let a backup attempt block or throw into the migrate/merge path.
  }
}

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

  // Plain (non-milestone) items — check/number/ladder.
  addMeasurable: (m: TrackableItem, goalId: string) => void;
  updateMeasurable: (m: TrackableItem, goalId: string) => void;
  deleteMeasurable: (mid: string, goalId: string) => void;

  // Milestone-flagged items — the layer that can carry commitments.
  addMilestone: (mg: TrackableItem, goalId: string) => void;
  updateMilestone: (mg: TrackableItem, goalId: string) => void;
  deleteMilestone: (mgId: string, goalId: string) => void;

  // Commitments — one recurring commitment each, under a milestone item.
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
  // Replace-only restore from an exported backup JSON (Settings > Backup).
  // Runs the incoming years through the same normalizeYears backfilling as
  // any other persisted blob before swapping it in.
  importBackup: (data: { years: YearData[]; selectedYear?: number; hasCompletedOnboarding?: boolean }) => void;

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
  // Commitment task (from a milestone-flagged item) — either a flat step's
  // current period, or one week of a progressive build-up.
  milestoneId?: string;
  stepId?: string;
  rampWeekId?: string;
  // A number-measurable task — tapping it increments `current` by the
  // item's own step rather than setting a `done` flag (see completeTaskItem).
  // With no reminder cadence this is a persistent Anytime row that stays
  // in the list, showing its own progress, until current reaches target.
  // With a cadence set, `periodKey` names the period this instance is for
  // (see numberItemPeriodKey in store/models.ts) and it behaves like any
  // other dated task once ticked.
  numberTask?: boolean;
  periodKey?: string;
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
        // Stamped with the current itemsSchema so this goal is never re-run
        // through invertItemsForGoal on the next rehydrate — a fresh goal
        // has no legacy shape to invert, and mistakenly re-inverting it
        // would demote its Milestone into a synthesized parent's child and
        // sever a Measurable's parentId (see the bug this guards against in
        // store/migration.ts's ITEMS_SCHEMA_VERSION comment).
        const goal: Goal = {
          id: newId(), title, colorIndex,
          reminder: { on: false, frequency: 'Daily' },
          chat: [], pendingActions: [], items: [],
          itemsSchema: ITEMS_SCHEMA_VERSION,
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
        // Stamped here too (not just relied on from the caller) — same
        // reasoning as addGoal above: a goal entering the store for the
        // first time must never look re-migratable.
        const stamped: Goal = { ...goal, itemsSchema: ITEMS_SCHEMA_VERSION };
        set((s) => ({
          years: s.years.map((y) =>
            y.year === year ? { ...y, goals: [...y.goals, stamped] } : y
          ),
        }));
        return stamped.id;
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
        get()._patchGoal(goalId, (g) => ({ ...g, items: [...g.items, m] }));
      },

      updateMeasurable: (m, goalId) => {
        get()._patchGoal(goalId, (g) => ({
          ...g, items: g.items.map((it) => it.id === m.id ? m : it),
        }));
      },

      deleteMeasurable: (mid, goalId) => {
        // Cascades: deleting a top-level Milestone from the Milestones tab
        // goes through this same action, and must also drop any child
        // Measurable pointing at it — see removeItemCascade's comment.
        get()._patchGoal(goalId, (g) => ({
          ...g, items: removeItemCascade(g.items, mid),
        }));
      },

      addMilestone: (mg, goalId) => {
        get()._patchGoal(goalId, (g) => ({ ...g, items: [...g.items, { ...mg, milestone: true }] }));
      },

      updateMilestone: (mg, goalId) => {
        get()._patchGoal(goalId, (g) => ({
          ...g,
          items: g.items.map((it) => (it.id === mg.id ? { ...mg, milestone: true } : it)),
        }));
      },

      deleteMilestone: (mgId, goalId) => {
        // Same cascade as deleteMeasurable — see removeItemCascade's comment.
        get()._patchGoal(goalId, (g) => ({
          ...g,
          items: removeItemCascade(g.items, mgId),
        }));
      },

      addCommitment: (step, mgId, goalId) => {
        get()._patchGoal(goalId, (g) => patchMilestone(g, mgId, (mg) => ({
          ...mg, commitments: [...mg.commitments, step],
        })));
      },

      updateCommitment: (step, mgId, goalId) => {
        get()._patchGoal(goalId, (g) => patchMilestone(g, mgId, (mg) => ({
          ...mg, commitments: mg.commitments.map((s) => (s.id === step.id ? step : s)),
        })));
      },

      deleteCommitment: (stepId, mgId, goalId) => {
        get()._patchGoal(goalId, (g) => patchMilestone(g, mgId, (mg) => ({
          ...mg, commitments: mg.commitments.filter((s) => s.id !== stepId),
        })));
      },

      setStepSchedule: (schedule, stepId, mgId, goalId) => {
        get()._patchGoal(goalId, (g) => patchMilestone(g, mgId, (mg) => ({
          ...mg,
          commitments: mg.commitments.map((s) => (s.id === stepId ? { ...s, schedule } : s)),
        })));
      },

      toggleStepCheckIn: (stepId, mgId, goalId) => {
        get()._patchGoal(goalId, (g) => patchMilestone(g, mgId, (mg) => {
          const step = mg.commitments.find((s) => s.id === stepId);
          if (!step) return mg;

          // A build-up tracks completion per week (like a ladder measurable),
          // not via a period key — toggle whichever week is currently active.
          if (step.ramp) {
            const week = currentBuildUpWeek(step);
            if (!week) return mg;
            return {
              ...mg,
              commitments: mg.commitments.map((s) => (s.id === stepId
                ? { ...s, ramp: s.ramp!.map((w) => (w.id === week.id ? { ...w, done: !w.done } : w)) }
                : s)),
            };
          }

          const key = periodKey(step);
          const wasDone = step.completions.includes(key);
          const completions = wasDone
            ? step.completions.filter((k) => k !== key)
            : [...step.completions, key];
          // A numeric milestone item moves by the step's own amount, so
          // checking off "Save $830 per month" adds exactly $830 —
          // deliberately NOT snapped to the +/- grid, which would silently
          // inflate the commitment.
          let current = mg.current;
          if (mg.type === 'number' && step.amount) {
            const delta = wasDone ? -step.amount : step.amount;
            const next = Math.round(((current ?? 0) + delta) * 1000) / 1000;
            current = Math.min(Math.max(next, 0), Math.max(mg.target ?? 0, 0));
          }
          return {
            ...mg,
            current,
            commitments: mg.commitments.map((s) => (s.id === stepId ? { ...s, completions } : s)),
          };
        }));
      },

      toggleRampWeek: (stepId, weekId, mgId, goalId) => {
        get()._patchGoal(goalId, (g) => patchMilestone(g, mgId, (mg) => ({
          ...mg,
          commitments: mg.commitments.map((s) => (s.id === stepId && s.ramp
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
          for (const m of goal.items) {
            if (m.commitments.length === 0) {
              // A top-level Milestone with children is a pure container —
              // its own `done` is not an independent completion path (see
              // measurableFraction), so it must not also emit a checkbox
              // task: ticking it here would strike it through while
              // goalProgress and the card/bubble (which already disable
              // this same tick) never move, a dead end with no real effect.
              const hasChildren = goal.items.some((it) => it.parentId === m.id);
              // A plain check/number/ladder item — same bucketing as before.
              if (m.type === 'check' && !hasChildren) {
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
              } else if (m.type === 'number' && m.current < m.target) {
                // A plain number measurable's own daily action — the thing
                // most templates actually ask the user to do — was
                // otherwise invisible on Tasks. See numberTask handling in
                // completeTaskItem for how a tap moves `current`.
                if (m.schedule?.on && m.cadence) {
                  if (!isNumberItemDoneThisPeriod(m, now)) {
                    const due = numberItemPeriodDueDate(m, now);
                    const item: TaskItem = {
                      id: `task-${m.id}-${numberItemPeriodKey(m, now)}`,
                      measurableId: m.id, goalId: goal.id,
                      goalTitle: goal.title, goalColorIndex: goal.colorIndex,
                      label: `${formatNumber(m.current)}/${formatNumber(m.target)}${m.unit ? ` ${m.unit}` : ''} – ${m.label}`,
                      dueDate: due, done: false,
                      numberTask: true, periodKey: numberItemPeriodKey(m, now),
                    };
                    if (due < todayStart) buckets['Overdue'].push(item);
                    else if (due <= weekEnd) buckets['This Week'].push(item);
                    else if (due <= monthEnd) buckets['This Month'].push(item);
                    else buckets['Upcoming'].push(item);
                  }
                } else {
                  // No reminder — a single persistent row, grouped with
                  // every other undated task under Anytime, that stays put
                  // (updating its own progress in place) until it's done.
                  const item: TaskItem = {
                    id: `task-${m.id}`, measurableId: m.id, goalId: goal.id,
                    goalTitle: goal.title, goalColorIndex: goal.colorIndex,
                    label: `${m.label} — ${formatNumber(m.current)}/${formatNumber(m.target)}${m.unit ? ` ${m.unit}` : ''}`,
                    done: false, numberTask: true,
                  };
                  buckets['Anytime'].push(item);
                }
              }
              continue;
            }

            // An item carrying commitments — same due-date buckets as plain
            // tasks, so a "Save $830 per month" or "Run 40 km this week"
            // commitment shows up right alongside check/ladder tasks instead
            // of only living on the goal's own screen.
            for (const step of m.commitments) {
              if (step.ramp) {
                for (const week of step.ramp) {
                  if (week.done) continue;
                  const due = localDate(week.targetDate);
                  const item: TaskItem = {
                    id: `task-step-${step.id}-${week.id}`, milestoneId: m.id, stepId: step.id, rampWeekId: week.id,
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
                  id: `task-step-${step.id}`, milestoneId: m.id, stepId: step.id,
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
        // screen uses, so the numeric-item current-value bump and
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
                  items: g.items.map((m) => {
                    if (m.id !== item.measurableId) return m;
                    if (item.ladderWeekId) {
                      return { ...m, weeks: m.weeks.map((w) =>
                        w.id === item.ladderWeekId ? { ...w, done: true } : w
                      )};
                    }
                    if (item.numberTask) {
                      // Bump current by the item's own step (clamped to
                      // target by steppedValue), and — for the dated,
                      // cadence-driven flavor only — record this period as
                      // complete so it doesn't reappear until the next one.
                      return {
                        ...m,
                        current: steppedValue(m, 1),
                        ...(item.periodKey
                          ? { reminderCompletions: [...(m.reminderCompletions ?? []), item.periodKey] }
                          : {}),
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
        // Stamp itemsSchema on every incoming goal as a final safety net,
        // independent of whether the caller already did it — same reasoning
        // as addGoalFull above: a goal entering the store for the first time
        // must never look re-migratable to the next rehydrate's
        // normalizeYears pass. Every current caller (app/onboarding.tsx)
        // already stamps this itself before calling in, so this is
        // belt-and-braces, not a fix for an exploitable gap today.
        const stampedGoals = goals.map((g) => ({ ...g, itemsSchema: ITEMS_SCHEMA_VERSION }));
        const yd: YearData = { year, motto: motto || 'Dream it. Plan it. Live it.', goals: stampedGoals };
        set((s) => ({
          years: s.years.filter((y) => y.year !== year).concat(yd).sort((a, b) => a.year - b.year),
          selectedYear: year,
          hasCompletedOnboarding: true,
        }));
      },

      resetOnboarding: () => set({ hasCompletedOnboarding: false }),

      importBackup: (data) => {
        const years = normalizeYears(data.years as LegacyState['years']);
        set((s) => ({
          years,
          selectedYear:
            data.selectedYear ?? (years.find((y) => y.year === s.selectedYear) ? s.selectedYear : years[0]?.year ?? s.selectedYear),
          ...(data.hasCompletedOnboarding !== undefined
            ? { hasCompletedOnboarding: data.hasCompletedOnboarding }
            : {}),
        }));
      },

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
// after deleting and re-adding an item — celebrates again). This lives here,
// once, instead of inside every mutation path that could touch an item
// (updateMeasurable, deleteMeasurable, _patchGoal, applyCoachAction, direct
// updateGoal calls…) — subscribing to the store sees every one of those
// regardless of which action fired.
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

function patchMilestone(goal: Goal, mgId: string, fn: (mg: TrackableItem) => TrackableItem): Goal {
  return {
    ...goal,
    items: goal.items.map((it) => (it.id === mgId ? fn(it) : it)),
  };
}

function applyCoachAction(goal: Goal, a: CoachAction): Goal {
  if (a.kind === 'addMilestone') {
    const title = (a.label ?? '').trim();
    if (!title) return goal;
    // A Milestone is now a pure binary win — title + optional deadline only.
    const mg = newMilestone({
      label: title,
      deadline: a.deadline ?? goal.targetDate,
      // Only an inherited (not coach-specified) deadline should ever be
      // flagged outdated later — the coach naming its own date is deliberate.
      sizedForGoalDate: a.deadline == null ? goal.targetDate : undefined,
    });
    return { ...goal, items: [...goal.items, mg] };
  }

  if (a.kind === 'addCommitment') {
    const label = (a.label ?? '').trim();
    if (!label) return goal;
    // Commitments now live on the child Measurable, not the top-level
    // Milestone — resolve via resolveMeasurable (parentId set).
    const list = goal.items.filter((it) => it.parentId != null);
    const target = resolveMeasurable(a, goal) ?? (list.length === 1 ? list[0] : undefined);
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
    return patchMilestone(goal, target.id, (mg) => ({ ...mg, commitments: [...mg.commitments, step] }));
  }

  if (a.kind === 'removeMilestone') {
    const target = resolveMilestone(a, goal);
    if (!target) return goal;
    // Removing a Milestone removes its children too — an orphaned Measurable
    // with a dangling parentId would never resolve or render again. See
    // removeItemCascade's comment (store/models.ts) for the full rationale;
    // the user-facing delete paths in useAppStore/index.tsx use the same
    // helper for consistency.
    return {
      ...goal,
      items: removeItemCascade(goal.items, target.id),
    };
  }

  if (a.kind === 'addTask') {
    const type = a.type ?? 'check';
    const label = (a.label ?? '').trim();
    if (!label) return goal;

    if (type === 'check') {
      // A binary check is a top-level Milestone.
      const mg = newMilestone({ label, deadline: goal.targetDate, sizedForGoalDate: goal.targetDate });
      return { ...goal, items: [...goal.items, mg] };
    }

    // A quantified (number/ladder) item is a Measurable — it MUST have a
    // parent Milestone. Resolve one by name if the coach named it, or the
    // only Milestone on the goal if there's exactly one; otherwise
    // auto-create a same-titled Milestone parent rather than leaving an
    // orphan.
    const milestones = goal.items.filter((it) => it.milestone);
    let parent = resolveMilestone(a, goal) ?? (milestones.length === 1 ? milestones[0] : undefined);
    let nextItems = goal.items;
    if (!parent) {
      parent = newMilestone({ label, deadline: goal.targetDate, sizedForGoalDate: goal.targetDate });
      nextItems = [...nextItems, parent];
    }

    const m = newMeasurable({ type, label, unit: a.unit ?? '', parentId: parent.id });
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
    return { ...goal, items: [...nextItems, m] };
  }

  const existing = resolveMeasurable(a, goal);
  if (!existing) return goal;

  if (a.kind === 'removeTask') {
    // Route through removeItemCascade for consistency with every other
    // delete path (deleteMeasurable, deleteMilestone, deleteMeasurableInPlace,
    // removeMilestone above) even though it's a no-op today: resolveMeasurable
    // (used to find `existing`) currently can never resolve an item that HAS
    // children — nothing in this model gives a plain Measurable its own
    // children, so `existing` here is always childless and a plain filter by
    // id is equivalent to the cascade. Fixed anyway as defense-in-depth, so
    // this can't quietly regress into a live orphan-leaving bug if
    // resolveMeasurable's resolution logic or the model ever changes to let
    // it match an item with children.
    return { ...goal, items: removeItemCascade(goal.items, existing.id) };
  }

  const patched: TrackableItem = { ...existing };
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
    items: goal.items.map((it) => (it.id === existing.id ? patched : it)),
  };
}

// ── Persist migration ─────────────────────────────────────────
//
// The actual backfill logic (normalizeYears and everything it depends on)
// lives in ./migration — pulled out so it has no zustand/React Native
// dependency and can run standalone (see scripts/verify-unify-migration.ts).
// Re-exported here since importBackup and other call sites have always
// imported it from this module.
export { normalizeYears } from './migration';

type LegacyState = Omit<AppState, 'years'> & { years?: LegacyYears };

function migrateState(persisted: unknown, _version: number): AppState {
  const state = persisted as LegacyState;
  if (!state?.years) return state as AppState;
  backupBeforeV6Invert(state);
  return { ...state, years: normalizeYears(state.years) } as AppState;
}

// zustand only calls `migrate` when the stored blob carries a numeric version,
// so anything written without one would slip through unmigrated and crash on
// `goal.pendingActions`. Normalizing here as well closes that gap.
function mergeState(persisted: unknown, current: AppState): AppState {
  const state = persisted as LegacyState;
  if (!state?.years) return { ...current, ...(state as object) } as AppState;
  backupBeforeV6Invert(state);
  return { ...current, ...state, years: normalizeYears(state.years) } as AppState;
}
