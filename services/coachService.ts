import { newId } from '../store/models';

// ── Types ──────────────────────────────────────────

export interface CoachGoalContext {
  goalTitle: string;
  achieveByDate?: string;
  weeksRemaining?: number;
  today: Date;
}

export interface CoachMessageRaw {
  role: 'user' | 'assistant';
  text: string;
}

export interface ParsedSuggestion {
  label: string;
  type: 'check' | 'number' | 'ladder';
  target?: number;
  unit?: string;
  start?: number;
  end?: number;
  weeks?: number;
}

export interface CoachResponse {
  text: string;
  suggestions: ParsedSuggestion[];
}

// ── System prompt (used by the real AI route) ─────────────────────

export function buildSystemPrompt(ctx: CoachGoalContext): string {
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const todayStr = fmt(ctx.today);
  const achieveStr = ctx.achieveByDate
    ? fmt(new Date(ctx.achieveByDate))
    : 'no target date set';
  const weeksStr =
    ctx.weeksRemaining != null ? ` (${ctx.weeksRemaining} weeks remaining)` : '';

  return `You are a warm, encouraging goal-planning coach inside the VisionGo app. \
Your job is to help the user turn their goal into concrete, measurable steps.

Context:
- Today: ${todayStr}
- Goal: "${ctx.goalTitle}"
- Achieve by: ${achieveStr}${weeksStr}

Rules:
1. Ask at most 5 short, focused questions — one per reply — to understand the goal.
2. After gathering enough info, summarize the concrete steps and ask “Anything else to add?”
3. Never ask how many weeks the user has — you already know from the context above.
4. Be warm, brief, and encouraging. Never negative or preachy.
5. LEGAL GUARDRAIL (required): Do NOT give financial, investment, tax, legal, or \
medical/mental-health advice. If asked, kindly decline and redirect to a planning action.

When a concrete measurable step emerges, emit it on its own line in EXACTLY one of:
  SUGGEST|<label>|check
  SUGGEST|<label>|number|<target>|<unit>
  SUGGEST|<label>|ladder|<start>|<end>|<weeks>|<unit>

These lines are parsed by the app — keep the format exact.`;
}

// ── SUGGEST parser ──────────────────────────────────────────

export function parseSuggestions(text: string): {
  displayText: string;
  suggestions: ParsedSuggestion[];
} {
  const lines = text.split('\n');
  const display: string[] = [];
  const suggestions: ParsedSuggestion[] = [];

  for (const line of lines) {
    if (!line.startsWith('SUGGEST|')) {
      display.push(line);
      continue;
    }
    const parts = line.split('|');
    if (parts.length < 3) { display.push(line); continue; }
    const label = parts[1];
    const type = parts[2];
    if (type === 'check') {
      suggestions.push({ label, type: 'check' });
    } else if (type === 'number' && parts.length >= 5) {
      suggestions.push({ label, type: 'number', target: Number(parts[3]), unit: parts[4] });
    } else if (type === 'ladder' && parts.length >= 7) {
      suggestions.push({
        label, type: 'ladder',
        start: Number(parts[3]), end: Number(parts[4]),
        weeks: Number(parts[5]), unit: parts[6],
        target: Number(parts[4]),
      });
    } else {
      display.push(line);
    }
  }

  return { displayText: display.join('\n').trim(), suggestions };
}

// ── Protocol ──────────────────────────────────────────

export interface CoachService {
  send(messages: CoachMessageRaw[], ctx: CoachGoalContext): Promise<CoachResponse>;
}

// ── Stub: 3-phase domain-aware conversation ─────────────────────
//
// Phase 0 (turn 1): targeted domain question based on goal title keywords
// Phase 1 (turn 2): 2–3 concrete SUGGEST lines drawn from goal title + user reply
// Phase 2 (turn 3+): confirm or handle one round of adjustments, then close

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
  return `Love this goal! To help you build the best plan for “${ctx.goalTitle}” — ${q}`;
}

