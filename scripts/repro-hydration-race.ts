/**
 * Standalone reproduction of the SSR-hydration data-loss race described in
 * the PR that added `skipHydration` to store/useAppStore.ts.
 *
 * It builds two minimal zustand stores against a fake async localStorage
 * (an AsyncStorage stand-in with an artificial delay, just like a real
 * browser's first localStorage read after a page navigation):
 *
 *   1. "buggy"  — persist() with default (eager) hydration, mirroring what
 *      useAppStore.ts looked like before this fix.
 *   2. "fixed"  — persist() with skipHydration: true, and rehydrate() called
 *      explicitly, mirroring app/_layout.tsx's gate after this fix.
 *
 * For both, it seeds "storage" with two goals, then — before the async
 * storage read resolves — fires a mutating action (simulating a screen's
 * effect running before real data has loaded). It then lets hydration
 * finish and inspects what ended up in storage.
 *
 * Run: NODE_PATH=/opt/node22/lib/node_modules npx tsx scripts/repro-hydration-race.ts
 */
import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';

interface Goal { id: string; title: string; }
interface State {
  goals: Goal[];
  completeSomething: () => void; // stands in for _patchGoal/completeTaskItem/etc.
}

function makeSlowStorage(seed: Record<string, string>, delayMs: number): StateStorage {
  const store = { ...seed };
  return {
    getItem: async (name) => {
      await new Promise((r) => setTimeout(r, delayMs));
      return store[name] ?? null;
    },
    setItem: async (name, value) => { store[name] = value; },
    removeItem: async (name) => { delete store[name]; },
    // expose for inspection
    __store: store,
  } as StateStorage & { __store: Record<string, string> };
}

const SEED = JSON.stringify({
  state: { goals: [{ id: 'g1', title: 'Move every day' }, { id: 'g2', title: 'Read more' }] },
  version: 0,
});

async function runBuggy() {
  const storage = makeSlowStorage({ 'race-buggy': SEED }, 50) as any;
  const useStore = create<State>()(
    persist(
      (set, get) => ({
        goals: [],
        // Mirrors _patchGoal: reads current in-memory state and writes it
        // straight back through `set`, which persist immediately persists.
        completeSomething: () => set({ goals: [...get().goals] }),
      }),
      { name: 'race-buggy', storage: createJSONStorage(() => storage) },
    ),
  );
  // Default persist() calls rehydrate() synchronously on store creation —
  // it's already in flight here. A screen mounted on the very first client
  // render (no gate) can still fire an action before it resolves.
  useStore.getState().completeSomething();
  await new Promise((r) => setTimeout(r, 150)); // let rehydration settle
  return JSON.parse(storage.__store['race-buggy']).state.goals;
}

async function runFixed() {
  const storage = makeSlowStorage({ 'race-fixed': SEED }, 50) as any;
  const useStore = create<State>()(
    persist(
      (set, get) => ({
        goals: [],
        completeSomething: () => set({ goals: [...get().goals] }),
      }),
      { name: 'race-fixed', storage: createJSONStorage(() => storage), skipHydration: true },
    ),
  );
  // The fix: nothing is allowed to call completeSomething() until this
  // resolves — app/_layout.tsx enforces that by not mounting the route tree
  // (and therefore no screen effects) before rehydrate() finishes.
  await useStore.persist.rehydrate();
  useStore.getState().completeSomething();
  await new Promise((r) => setTimeout(r, 20));
  return JSON.parse(storage.__store['race-fixed']).state.goals;
}

async function main() {
  const buggyResult = await runBuggy();
  const fixedResult = await runFixed();

  console.log('--- buggy (eager hydration, unguarded action) ---');
  console.log('goals left in storage:', buggyResult.map((g: Goal) => g.title));
  console.log(buggyResult.length === 0
    ? 'DATA LOSS REPRODUCED: both goals wiped by a write that raced ahead of rehydration.'
    : 'unexpected: no data loss (timing did not line up this run)');

  console.log('\n--- fixed (skipHydration + explicit await rehydrate()) ---');
  console.log('goals left in storage:', fixedResult.map((g: Goal) => g.title));
  console.log(fixedResult.length === 2
    ? 'FIX HOLDS: both goals survived because the action could not run until rehydration finished.'
    : 'FIX FAILED: goals were lost even with skipHydration.');

  if (buggyResult.length !== 0 || fixedResult.length !== 2) {
    process.exitCode = 1;
  }
}

main();
