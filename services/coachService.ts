import {
  CoachAction, Measurable, MeasurableType, measurableStep,
  Milestone, MilestoneKind, Cadence,
  milestonePercent, cadenceLabel, isStepDoneThisPeriod,
} from '../store/models';
import { getDeviceId } from './deviceId';

// ── Types ──────────────────────────────────────────

export interface CoachGoalContext {
  goalTitle: string;
  achieveByDate?: string;
  weeksRemaining?: number;
  today: Date;
  // The goal's real steps, so the coach talks about what actually exists
  // instead of inventing a plan the user cannot see.
  measurables: Measurable[];
  // The goal's milestones and their recurring commitments, so the coach can
  // build on what exists instead of duplicating it.
  milestones: Milestone[];
  // Coach replies so far — drives the "plan within ~5 messages" budget.
  exchangeCount: number;
  // The user's own "why this matters" note, if they wrote one — lets the
  // coach anchor suggestions to their actual motivation instead of guessing.
  motivation?: string;
  // 'pairing' is the one-shot reading on the Pair tab: no goal to edit, so no
  // tools and a much shorter prompt. Defaults to the goal coach.
  kind?: 'coach' | 'pairing';
}

export interface CoachMessageRaw {
  role: 'user' | 'assistant';
  text: string;
}

export interface CoachResponse {
  text: string;
  actions: CoachAction[];
}

// ── Tool definitions ───────────────────────────────────────
//
// Passed straight through to the Messages API. The coach calls these to edit
// the goal; the app queues each call and applies it once the user confirms.

export const COACH_TOOLS = [
  {
    name: 'add_step',
    description:
      'Add a new measurable step to the goal. Use type "ladder" for a step that ' +
      'builds week by week (the app expands it into dated weekly micro-steps), ' +
      '"number" for a running count towards a target, and "check" for a one-off ' +
      'action. Call once per step — several calls in one reply are fine.',
    input_schema: {
      type: 'object',
      properties: {
        label: { type: 'string', description: 'Short name of the step, e.g. "Weekly long-run build-up".' },
        type: { type: 'string', enum: ['check', 'number', 'ladder'] },
        target: { type: 'number', description: 'Target value. Required for type "number".' },
        unit: { type: 'string', description: 'Unit of the target, e.g. "km", "days", "$".' },
        step_size: {
          type: 'number',
          description:
            'How much one tap of the +/- buttons moves the counter. Default 1. ' +
            'Use a coarser size only for large targets (e.g. 50 for a $5000 target).',
        },
        ladder_start: { type: 'number', description: 'Week-1 value. Required for type "ladder".' },
        ladder_end: { type: 'number', description: 'Final-week value. Required for type "ladder".' },
        ladder_weeks: { type: 'integer', description: 'Number of weekly micro-steps. Must fit the weeks remaining.' },
      },
      required: ['label', 'type'],
    },
  },
  {
    name: 'edit_step',
    description:
      'Change an existing step on the goal — its name, target, unit or step size. ' +
      'Only include the fields you want to change.',
    input_schema: {
      type: 'object',
      properties: {
        step_label: { type: 'string', description: 'Exact label of the existing step to change.' },
        label: { type: 'string', description: 'New label, if renaming.' },
        target: { type: 'number' },
        unit: { type: 'string' },
        step_size: { type: 'number' },
      },
      required: ['step_label'],
    },
  },
  {
    name: 'remove_step',
    description:
      'Delete a step from the goal. Use when the user says a step is no longer ' +
      'relevant, or when it duplicates another step.',
    input_schema: {
      type: 'object',
      properties: {
        step_label: { type: 'string', description: 'Exact label of the existing step to remove.' },
      },
      required: ['step_label'],
    },
  },
  {
    name: 'set_target',
    description: 'Change only the target number of an existing step.',
    input_schema: {
      type: 'object',
      properties: {
        step_label: { type: 'string', description: 'Exact label of the existing step.' },
        target: { type: 'number' },
      },
      required: ['step_label', 'target'],
    },
  },
  {
    name: 'add_milestone',
    description:
      'Add a Milestone — a milestone under this goal that the user works ' +
      'towards, e.g. "Save $10,000" or "Run a marathon". Use kind "numeric" ' +
      'when there is a number to accumulate, "effort" when the work is not ' +
      'arithmetic. Follow it with add_commitment to give it a recurring ' +
      'commitment.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        kind: { type: 'string', enum: ['numeric', 'effort'] },
        target: { type: 'number', description: 'Total to reach. Numeric milestones only.' },
        unit: { type: 'string', description: 'e.g. "$", "km", "books".' },
        step_size: { type: 'number', description: 'How much one +/- tap moves the counter. Default 1.' },
        deadline: { type: 'string', description: 'ISO date (YYYY-MM-DD) the milestone is due. Defaults to the goal\'s own date.' },
      },
      required: ['title', 'kind'],
    },
  },
  {
    name: 'add_commitment',
    description:
      'Add ONE recurring commitment under a Milestone — the thing the user ' +
      'repeats and gets reminded about, e.g. "Save $1,000 per month" or ' +
      '"Run 40 km this week". Keep it to a single simple recurring target: do ' +
      'NOT lay out a multi-week training programme or a sequence of escalating ' +
      'steps. The user schedules the reminder themselves afterwards.',
    input_schema: {
      type: 'object',
      properties: {
        milestone_title: { type: 'string', description: 'Title of the Milestone this belongs to.' },
        label: { type: 'string', description: 'The commitment, e.g. "Run 40 km this week".' },
        amount: { type: 'number', description: 'Per-period amount, if it is numeric.' },
        unit: { type: 'string' },
        cadence: { type: 'string', enum: ['weekly', 'monthly', 'custom'] },
        interval_days: { type: 'integer', description: 'Days between check-ins. Cadence "custom" only.' },
      },
      required: ['milestone_title', 'label', 'cadence'],
    },
  },
  {
    name: 'remove_milestone',
    description: 'Delete a Milestone and its commitments.',
    input_schema: {
      type: 'object',
      properties: {
        milestone_title: { type: 'string' },
      },
      required: ['milestone_title'],
    },
  },
];