function buildTurn2(ctx: CoachGoalContext, userReply: string): string {
  const domain = detectDomain(ctx.goalTitle);
  const n = extractNumber(userReply, 0);
  const weeks = ctx.weeksRemaining ?? 12;

  let intro = `Got it — that’s really helpful. Based on what you’ve shared, here are some concrete steps I’d suggest:`;
  let suggests = '';

  switch (domain) {
    case 'fitness': {
      const start = Math.max(1, n > 0 ? Math.round(n * 0.6) : 2);
      const end = n > 0 ? n : 10;
      suggests = [
        `SUGGEST|Weekly ${/cycle|cycling/.test(ctx.goalTitle.toLowerCase()) ? 'cycling' : /swim/.test(ctx.goalTitle.toLowerCase()) ? 'swim' : 'run'} distance|ladder|${start}|${end}|${Math.min(weeks, 8)}|km`,
        `SUGGEST|Log every workout session|check`,
        `SUGGEST|Rest day scheduled each week|check`,
      ].join('\n');
      break;
    }
    case 'weight': {
      const target = n > 0 ? n : 500;
      suggests = [
        `SUGGEST|Weigh-in every Monday morning|check`,
        `SUGGEST|Daily calorie target|number|${target}|cal/day`,
        `SUGGEST|Meal prep done each Sunday|check`,
      ].join('\n');
      break;
    }
    case 'learn': {
      const hrs = n > 0 ? n : 5;
      suggests = [
        `SUGGEST|Study sessions this week|number|${hrs}|hrs`,
        `SUGGEST|Complete one module or chapter per week|check`,
        `SUGGEST|Weekly review — what did I learn?|check`,
      ].join('\n');
      break;
    }
    case 'finance': {
      const amount = n > 0 ? n : 200;
      suggests = [
        `SUGGEST|Monthly transfer to savings|number|${amount}|$/month`,
        `SUGGEST|Review budget every Sunday|check`,
        `SUGGEST|No impulse purchases over $50 without 24hr wait|check`,
      ].join('\n');
      break;
    }
    case 'read': {
      const pages = n > 0 ? n : 20;
      suggests = [
        `SUGGEST|Daily reading habit|number|${pages}|pages/day`,
        `SUGGEST|Finish one book this month|check`,
        `SUGGEST|Weekly reading log|check`,
      ].join('\n');
      break;
    }
    default: {
      suggests = [
        `SUGGEST|Weekly check-in on progress|check`,
        `SUGGEST|Define one milestone this month|check`,
        `SUGGEST|Share progress with someone|check`,
      ].join('\n');
      break;
    }
  }

  return `${intro}\n\n${suggests}\n\nDo these fit your situation, or would you tweak any of them?`;
}

function buildTurn3(userReply: string): string {
  const positive = /good|great|yes|perfect|love|works|sounds|sure|okay|ok|yep|yeah|exactly|spot on/i.test(userReply);
  if (positive) {
    return "That's the plan! Tap any chip above to add a step to your goal. You've got this — I’ll be here whenever you want to refine further.";
  }
  return "Totally fair — adjust any of those chips above to fit your numbers, or tell me more about what you’d change and I’ll suggest alternatives. You know your situation best!";
}

export class StubCoachService implements CoachService {
  async send(messages: CoachMessageRaw[], ctx: CoachGoalContext): Promise<CoachResponse> {
    await new Promise((r) => setTimeout(r, 750));

    // Count how many assistant turns have already happened
    const assistantTurns = messages.filter((m) => m.role === 'assistant').length;
    const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user')?.text ?? '';

    let rawText: string;
    if (assistantTurns === 0) {
      // Phase 0: opening targeted question
      rawText = buildTurn1(ctx);
    } else if (assistantTurns === 1) {
      // Phase 1: propose concrete measurables based on goal + user reply
      rawText = buildTurn2(ctx, lastUserMsg);
    } else {
      // Phase 2+: close out the conversation
      rawText = buildTurn3(lastUserMsg);
    }

    const { displayText, suggestions } = parseSuggestions(rawText);
    return { text: displayText, suggestions };
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
    const rawText: string = data.content?.[0]?.text ?? '';
    if (!rawText) {
      return new StubCoachService().send(messages, ctx);
    }
    const { displayText, suggestions } = parseSuggestions(rawText);
    return { text: displayText, suggestions };
  }
}

// ── Singleton ──────────────────────────────────────────

export const coachService: CoachService = new ProxyCoachService();
