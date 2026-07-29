import {
  CoachAction, Measurable, MeasurableType, measurableStep,
} from '../store/models';

// ── Types ──────────────────────────────────────────

export interface CoachGoalContext {
  goalTitle: string;
  achieveByDate?: string;
  weeksRemaining?: number;
  today: Date;
  // The goal's real steps, so the coach talks about what actually exists
  // instead of inventing a plan the user cannot see.
  measurables: Measurable[];
  // Coach replies so far — drives the "plan within ~5 messages" budget.
  exchangeCount: number;
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
  }
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
  const replyNo = ctx.exchangeCount + 1;

  return `You are the AI coach inside VisionGo, a goal-planning app. VisionGo is NOT a \
to-do or habit app: users bring short-, medium- and long-term GOALS and rely on you — \
their accountability partner — to turn each goal into concrete steps and weekly \
micro-steps, and to keep the plan honest as things change.

THE GOAL YOU ARE COACHING
- Goal: "${ctx.goalTitle}"
- Today: ${todayStr}
- Achieve by: ${achieveStr}${weeksStr}
- Steps currently on this goal:
${stepsStr}

This is reply #${replyNo} of the conversation.

YOU CAN ACTUALLY EDIT THIS GOAL
You have tools — add_step, edit_step, remove_step, set_target — that change the user's \
real goal. Never describe a step you could create instead of creating it: if you say a \
step belongs in the plan, call add_step for it in the same reply. Every tool call is \
shown to the user as a chip they confirm before it is applied, so proposing is safe — \
but do not ask "shall I add this?" and then wait. Propose the calls, and say in your \
text that they can tap to confirm.
When editing or removing, pass the step's exact label from the list above.

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

// Turn one tool_use block into a CoachAction, resolving the step label the
// coach quoted back to a real measurable id where we can.
function toolUseToAction(block: ToolUseBlock, measurables: Measurable[]): CoachAction | null {
  const input = block.input ?? {};
  const stepLabel = str(input.step_label);
  const match = stepLabel
    ? measurables.find((m) => m.label.trim().toLowerCase() === stepLabel.toLowerCase()) ??
      measurables.find((m) => m.label.toLowerCase().includes(stepLabel.toLowerCase()))
    : undefined;

  switch (block.name) {
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

function detectDomain(title: string): Domain {
  const t = title.toLowerCase();
  if (/run|walk|cycle|cycling|swim|gym|workout|exercise|marathon|5k|10k|steps|cardio|sport/.test(t)) return 'fitness';
  if (/weight|diet|eat|calori|kilo|pound|lb|bmi|fat|slim|lean|nutrition/.test(t)) return 'weight';
  if (/learn|course|study|skill|language|code|program|certif|degree|class|lesson|train/.test(t)) return 'learn';
  if (/save|saving|money|invest|budget|debt|financ|income|salary|fund|emergency/.test(t)) return 'finance';
  if (/read|book|pages|novel|chapter|library|literature/.test(t)) return 'read';
  return 'default';
}

// Extract the first integer from user text; return fallback if none found.
function extractNumber(text: string, fallback: number): number {
  const m = text.match(/\d+/);
  return m ? parseInt(m[0], 10) : fallback;
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

function buildTurn1(ctx: CoachGoalContext): string {
  const domain = detectDomain(ctx.goalTitle);
  const q = TURN1_QUESTIONS[domain].replace('{goalTitle}', ctx.goalTitle);
  return `Let’s build a real plan for “${ctx.goalTitle}”. ${q}`;
}

function buildRedirect(ctx: CoachGoalContext): string {
  const domain = detectDomain(ctx.goalTitle);
  const q = TURN1_QUESTIONS[domain].replace('{goalTitle}', ctx.goalTitle);
  return `I can’t plan from that yet — I want to keep us on “${ctx.goalTitle}”. ${q}`;
}

function buildTurn2(ctx: CoachGoalContext, userReply: string): string {
  const domain = detectDomain(ctx.goalTitle);
  const n = extractNumber(userReply, 0);
  const weeks = ctx.weeksRemaining ?? 12;

  const intro = n > 0
    ? `Got it — starting from ${n}. Here’s the plan, broken into steps with weekly micro-steps:`
    : `You didn’t give me a baseline, so I’m assuming a beginner start. Here’s the plan, broken into steps with weekly micro-steps:`;
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
      suggests = [
        `SUGGEST|Weekly milestone build-up|ladder|1|${w}|${w}|milestones`,
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
  return 'Tell me the number you’d change and I’ll re-cut the plan around it — which step is off?';
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

    let rawText: string;
    if (assistantTurns === 0) {
      rawText = buildTurn1(ctx);
    } else if (assistantTurns === 1) {
      // One redirect only — past that, plan from an assumed baseline rather
      // than looping on a question the user is not answering.
      rawText = isUnplannable(lastUserMsg) ? buildRedirect(ctx) : buildTurn2(ctx, lastUserMsg);
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

    let response: globalThis.Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: messages.map((m) => ({ role: m.role, content: m.text })),
          systemPrompt: buildSystemPrompt(ctx),
          // No goal to edit on the Pair tab, so no tools there.
          tools: ctx.kind === 'pairing' ? [] : COACH_TOOLS,
        }),
      });
    } catch {
      return new StubCoachService().send(messages, ctx);
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
      .map((b) => toolUseToAction(b, ctx.measurables))
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
