import { newId } from '../store/models';

// ── Types ────────────────────────────────────────────

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

// ── Protocol ────────────────────────────────────────────

export interface CoachService {
  send(messages: CoachMessageRaw[], ctx: CoachGoalContext): Promise<CoachResponse>;
}

// ── Stub fallback ──────────────────────────────────────────

export class StubCoachService implements CoachService {
  async send(messages: CoachMessageRaw[], ctx: CoachGoalContext): Promise<CoachResponse> {
    await new Promise((r) => setTimeout(r, 900));
    const stubText = `Great goal! To help you build the best plan, let me ask: what does success look like on the day you achieve "${ctx.goalTitle}"?\n\nSUGGEST|Track daily progress|check`;
    const { displayText, suggestions } = parseSuggestions(stubText);
    return { text: displayText, suggestions };
  }
}

// ── Proxy implementation (calls /api/coach server route) ─────────────────────
//
// URL resolution:
//   - Dev (Expo dev server / web export served by Node): relative '/api/coach'
//     is handled by the Expo server runtime.
//   - Static web hosts (GitHub Pages, etc.): no Node server exists, so the
//     request returns 404. We fall back to StubCoachService in that case.
//   - Native production: set EXPO_PUBLIC_COACH_API_URL to your deployed
//     server's base URL (e.g. https://your-app.vercel.app) as an EAS secret.
//     Without it, the relative URL is invalid on native and the network error
//     catch falls back to stub automatically.
//
// To enable REAL AI responses on any environment:
//   1. Deploy the Expo server build to Vercel (or similar Node host).
//   2. Set ANTHROPIC_API_KEY env var on that host.
//   3. Set EXPO_PUBLIC_COACH_API_URL EAS secret to that host's URL (native).
//      Web builds served from the same origin need no extra config.

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
      // Network error or invalid URL (native without EXPO_PUBLIC_COACH_API_URL)
      return new StubCoachService().send(messages, ctx);
    }

    // Fall back to stub for any non-ok response:
    //   404 = static host with no /api/coach route (GitHub Pages, CDN)
    //   503 = server running but ANTHROPIC_API_KEY not configured
    //   5xx = server error
    // In all cases the user gets a working (stub) response rather than an error.
    if (!response.ok) {
      return new StubCoachService().send(messages, ctx);
    }

    const data = await response.json();
    const rawText: string = data.content?.[0]?.text ?? '';
    const { displayText, suggestions } = parseSuggestions(rawText);
    return { text: displayText, suggestions };
  }
}

// ── Singleton ────────────────────────────────────────────

export const coachService: CoachService = new ProxyCoachService();
