// Whole-deployment daily cap, distinct from the per-device COACH_DAILY_LIMIT
// enforced client-side. Belt-and-suspenders against a shared API key being
// drained faster than the per-device limit alone would allow (e.g. many
// devices, or a client that's been tampered with).
const SERVER_DAILY_LIMIT = 500;

const UPSTASH_TIMEOUT_MS = 15_000;
const ANTHROPIC_TIMEOUT_MS = 20_000;
const REQUEST_BODY_TIMEOUT_MS = 15_000;

// Races a promise against a timer so a stalled inbound request.json() read
// (the actual hang site, not Upstash or Anthropic) fails fast instead of
// hanging to Vercel's hard 300s cap. Unlike fetchWithTimeout, this can't
// abort the underlying read — the Request's own AbortController belongs to
// the Vercel adapter, not this handler — so the read may keep dangling in
// the background, but the function itself returns an error response
// instead of hanging.
async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, step: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(`${step} timed out after ${timeoutMs}ms`);
      err.name = 'TimeoutError';
      reject(err);
    }, timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

// Bounds a fetch with an AbortController so a slow/hanging upstream can never
// stall the whole function up to Vercel's own hard timeout. `step` names the
// call in the thrown/logged error so Upstash vs Anthropic are distinguishable
// in the logs.
//
// Resolving the fetch() promise only means headers arrived — the body can
// still stall indefinitely, and by then the abort timer has already been
// cleared. So the body is drained here, under the same timer, and handed
// back as an already-buffered Response; callers' later .json() calls then
// just parse in-memory text instead of touching the network again.
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  step: string
): Promise<globalThis.Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const text = await res.text();
    return new Response(text, { status: res.status, statusText: res.statusText, headers: res.headers });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      console.error(`[coach+api] ${step} timed out after ${timeoutMs}ms`);
    } else {
      console.error(`[coach+api] ${step} fetch failed:`, err);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// Optional: only active when both Upstash env vars are set. Uses the Upstash
// Redis REST API directly (no SDK dependency) to INCR a per-day counter and
// EXPIRE it after 24h. Fails open — returns true (allow) — whenever the
// vars are unset or anything about the request goes wrong, so a
// misconfigured or unreachable rate limiter never blocks the coach feature.
async function checkAndIncrementServerLimit(): Promise<boolean> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    return true;
  }

  try {
    const key = `coach-usage:${new Date().toISOString().slice(0, 10)}`;
    const incrRes = await fetchWithTimeout(
      `${url}/incr/${key}`,
      { headers: { Authorization: `Bearer ${token}` } },
      UPSTASH_TIMEOUT_MS,
      'Upstash INCR'
    );
    if (!incrRes.ok) {
      return true;
    }
    const incrData = await incrRes.json();
    const count = typeof incrData?.result === 'number' ? incrData.result : Number(incrData?.result);
    if (!Number.isFinite(count)) {
      return true;
    }
    if (count === 1) {
      // First increment of the day for this key — set it to expire in 24h
      // so the counter resets without needing a scheduled job.
      await fetchWithTimeout(
        `${url}/expire/${key}/86400`,
        { headers: { Authorization: `Bearer ${token}` } },
        UPSTASH_TIMEOUT_MS,
        'Upstash EXPIRE'
      );
    }
    return count <= SERVER_DAILY_LIMIT;
  } catch {
    return true;
  }
}

export async function POST(request: Request): Promise<Response> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: 'ANTHROPIC_API_KEY is not configured on this server.' },
      { status: 503 }
    );
  }

  const allowed = await checkAndIncrementServerLimit();
  if (!allowed) {
    return Response.json(
      { error: 'The coach has reached its daily usage limit for all users. Please try again tomorrow.' },
      { status: 429 }
    );
  }

  let body: { messages: unknown; systemPrompt: string; tools?: unknown };
  try {
    body = await withTimeout(request.json(), REQUEST_BODY_TIMEOUT_MS, 'Inbound request body read');
  } catch (err) {
    if (err instanceof Error && err.name === 'TimeoutError') {
      console.error(`[coach+api] Inbound request body read timed out after ${REQUEST_BODY_TIMEOUT_MS}ms`);
      return Response.json({ error: 'Timed out reading the request body.' }, { status: 408 });
    }
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { messages, systemPrompt, tools } = body;
  if (!Array.isArray(messages) || typeof systemPrompt !== 'string') {
    return Response.json({ error: 'messages (array) and systemPrompt (string) are required' }, { status: 400 });
  }
  if (tools !== undefined && !Array.isArray(tools)) {
    return Response.json({ error: 'tools must be an array when provided' }, { status: 400 });
  }

  let upstream: globalThis.Response;
  try {
    upstream = await fetchWithTimeout(
      'https://api.anthropic.com/v1/messages',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          // claude-3-5-haiku-20241022 was retired Feb 2026 (the route 404'd and the
          // app silently fell back to the offline stub — a major cause of vague
          // plans). Sonnet 5 with low effort is plenty for this tool-use chat —
          // it doesn't need Opus-tier reasoning — at a third of the cost.
          // No `fallbacks` param: claude-sonnet-5 doesn't support it (400s).
          model: 'claude-sonnet-5',
          max_tokens: 4096,
          output_config: { effort: 'low' },
          system: systemPrompt,
          messages,
          // The coach edits the goal through these tools. The app applies each
          // tool_use block after the user confirms it, so no tool_result is
          // ever sent back — history is replayed as plain text.
          ...(tools && tools.length > 0
            ? { tools, tool_choice: { type: 'auto' } }
            : {}),
        }),
      },
      ANTHROPIC_TIMEOUT_MS,
      'Anthropic Messages API'
    );
  } catch {
    // Network failure or timeout reaching the model API — report a gateway
    // error instead of crashing the route with an unhandled rejection.
    return Response.json({ error: 'Could not reach the AI service.' }, { status: 502 });
  }

  let data: unknown;
  try {
    data = await upstream.json();
  } catch {
    return Response.json({ error: 'Invalid response from the AI service.' }, { status: 502 });
  }

  if (!upstream.ok) {
    return Response.json(data, { status: upstream.status });
  }

  return Response.json(data);
}
