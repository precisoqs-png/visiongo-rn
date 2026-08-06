// Whole-deployment daily cap. Belt-and-suspenders against a shared API key
// being drained faster than the per-device limits below would allow (e.g.
// many devices hitting their own caps still adding up to too much spend).
const SERVER_DAILY_LIMIT = 500;

// Per-device daily caps, tracked separately by request kind. This is the
// real enforcement: the client also keeps its own coach-message counter for
// instant UI feedback, but that one lives in AsyncStorage and is trivially
// reset (reinstall, clear storage, edit the persisted state) — it cannot
// stop a client from calling this route more than the stated limit. These
// counters live in Redis keyed by a per-device id sent as a header, so they
// hold regardless of what the client does or claims.
const DEVICE_DAILY_LIMITS: Record<'coach' | 'pair', number> = {
  coach: 20,
  pair: 5,
};

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

// Upstash isn't configured in every environment (local dev, preview builds
// without the env vars set) — cached per invocation so callers can decide
// once whether to enforce anything at all.
function upstashCreds(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
}

// INCRs `key` in Upstash and, on the first increment, sets it to expire in
// 24h so daily counters reset without a scheduled job. Returns the new count,
// or null if Upstash is unreachable/misconfigured/erroring — callers treat
// null as "fail open" so a rate limiter outage never blocks the feature
// entirely (that's a deliberate trade-off: worst case is some over-usage
// during an outage, not the coach going down for everyone).
async function incrWithDailyExpiry(key: string): Promise<number | null> {
  const creds = upstashCreds();
  if (!creds) return null;
  const { url, token } = creds;

  try {
    const incrRes = await fetchWithTimeout(
      `${url}/incr/${key}`,
      { headers: { Authorization: `Bearer ${token}` } },
      UPSTASH_TIMEOUT_MS,
      `Upstash INCR ${key}`
    );
    if (!incrRes.ok) return null;
    const incrData = await incrRes.json();
    const count = typeof incrData?.result === 'number' ? incrData.result : Number(incrData?.result);
    if (!Number.isFinite(count)) return null;

    if (count === 1) {
      await fetchWithTimeout(
        `${url}/expire/${key}/86400`,
        { headers: { Authorization: `Bearer ${token}` } },
        UPSTASH_TIMEOUT_MS,
        `Upstash EXPIRE ${key}`
      );
    }
    return count;
  } catch {
    return null;
  }
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

async function checkAndIncrementServerLimit(): Promise<boolean> {
  const count = await incrWithDailyExpiry(`coach-usage:${todayKey()}`);
  if (count === null) return true;
  return count <= SERVER_DAILY_LIMIT;
}

// The real per-device enforcement. `deviceId` comes from the x-device-id
// header the app sends on every request; a request with no header (an old
// client build, or one crafted to omit it) falls into a single shared
// "no-device" bucket rather than skipping the check, so it still caps out
// fast instead of bypassing the limit entirely.
async function checkAndIncrementDeviceLimit(
  deviceId: string, kind: 'coach' | 'pair'
): Promise<{ allowed: boolean; limit: number }> {
  const limit = DEVICE_DAILY_LIMITS[kind];
  const key = `device-usage:${kind}:${deviceId || 'no-device'}:${todayKey()}`;
  const count = await incrWithDailyExpiry(key);
  if (count === null) return { allowed: true, limit };
  return { allowed: count <= limit, limit };
}

export async function POST(request: Request): Promise<Response> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: 'ANTHROPIC_API_KEY is not configured on this server.' },
      { status: 503 }
    );
  }

  const globalAllowed = await checkAndIncrementServerLimit();
  if (!globalAllowed) {
    return Response.json(
      { error: 'The coach has reached its daily usage limit for all users. Please try again tomorrow.' },
      { status: 429 }
    );
  }

  let body: { messages: unknown; systemPrompt: string; tools?: unknown; kind?: unknown };
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

  const kind: 'coach' | 'pair' = body.kind === 'pair' ? 'pair' : 'coach';
  const deviceId = request.headers.get('x-device-id') ?? '';
  const { allowed: deviceAllowed, limit: deviceLimit } = await checkAndIncrementDeviceLimit(deviceId, kind);
  if (!deviceAllowed) {
    const what = kind === 'pair' ? 'Pair' : 'coach chat';
    return Response.json(
      { error: `You've reached today's limit of ${deviceLimit} ${what} requests. Please try again tomorrow.` },
      { status: 429 }
    );
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