// ── System prompt ─────────────────────────────────────────

function describeMeasurable(m: Measurable): string {
  switch (m.type) {
    case 'check':
      return `- "${m.label}" (check) — ${m.done ? 'done' : 'not done'}`;
    case 'number':
      return `- "${m.label}" (number) — ${m.current}/${m.target} ${m.unit}, +/- moves by ${measurableStep(m)}`;
    case 'ladder': {
      const done = m.weeks.filter((w) => w.done).length;
      return `- "${m.label}" (weekly ladder) — ${done}/${m.weeks.length} weeks done, final target ${m.target} ${m.unit}`;
    }
    default:
      return `- "${m.label}"`;
  }
}

function describeMilestone(mg: Milestone): string {
  const head = mg.type === 'number'
    ? `- MILESTONE "${mg.label}" (numeric) — ${mg.current ?? 0}/${mg.target ?? 0} ${mg.unit ?? ''}, ${milestonePercent(mg)}%`
    : `- MILESTONE "${mg.label}" (effort) — ${milestonePercent(mg)}%${mg.done ? ', marked done' : ''}`;
  const due = mg.deadline
    ? `, due ${new Date(mg.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
    : '';
  const steps = mg.commitments.length
    ? mg.commitments.map((s) =>
        `    · commitment "${s.label}" — ${cadenceLabel(s)}, ${s.completions.length} check-ins` +
        `${isStepDoneThisPeriod(s) ? ', done this period' : ''}` +
        `${s.schedule.on ? ', reminder on' : ''}`).join('\n')
    : '    · (no commitments yet)';
  return `${head}${due}\n${steps}`;
}

export function buildSystemPrompt(ctx: CoachGoalContext): string {
  if (ctx.kind === 'pairing') {
    return `You are the AI coach inside VisionGo, a goal-planning app. The user has \
picked two of their goals and wants to know how the pair fits together. Answer in 2-3 \
warm, concrete sentences about how the goals reinforce each other. If there is real \
tension between them, name it as a balance to manage rather than discouraging either \
goal. You have no tools here and cannot change their goals — do not offer to. Do NOT \
give financial, investment, tax, legal or medical/mental-health advice.`;
  }

  const fmt = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const todayStr = fmt(ctx.today);
  const achieveStr = ctx.achieveByDate
    ? fmt(new Date(ctx.achieveByDate))
    : 'no target date set';
  const weeksStr =
    ctx.weeksRemaining != null ? ` (${ctx.weeksRemaining} weeks remaining)` : '';
  const stepsStr = ctx.measurables.length
    ? ctx.measurables.map(describeMeasurable).join('\n')
    : '(none yet — this goal has no steps at all)';
  const milestonesStr = (ctx.milestones ?? []).length
    ? ctx.milestones.map(describeMilestone).join('\n')
    : '(none yet)';
  const replyNo = ctx.exchangeCount + 1;
  const deadlineInstruction = ctx.achieveByDate
    ? ''
    : `\n\nNO DEADLINE SET\nThis goal has no target date yet, and you cannot size a \
weekly or monthly pace without one. Before proposing steps or milestones, ask the user \
when they want to achieve "${ctx.goalTitle}" by — make this your one question for reply \
1 if the plan otherwise has enough to go on. If they decline to give one after you ask, \
assume a sensible default (e.g. 12 weeks out) and say which one you assumed, then \
proceed with the plan.`;

  return `You are the AI coach inside VisionGo, a goal-planning app. VisionGo is NOT a \
to-do or habit app: users bring short-, medium- and long-term GOALS and rely on you — \
their accountability partner — to turn each goal into concrete steps and weekly \
micro-steps, and to keep the plan honest as things change.

THE GOAL YOU ARE COACHING
- Goal: "${ctx.goalTitle}"
- Today: ${todayStr}
- Achieve by: ${achieveStr}${weeksStr}${ctx.motivation ? `\n- Why this matters to the user: "${ctx.motivation}"` : ''}
- Steps currently on this goal:
${stepsStr}
- Milestones on this goal:
${milestonesStr}

This is reply #${replyNo} of the conversation.

HOW THIS GOAL IS STRUCTURED
A goal holds steps (measurables) and MILESTONES — sub-goals like \
"Save $10,000" or "Run a marathon" that carry COMMITMENTS — one simple \
recurring commitment each ("Save $1,000 per month", "Run 40 km this week") that the \
user can turn into a push reminder.
- Numeric milestone (a number to accumulate by a date): the app can already do the \
arithmetic. Add the milestone with its target and deadline and let the user pick the \
weekly/monthly split, or propose one commitment yourself if they asked you to.
- Effort milestone (not arithmetic): establish their baseline with ONE question, then \
propose ONE recurring target sized from that baseline.

NEVER PRESCRIBE A PROGRAMME
Propose at most one commitment per milestone. Do NOT lay out a multi-week \
training plan, an escalating weekly schedule, or a periodised programme, even if asked \
— VisionGo prompts and tracks a simple recurring commitment, it does not coach \
technique. Keep it supportive and general. Never give medical, injury, nutrition, \
financial or investment advice; redirect to a planning action instead.

YOU CAN ACTUALLY EDIT THIS GOAL
You have tools — add_step, edit_step, remove_step, set_target, add_milestone, \
add_commitment, remove_milestone — that change the user's real goal. Never describe a step you could create instead of creating it: if you say a \
step belongs in the plan, call add_step for it in the same reply. Every tool call is \
shown to the user as a chip they confirm before it is applied, so proposing is safe — \
but do not ask "shall I add this?" and then wait. Propose the calls, and say in your \
text that they can tap to confirm.
When editing or removing, pass the step's exact label from the list above. When adding \
a commitment, pass the exact milestone title it belongs under — add the \
milestone first in the same reply if it does not exist yet.
Reminders are never switched on by you: say the user can tap the bell on the step to \
pick the day and time (e.g. payday).

STAY GROUNDED — DO NOT JUST PRAISE
- Anchor every reply to "${ctx.goalTitle}" and the steps listed above.
- If the user's message is off-topic, empty, gibberish or too vague to plan from, say so \
kindly in one sentence and ask the single question that gets you back on track. Do NOT \
call it a great point, do NOT invent meaning it does not have, and do NOT compliment \
content that has none.
- If the user proposes something unrealistic for the time remaining, say so plainly and \
offer the version that does fit.
- Praise only real progress or a real decision, and keep it to a few words.

PLAN BUDGET — A FULL PLAN WITHIN 5 REPLIES
- Reply 1: ask ONE focused question that unlocks the plan (usually their current \
baseline). One question per reply, never more.
- Reply 2 (3 at the very latest): deliver the FULL plan. Lay it out in your text as \
numbered STEPS, each with its weekly MICRO-STEPS underneath, and back every step with an \
add_step call:
  * 1-2 ladder steps — these become dated weekly micro-steps with checkboxes.
  * 1-2 check or number steps — habits, logistics, checkpoints.
- Replies 3-5: adjust what the user pushes back on using edit_step / set_target / \
remove_step, then close with a one-line summary of the plan.
- If the user gives no baseline after one ask, assume a sensible beginner baseline, say \
which one you assumed, and deliver the plan anyway. Never stall.
- By reply 5 the goal must have a complete set of steps. If it does not, add them now.

SIZING RULES
- Never ask how many weeks are left — it is in the context above.
- ladder_weeks must fit the weeks remaining (cap at 12 when there is no target date).
- Size every step from the user's stated baseline to the goal. Never vague ("get \
fitter") — always measurable ("weekly long run 5 -> 10 km").
- step_size is how far one +/- tap moves a counter: leave it at 1 unless the target is \
large enough that 1 is tedious.

STYLE
- Warm, brief, direct. Short paragraphs. No preamble, no filler.
- LEGAL GUARDRAIL (required): do NOT give financial, investment, tax, legal or \
medical/mental-health advice. If asked, kindly decline and redirect to a planning action.`;
}

// ── Tool-call parsing ─────────────────────────────────────

interface ToolUseBlock {
  type: string;
  name?: string;
  input?: Record<string, unknown>;
}

function num(v: unknown): number | undefined {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

// Turn one tool_use block into a CoachAction, resolving the labels the coach
// quoted back to real ids where we can.
function toolUseToAction(
  block: ToolUseBlock, measurables: Measurable[], milestones: Milestone[],
): CoachAction | null {
  const input = block.input ?? {};
  const stepLabel = str(input.step_label);
  const match = stepLabel
    ? measurables.find((m) => m.label.trim().toLowerCase() === stepLabel.toLowerCase()) ??
      measurables.find((m) => m.label.toLowerCase().includes(stepLabel.toLowerCase()))
    : undefined;

  const mgTitle = str(input.milestone_title);
  const mgMatch = mgTitle
    ? milestones.find((mg) => mg.label.trim().toLowerCase() === mgTitle.toLowerCase()) ??
      milestones.find((mg) => mg.label.toLowerCase().includes(mgTitle.toLowerCase()))
    : undefined;

  const cadence = ((): Cadence | undefined => {
    const c = str(input.cadence);
    return c === 'weekly' || c === 'monthly' || c === 'custom' ? c : undefined;
  })();

  switch (block.name) {
    case 'add_milestone': {
      const title = str(input.title);
      if (!title) return null;
      const rawKind = str(input.kind);
      const target = num(input.target);
      const kind: MilestoneKind =
        rawKind === 'numeric' || rawKind === 'effort'
          ? rawKind
          : target != null ? 'numeric' : 'effort';
      // Accept a bare YYYY-MM-DD and anything Date can parse; ignore garbage.
      const rawDeadline = str(input.deadline);
      const parsed = rawDeadline ? new Date(rawDeadline) : null;
      return {
        kind: 'addMilestone',
        label: title,
        milestoneKind: kind,
        target: kind === 'numeric' ? target : undefined,
        unit: str(input.unit),
        step: num(input.step_size),
        deadline: parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : undefined,
      };
    }
    case 'add_commitment': {
      const label = str(input.label);
      if (!label || !mgTitle) return null;
      return {
        kind: 'addCommitment',
        label,
        milestoneId: mgMatch?.id,
        milestoneLabel: mgTitle,
        amount: num(input.amount),
        unit: str(input.unit),
        cadence: cadence ?? 'weekly',
        intervalDays: num(input.interval_days),
      };
    }
    case 'remove_milestone':
      if (!mgTitle) return null;
      return { kind: 'removeMilestone', milestoneId: mgMatch?.id, milestoneLabel: mgTitle };
    case 'add_step': {
      const label = str(input.label);
      const rawType = str(input.type);
      if (!label) return null;
      const type: MeasurableType =
        rawType === 'number' || rawType === 'ladder' ? rawType : 'check';
      return {
        kind: 'addTask',
        type,
        label,
        target: num(input.target),
        unit: str(input.unit) ?? '',
        step: num(input.step_size),
        ladderStart: num(input.ladder_start),
        ladderEnd: num(input.ladder_end),
        ladderWeeks: num(input.ladder_weeks),
      };
    }
    case 'edit_step':
      if (!stepLabel) return null;
      return {
        kind: 'editTask',
        measurableId: match?.id,
        measurableLabel: stepLabel,
        label: str(input.label),
        target: num(input.target),
        unit: str(input.unit),
        step: num(input.step_size),
      };
    case 'remove_step':
      if (!stepLabel) return null;
      return { kind: 'removeTask', measurableId: match?.id, measurableLabel: stepLabel };
    case 'set_target': {
      const target = num(input.target);
      if (!stepLabel || target == null) return null;
      return { kind: 'setTarget', measurableId: match?.id, measurableLabel: stepLabel, target };
    }
    default:
      return null;
  }
}

// ── Text fallback protocol ────────────────────────────────
//
// Tool calling is the real mechanism; SUGGEST lines are the fallback used by
// the offline stub and by any model reply that describes steps in plain text.

export function parseSuggestions(text: string): {
  displayText: string;
  actions: CoachAction[];
} {
  const lines = text.split('\n');
  const display: string[] = [];
  const actions: CoachAction[] = [];

  for (const line of lines) {
    // Models like to bullet or indent these — strip that before matching.
    const cleaned = line.trim().replace(/^[-*•]\s*/, '');

    // MILESTONE|<title>|<numeric|effort>|<target?>|<unit?>
    if (cleaned.startsWith('MILESTONE|')) {
      const p = cleaned.split('|').map((s) => s.trim());
      const title = p[1];
      if (title) {
        const kind: MilestoneKind = p[2] === 'numeric' ? 'numeric' : 'effort';
        actions.push({
          kind: 'addMilestone', label: title, milestoneKind: kind,
          target: kind === 'numeric' && p[3] ? Number(p[3]) : undefined,
          unit: p[4] || undefined,
        });
        continue;
      }
    }

    // STEP|<milestone title>|<label>|<weekly|monthly|custom>|<amount?>|<unit?>|<intervalDays?>
    if (cleaned.startsWith('STEP|')) {
      const p = cleaned.split('|').map((s) => s.trim());
      const [, mgTitle, label, cadenceRaw] = p;
      if (mgTitle && label) {
        const cadence: Cadence =
          cadenceRaw === 'monthly' || cadenceRaw === 'custom' ? cadenceRaw : 'weekly';
        actions.push({
          kind: 'addCommitment', milestoneLabel: mgTitle, label, cadence,
          amount: p[4] ? Number(p[4]) : undefined,
          unit: p[5] || undefined,
          intervalDays: p[6] ? Number(p[6]) : undefined,
        });
        continue;
      }
    }

    if (!cleaned.startsWith('SUGGEST|')) {
      display.push(line);
      continue;
    }
    const parts = cleaned.split('|').map((s) => s.trim());
    const label = parts[1];
    const type = parts[2];
    if (!label) { display.push(line); continue; }
    if (type === 'check') {
      actions.push({ kind: 'addTask', type: 'check', label });
    } else if (type === 'number' && parts.length >= 5) {
      actions.push({
        kind: 'addTask', type: 'number', label,
        target: Number(parts[3]), unit: parts[4],
        step: parts.length >= 6 ? Number(parts[5]) : undefined,
      });
    } else if (type === 'ladder' && parts.length >= 7) {
      actions.push({
        kind: 'addTask', type: 'ladder', label,
        ladderStart: Number(parts[3]), ladderEnd: Number(parts[4]),
        ladderWeeks: Number(parts[5]), unit: parts[6],
        target: Number(parts[4]),
      });
    } else {
      display.push(line);
    }
  }

  return { displayText: display.join('\n').trim(), actions };
}

// ── Protocol ──────────────────────────────────────────

export interface CoachService {
  send(messages: CoachMessageRaw[], ctx: CoachGoalContext): Promise<CoachResponse>;
}

// ── Stub: offline fallback ─────────────────────────────────
//
// Used when the AI route is unreachable (static hosting, no API key, no
// network). Mirrors the real coach's shape: one grounding question, then a
// full plan, and it pushes back on empty answers rather than praising them.

type Domain = 'fitness' | 'weight' | 'learn' | 'finance' | 'read' | 'default';

// Every list below is word-bounded (\b) so a short/ambiguous token only
// matches a whole word, never a substring buried inside an unrelated one —
// e.g. unbounded "eat" matched inside "great", "lb" inside "album", "fund"
// inside "fundamental", "train" inside "restrain", "read" inside "already".
// "5k"/"10k" get their own gate: they used to match ANY title containing
// that substring, so a purely financial goal like "Save 10k" or "$10k
// emergency fund" was misclassified as fitness before finance was even
// checked (fitness is tested first). They now only count as fitness when a
// running/race word appears in the same title.
const FITNESS_WORDS = /\b(run|running|walk|walking|cycle|cycling|swim|swimming|gym|workouts?|exercis\w*|marathons?|steps|cardio|sports?)\b/;
const FITNESS_RUN_CONTEXT = /\b(run|running|walk|walking|jog|jogging|race|races|racing|marathon|marathons|train|training)\b/;
const FITNESS_DISTANCE = /\b(5k|10k)\b/;
const WEIGHT_WORDS = /\b(weight|diet\w*|eat(s|ing|en)?|calori\w*|kilo\w*|pounds?|lbs?|bmi|fat|slim\w*|lean|nutrition)\b/;
const LEARN_WORDS = /\b(learn\w*|courses?|study|studying|studies|skills?|languages?|codes?|coding|coded|program\w*|certif\w*|degrees?|class(es)?|lessons?|trains?|training)\b/;
const FINANCE_WORDS = /\b(save|saves|saving|savings|money|invest\w*|budget\w*|debts?|financ\w*|income|salary|salaries|funds?|funding|emergency)\b/;
const READ_WORDS = /\b(reads?|reading|books?|pages?|novels?|chapters?|library|libraries|literature)\b/;

function detectDomain(title: string): Domain {
  const t = title.toLowerCase();
  if (FITNESS_WORDS.test(t) || (FITNESS_DISTANCE.test(t) && FITNESS_RUN_CONTEXT.test(t))) return 'fitness';
  if (WEIGHT_WORDS.test(t)) return 'weight';
  if (LEARN_WORDS.test(t)) return 'learn';
  if (FINANCE_WORDS.test(t)) return 'finance';
  if (READ_WORDS.test(t)) return 'read';
  return 'default';
}

// Extract the first integer from user text; return fallback if none found.
function extractNumber(text: string, fallback: number): number {
  const m = text.match(/\d+/);
  return m ? parseInt(m[0], 10) : fallback;
}

// Short, single-line quote of what the user actually typed, so replies stay
// visibly grounded in their literal words even when the plan itself falls
// back to a generic shape (no number given, message too vague to size from).
function excerpt(text: string, max = 60): string {
  const t = text.trim().replace(/\s+/g, ' ');
  if (!t) return '';
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

// A message we cannot plan from: no number, barely any words, or a single
// long token with no vowels (keyboard mash).
function isUnplannable(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  const words = t.split(/\s+/).filter(Boolean);
  const hasNumber = /\d/.test(t);
  if (words.length === 1 && /^[a-z]{5,}$/i.test(t) && !/[aeiou]/i.test(t)) return true;
  return !hasNumber && words.length < 3;
}

const TURN1_QUESTIONS: Record<Domain, string> = {
  fitness:
    "What's your starting point right now — for example, your current distance, frequency, or pace?",
  weight:
    "What's your current situation — e.g. starting weight, or a specific eating habit you want to change?",
  learn:
    "What do you already know about this, and what’s the main gap you’re trying to close?",
  finance:
    "What’s your current savings rate or starting balance, and what’s the target amount you have in mind?",
  read:
    "Roughly how many books or pages are you aiming for, and do you have a daily reading habit already?",
  default:
    `What would you see, feel, or have on the day you’ve fully achieved “${'{goalTitle}'}”?`,
};

// Message 1 already gave us something to work with — don't ask a question
// the user just answered. Only ask the grounding question when the first
// message genuinely carries no plannable content.
function buildTurn1(ctx: CoachGoalContext, userMsg: string): string {
  if (!isUnplannable(userMsg)) {
    return buildTurn2(ctx, userMsg);
  }
  const domain = detectDomain(ctx.goalTitle);
  const q = TURN1_QUESTIONS[domain].replace('{goalTitle}', ctx.goalTitle);
  return `Let’s build a real plan for “${ctx.goalTitle}”. ${q}`;
}

function buildRedirect(ctx: CoachGoalContext, userMsg: string): string {
  const domain = detectDomain(ctx.goalTitle);
  const q = TURN1_QUESTIONS[domain].replace('{goalTitle}', ctx.goalTitle);
  const quoted = userMsg.trim() ? ` from “${excerpt(userMsg)}”` : '';
  return `I can’t build a plan${quoted} yet — I want to keep us on “${ctx.goalTitle}”. ${q}`;
}

function buildTurn2(ctx: CoachGoalContext, userReply: string): string {
  const domain = detectDomain(ctx.goalTitle);
  const n = extractNumber(userReply, 0);
  const weeks = ctx.weeksRemaining ?? 12;

  const said = userReply.trim() ? `“${excerpt(userReply)}”` : 'that';
  const intro = n > 0
    ? `Got it — starting from ${n}. Here’s the plan, broken into steps with weekly micro-steps:`
    : `Thanks for sharing ${said} — I don’t see an exact number there, so I’m assuming a beginner start. Here’s the plan, broken into steps with weekly micro-steps:`;
  let suggests = '';

  switch (domain) {
    case 'fitness': {
      const start = Math.max(1, n > 0 ? Math.round(n * 0.6) : 2);
      const end = n > 0 ? n : 10;
      suggests = [
        `SUGGEST|Weekly ${/cycle|cycling/.test(ctx.goalTitle.toLowerCase()) ? 'cycling' : /swim/.test(ctx.goalTitle.toLowerCase()) ? 'swim' : 'run'} distance|ladder|${start}|${end}|${Math.min(weeks, 8)}|km`,
        `SUGGEST|Sessions logged|number|${Math.min(weeks, 8) * 3}|sessions|1`,
        `SUGGEST|Rest day scheduled each week|check`,
      ].join('\n');
      break;
    }
    case 'weight': {
      const target = n > 0 ? n : 500;
      const w = Math.min(weeks, 8);
      suggests = [
        `SUGGEST|Weekly active-days build-up|ladder|3|6|${w}|days/week`,
        `SUGGEST|Daily calorie target|number|${target}|cal/day|50`,
        `SUGGEST|Meal prep done each Sunday|check`,
      ].join('\n');
      break;
    }
    case 'learn': {
      const hrs = n > 0 ? n : 5;
      const w = Math.min(weeks, 8);
      suggests = [
        `SUGGEST|Weekly study-hours build-up|ladder|${Math.max(1, Math.round(hrs / 2))}|${hrs}|${w}|hrs/week`,
        `SUGGEST|Modules completed|number|${w}|modules|1`,
        `SUGGEST|Weekly review — what did I learn?|check`,
      ].join('\n');
      break;
    }
    case 'finance': {
      const amount = n > 0 ? n : 200;
      const w = Math.min(weeks, 12);
      suggests = [
        `SUGGEST|Weekly savings build-up|ladder|${Math.max(10, Math.round(amount / 8))}|${Math.round(amount / 4)}|${w}|$/week`,
        `SUGGEST|Total set aside|number|${amount}|$|${amount >= 1000 ? 50 : 10}`,
        `SUGGEST|Review budget every Sunday|check`,
      ].join('\n');
      break;
    }
    case 'read': {
      const pages = n > 0 ? n : 20;
      const w = Math.min(weeks, 8);
      suggests = [
        `SUGGEST|Weekly pages build-up|ladder|${Math.max(10, Math.round((pages * 7) / 2))}|${pages * 7}|${w}|pages/week`,
        `SUGGEST|Books finished|number|${Math.max(1, Math.round(w / 4))}|books|1`,
        `SUGGEST|Weekly reading log|check`,
      ].join('\n');
      break;
    }
    default: {
      const w = Math.min(weeks, 8);
      // A per-week target ramping 1 -> w just mirrors the week index, not a
      // real quantity — "8 milestones this week" by week 8 makes no sense,
      // and it duplicated the unit of the cumulative counter below it. Bound
      // it to a plausible weekly session count instead, independent of how
      // many weeks remain.
      const sessionsEnd = Math.min(w, 4);
      suggests = [
        `SUGGEST|Weekly focus sessions build-up|ladder|1|${sessionsEnd}|${w}|sessions/week`,
        `SUGGEST|Milestones hit|number|${w}|milestones|1`,
        `SUGGEST|Share progress with someone|check`,
      ].join('\n');
      break;
    }
  }

  return `${intro}\n\n${suggests}\n\nTap a chip to add it to your goal — or tell me which numbers to change.`;
}

function buildTurn3(userReply: string): string {
  const positive = /good|great|yes|perfect|love|works|sounds|sure|okay|ok|yep|yeah|exactly|spot on/i.test(userReply);
  if (positive) {
    return 'That’s the plan. Tap the chips above to add each step to your goal, then work the weekly micro-steps one at a time.';
  }
  const quoted = userReply.trim() ? ` about “${excerpt(userReply)}”` : '';
  return `Got it${quoted} — tell me the number you’d change and I’ll re-cut the plan around it.`;
}

// The goal screen's "Ask your coach" button sends a message naming one effort
// milestone. Offline, match it back so the stub can still answer usefully.
function matchEffortHandoff(text: string, ctx: CoachGoalContext): Milestone | undefined {
  if (!/weekly target|baseline|accountable|break .* down/i.test(text)) return undefined;
  const lower = text.toLowerCase();
  return (ctx.milestones ?? []).find(
    (mg) => mg.type === 'commitment' && lower.includes(mg.label.toLowerCase()),
  );
}

// One simple recurring commitment, sized from any number the user mentioned —
// deliberately not a training programme.
function buildEffortStep(mg: Milestone, userReply: string): string {
  const domain = detectDomain(mg.label);
  const n = extractNumber(userReply, 0);
  const [amount, unit] = ((): [number, string] => {
    switch (domain) {
      case 'fitness': return [n > 0 ? Math.max(1, Math.round(n * 1.2)) : 20, 'km'];
      case 'learn': return [n > 0 ? n : 5, 'hrs'];
      case 'read': return [n > 0 ? n * 7 : 100, 'pages'];
      default: return [n > 0 ? n : 3, 'sessions'];
    }
  })();
  const label = `${amount} ${unit} this week`;
  const baseline = n > 0
    ? `You're at ${n} now, so let's commit to a bit above that.`
    : `You didn't give me a baseline, so I've kept this gentle — edit the number to fit.`;
  return [
    `Let's keep "${mg.label}" simple: one weekly commitment you either hit or you don't. ${baseline}`,
    '',
    `STEP|${mg.label}|${label}|weekly|${amount}|${unit}`,
    '',
    `Tap to add it, then tap the bell on the step to pick the day and time you want me to ask "have you completed ${label}?".`,
  ].join('\n');
}

export class StubCoachService implements CoachService {
  async send(messages: CoachMessageRaw[], ctx: CoachGoalContext): Promise<CoachResponse> {
    await new Promise((r) => setTimeout(r, 750));

    if (ctx.kind === 'pairing') {
      return {
        text:
          `These two pull in the same direction: the discipline you build on one ` +
          `carries straight into the other, and a good week on either is a good week ` +
          `overall. Watch your time budget when both need attention in the same week — ` +
          `that is the balance to manage, not a reason to drop one.`,
        actions: [],
      };
    }

    // Count how many assistant turns have already happened
    const assistantTurns = messages.filter((m) => m.role === 'assistant').length;
    const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user')?.text ?? '';

    // Effort-milestone handoff: the goal screen sends a message naming the
    // milestone it wants a recurring target for.
    const handoff = matchEffortHandoff(lastUserMsg, ctx);
    if (handoff) {
      const { displayText, actions } = parseSuggestions(buildEffortStep(handoff, lastUserMsg));
      return { text: displayText, actions };
    }

    let rawText: string;
    if (assistantTurns === 0) {
      rawText = buildTurn1(ctx, lastUserMsg);
    } else if (assistantTurns === 1) {
      // One redirect only — past that, plan from an assumed baseline rather
      // than looping on a question the user is not answering.
      rawText = isUnplannable(lastUserMsg) ? buildRedirect(ctx, lastUserMsg) : buildTurn2(ctx, lastUserMsg);
    } else if (assistantTurns === 2 && ctx.measurables.length === 0) {
      rawText = buildTurn2(ctx, lastUserMsg);
    } else {
      rawText = buildTurn3(lastUserMsg);
    }

    const { displayText, actions } = parseSuggestions(rawText);
    return { text: displayText, actions };
  }
}

// ── Proxy (calls /api/coach server route) ──────────────────────
//
// URL resolution:
//   Dev / Node-hosted web: relative '/api/coach' hits Expo Router API route.
//   Static hosts (GitHub Pages): 404 → falls back to StubCoachService.
//   Native production: set EXPO_PUBLIC_COACH_API_URL to your deployed server
//     (e.g. https://your-app.vercel.app); without it the relative URL is
//     invalid on native and the network-error catch falls back to stub.
//
// To enable real AI responses: deploy Expo server build to Vercel, set
// ANTHROPIC_API_KEY there, set EXPO_PUBLIC_COACH_API_URL as EAS Secret.

export class ProxyCoachService implements CoachService {
  async send(messages: CoachMessageRaw[], ctx: CoachGoalContext): Promise<CoachResponse> {
    const base = process.env.EXPO_PUBLIC_COACH_API_URL ?? '';
    const url = `${base}/api/coach`;
    const deviceId = await getDeviceId();

    let response: globalThis.Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-device-id': deviceId },
        body: JSON.stringify({
          messages: messages.map((m) => ({ role: m.role, content: m.text })),
          systemPrompt: buildSystemPrompt(ctx),
          // No goal to edit on the Pair tab, so no tools there.
          tools: ctx.kind === 'pairing' ? [] : COACH_TOOLS,
          // Tells the server which of the two independently-capped daily
          // counters this request counts against.
          kind: ctx.kind === 'pairing' ? 'pair' : 'coach',
        }),
      });
    } catch {
      return new StubCoachService().send(messages, ctx);
    }

    // A device or global cap being hit is real, user-facing information —
    // surface it as-is instead of masking it behind the offline stub, which
    // would look like a normal (if generic) coach reply.
    if (response.status === 429) {
      let msg = 'Daily limit reached. Please try again tomorrow.';
      try {
        const data = await response.json();
        if (typeof data?.error === 'string') msg = data.error;
      } catch {
        // Keep the default message.
      }
      const err = new Error(msg) as Error & { isRateLimit: true };
      err.isRateLimit = true;
      throw err;
    }

    if (!response.ok) {
      return new StubCoachService().send(messages, ctx);
    }

    let data: any;
    try {
      data = await response.json();
    } catch {
      // Malformed body (e.g. an HTML error page from a static host)
      return new StubCoachService().send(messages, ctx);
    }

    const blocks: ToolUseBlock[] = Array.isArray(data.content) ? data.content : [];
    // The model may emit thinking blocks before the text block — find the first
    // text block instead of assuming content[0] is it.
    const rawText: string =
      (blocks.find((b: any) => b?.type === 'text' && typeof b.text === 'string') as any)?.text ?? '';

    const toolActions = blocks
      .filter((b) => b.type === 'tool_use')
      .map((b) => toolUseToAction(b, ctx.measurables, ctx.milestones ?? []))
      .filter((a): a is CoachAction => a !== null);

    // A refusal with no text and no tool calls means we got nothing usable.
    if (!rawText && toolActions.length === 0) {
      return new StubCoachService().send(messages, ctx);
    }

    const { displayText, actions: textActions } = parseSuggestions(rawText);
    const actions = [...toolActions, ...textActions];

    return {
      // A tool-only reply would render as an empty bubble — say what it did.
      text: displayText || 'Here are the changes I’d make to this goal:',
      actions,
    };
  }
}

// ── Singleton ──────────────────────────────────────────

export const coachService: CoachService = new ProxyCoachService();
