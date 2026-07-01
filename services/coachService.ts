import { newId } from '../store/models';

// ── Types ────────────────────────────────────────────────

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

// ── System prompt ───────────────────────────────────────────

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
2. After gathering enough info, summarize the concrete steps and ask "Anything else to add?"
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

// ── SUGGEST parser ────────────────────────────────────────────

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
    if (parts.length < 3) {
      display.push(line);
      continue;
    }
    const label = parts[1];
    const type = parts[2];
    if (type === 'check') {
      suggestions.push({ label, type: 'check' });
    } else if (type === 'number' && parts.length >= 5) {
      suggestions.push({
        label,
        type: 'number',
        target: Number(parts[3]),
        unit: parts[4],
      });
    } else if (type === 'ladder' && parts.length >= 7) {
      suggestions.push({
        label,
        type: 'ladder',
        start: Number(parts[3]),
        end: Number(parts[4]),
        weeks: Number(parts[5]),
        unit: parts[6],
        target: Number(parts[4]),
      });
    } else {
      display.push(line);
    }
  }

  return { displayText: display.join('\n').trim(), suggestions };
}

// ── Protocol ──────────────────────────────────────────────────

export interface CoachService {
  send(messages: CoachMessageRaw[], ctx: CoachGoalContext): Promise<CoachResponse>;
}

// ── Stub fallback — contextual responses based on goal keywords ─

export class StubCoachService implements CoachService {
  async send(messages: CoachMessageRaw[], ctx: CoachGoalContext): Promise<CoachResponse> {
    // Simulate network latency
    await new Promise((r) => setTimeout(r, 1100));

    const t = ctx.goalTitle.toLowerCase();
    const isFollowUp = messages.filter((m) => m.role === 'user').length > 1;

    let raw: string;

    if (isFollowUp) {
      raw = `Love that commitment! Here's what I'd suggest as your first concrete step: block time on your calendar this week specifically for "${ctx.goalTitle}". Small consistent actions compound into remarkable results.\n\nSUGGEST|Weekly dedicated session|check`;
    } else if (t.includes('read') || t.includes('book')) {
      raw = `Reading 📚 is one of the highest-ROI habits you can build. The key is consistency — even 20 pages a night adds up to 20+ books a year. I'd suggest tracking each book as you finish it, and setting a daily page target.\n\nSUGGEST|Log each book finished|check\nSUGGEST|Daily reading streak|number|365|days`;
    } else if (t.includes('run') || t.includes('marathon') || t.includes('5k') || t.includes('race')) {
      raw = `A running goal — love it! Building mileage gradually (no more than 10% increase per week) is the golden rule for staying injury-free. A weekly long run is your anchor workout.\n\nSUGGEST|Complete weekly long run|check\nSUGGEST|Weekly mileage|ladder|5|25|12|miles`;
    } else if (t.includes('learn') || t.includes('study') || t.includes('spanish') || t.includes('language') || t.includes('course')) {
      raw = `Learning goals shine when you practice daily rather than in long infrequent bursts. Even 20–30 minutes every day builds strong neural pathways. What's the first milestone that would prove you're making real progress?\n\nSUGGEST|Daily practice session|check\nSUGGEST|Practice streak|number|180|days`;
    } else if (t.includes('save') || t.includes('money') || t.includes('financ') || t.includes('invest')) {
      raw = `Smart financial goals are all about automation — remove willpower from the equation. Setting up an automatic transfer on payday means you save before you can spend. What's your monthly target?\n\nSUGGEST|Automate monthly transfer|check\nSUGGEST|Total saved|number|5000|USD`;
    } else if (t.includes('meditat') || t.includes('mindful') || t.includes('breathe')) {
      raw = `Meditation is one of the most powerful investments you can make in your mind. Starting with just 5–10 minutes and anchoring it to an existing habit (morning coffee, bedtime) makes it stick beautifully.\n\nSUGGEST|Morning meditation|check\nSUGGEST|Consecutive days streak|number|365|days`;
    } else if (t.includes('launch') || t.includes('project') || t.includes('startup') || t.includes('ship') || t.includes('build')) {
      raw = `Shipping is everything. The key is ruthless prioritization: what is the single feature that makes your product genuinely useful to one person? Start there. Everything else is v2.\n\nSUGGEST|Define MVP scope|check\nSUGGEST|Ship to first user|check`;
    } else if (t.includes('weight') || t.includes('fitness') || t.includes('gym') || t.includes('health') || t.includes('workout')) {
      raw = `Fitness goals are won in the kitchen and the gym. Tracking what you eat and hitting your workouts consistently 3–4x per week creates compound results that surprise you by month three.\n\nSUGGEST|Weekly workout sessions|number|4|sessions\nSUGGEST|Track nutrition daily|check`;
    } else if (t.includes('write') || t.includes('blog') || t.includes('novel') || t.includes('content')) {
      raw = `Writers write daily — even if just 100 words. A tiny consistent output compounds into a finished manuscript, a thriving blog, or a strong creative practice. What does your target look like?\n\nSUGGEST|Daily writing session|check\nSUGGEST|Words written|number|50000|words`;
    } else if (t.includes('sleep') || t.includes('rest') || t.includes('wake')) {
      raw = `Sleep quality transforms every other area of your life. Consistent bed and wake times — even on weekends — are the single most impactful change you can make. What time do you want to be in bed?\n\nSUGGEST|Consistent bedtime|check\nSUGGEST|Sleep streak (≥7 hrs)|number|90|nights`;
    } else {
      raw = `What an exciting goal! To build you the best plan, I want to understand what success really looks like. When you achieve "${ctx.goalTitle}", what's the first thing you'll notice is different in your life?\n\nSUGGEST|Track daily progress|check`;
    }

    const { displayText, suggestions } = parseSuggestions(raw);
    return { text: displayText, suggestions };
  }
}

// ── Proxy implementation (calls our own /api/coach server route) ─

export class ProxyCoachService implements CoachService {
  async send(messages: CoachMessageRaw[], ctx: CoachGoalContext): Promise<CoachResponse> {
    try {
      const response = await fetch('/api/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: messages.map((m) => ({ role: m.role, content: m.text })),
          systemPrompt: buildSystemPrompt(ctx),
        }),
      });

      // Fall back to stub when route is unavailable (static web build) or key not set
      if (!response.ok) {
        return new StubCoachService().send(messages, ctx);
      }

      const data = await response.json();
      const rawText: string = data.content?.[0]?.text ?? '';
      const { displayText, suggestions } = parseSuggestions(rawText);
      return { text: displayText, suggestions };
    } catch {
      return new StubCoachService().send(messages, ctx);
    }
  }
}

// ── Singleton ─────────────────────────────────────────────────

export const coachService: CoachService = new ProxyCoachService();
