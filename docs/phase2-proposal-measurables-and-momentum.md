# Phase 2 proposal: "Measurables" naming/nesting (H) and zero-momentum first impression (I)

Proposal only — no code changes in this file's companion PR. Written for review before any implementation.

## H. "Measurables" terminology and the peer-tab problem

### The actual problem
The Milestone/Measurable split is sound — separating "Open a savings account" (binary) from "Amount saved: 0/5,000" (quantified) is a real improvement over a flat checkbox-or-number list. What's failing is presentation, not the model:

1. "Measurables" isn't a word people reach for describing their own goals.
2. Nothing in the UI teaches the distinction — both screens would need a tooltip + ~25-word explainer just to become legible, which is itself the symptom: the interface isn't self-explanatory.
3. The canvas shows Measurables and Milestones as two equal-weight tabs, but in the data model a Measurable is a *child* of a Milestone (`parentId`). Peer tabs imply peer concepts; the model says otherwise.
4. The seeded/template goal has a Measurable named "Amount saved" nested under a Milestone also named "Amount saved" — which reads as circular ("amount saved... of amount saved?") to anyone encountering it cold.

### Option A (recommended, and the one you asked to be considered seriously): fold measurement into the milestone
Drop the parallel "Measurables" tab entirely. Each Milestone becomes the single unit a user creates and sees, and it optionally carries **how it's tracked**: a checkbox (binary), or "how will you measure this?" — a quantity, a ladder, or a commitment. The nesting that already exists in the model becomes visible instead of requiring an explainer, because there's no longer a second peer-level concept competing for attention.

**Naming:** "Milestone" stays as the only user-facing noun for the top-level item. The measurement sub-object doesn't need its own noun in the UI at all — it's a property of the milestone, surfaced inline ("Track by: number / checklist / weekly check-ins") rather than a second thing to name and teach.

**Navigation:** the canvas's Measurables/Milestones `SegmentedControl` goes away. In its place, the canvas shows Milestone bubbles only (as it already effectively treats top-level items today — `goal.items.filter(it => it.parentId == null)`), and tapping one opens a single drill-in sheet that shows the checkbox/number/ladder/commitment editor inline, exactly like `MilestoneDrillInSheet` does today for a Milestone with a single child Measurable. A Milestone with *multiple* children (rare today, but the model allows it) would need its own resolved UI — either the drill-in sheet lists them as sub-rows, or multi-metric milestones are deliberately scoped out of this simplification and kept on a secondary "advanced" path. That's a real design decision Phase 2 code would need to settle, not this proposal.

**What it means for existing users' data:** nothing in `store/models.ts` needs to change. The Milestone→Measurable parent/child shape already matches this UI; only the two-peer-tab presentation is wrong. A goal seeded today (e.g. the "Amount saved" under "Amount saved" case) would just stop showing the confusing nested label — the milestone shows as "Amount saved" once, with its number-tracking UI inline underneath, instead of the same string appearing twice across two tabs. No migration required; this is a rendering change on data that's already shaped correctly. (Multi-child milestones, if any exist among current users, are the one case that needs an explicit read before implementation — worth a quick data audit, not a schema migration.)

### Option B: keep two tabs, but relabel and re-hierarchize visually
Rename "Measurables" to something like "Tracking" or "Progress," and visually nest the tab's content under whichever Milestone is selected (e.g. a dropdown or breadcrumb: "Milestone: Amount saved > Tracking") instead of two independent top-level tabs. Cheaper to build than Option A, but doesn't remove the core problem — there's still a second noun to learn, just a less confusing one.

### Option C: leave the tabs, add the tooltip explainer as originally scoped
Minimal effort, but this is explicitly the outcome your own framing pushes back on ("that means the UI isn't teaching it on its own") — a tooltip is a patch on a structural mismatch, not a fix for it. Listed for completeness, not recommended.

**Recommendation:** Option A. It's the only one that removes the taught concept instead of better-teaching it, and the data model already supports it without a migration — the cost is concentrated entirely in canvas/drill-in UI work, not data risk.

---

## I. Nothing but zeros on first open

### The problem
Board reads 0%, the year ring reads 0%, every goal reads 0%. There's no sense of "you did something" anywhere — no streak, no "last updated," no recent activity — so a genuinely early-stage user (which is everyone, on day one) sees an app that looks broken or abandoned rather than one that's just getting started.

### Constraint
No fake numbers. Whatever ships has to be true — either literally true progress, or an honest signal like "you started this."

### Lightweight ideas (not mutually exclusive)

1. **"Just started" state instead of "0%."** When a goal/milestone has zero progress AND was created recently (e.g. within the last 3 days), swap the "0%" label for something like "Just started" or a small "NEW" badge, with the ring rendering as an outline/dashed track rather than an empty filled one. This is the cheapest change and directly addresses "a wall of zeros looks broken" without inventing any number — it's just a different truthful rendering of the same state.

2. **Last-updated timestamp, surfaced only once it exists.** The moment a user ticks anything — a checkbox, a number, a commitment check-in — stamp `updatedAt` on that item (doesn't need to exist today; check `store/models.ts` for whether any such field already exists before assuming it needs adding). Show "updated 2 hours ago" / "updated today" on the goal bubble or milestone row once that timestamp exists, nothing before. No number is invented; it just becomes visible the first time it's true.

3. **Momentum instead of a percentage, when percentage is uninformative.** At 0%, replace "0%" with a small activity indicator: how many milestones exist, e.g. "3 milestones set" — a true, non-zero-looking fact about a goal that otherwise reads as literally empty. This reframes "no progress yet" as "you've set something up," which is itself real signal.

4. **Streak, but only counted from real check-ins.** If commitments (recurring actions with a schedule) already log completions, a simple current-streak count ("3-day streak") is legitimate and requires no new fabricated data — it's a derived count over existing check-in history. Only worth proposing if that history already exists somewhere retrievable; needs a quick check against `Commitment`'s shape in `store/models.ts` before committing to this as buildable, since it may need a new log array rather than just a derived count.

5. **Recent activity feed, minimal.** A short "You added 'Run a half marathon' · 2 min ago" style line under a freshly created goal, sourced from the same creation timestamp Option 2 needs. Cheap once `createdAt`/`updatedAt` exist, and gives the empty board something concrete and true to say instead of silence.

**Recommendation for a first pass:** (1) + (2) together — swap "0%" for "Just started" using existing creation data (no new fields needed if a `createdAt` already exists; needs a quick model check), and start stamping `updatedAt` on ticks/edits so "last updated" can start appearing truthfully as soon as it's non-null. Both are additive, low-risk, and directly answer "why does this look dead" without any fabricated number. Streak (4) and recent-activity (5) are good second-pass additions once the underlying timestamp/log data is confirmed to exist or has been added.
