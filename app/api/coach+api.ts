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
//
// The device id itself is just an unsigned client-supplied header though —
// nothing stops a caller from generating a fresh one per request to reset
// this cap. IP_DAILY_LIMITS below is the backstop for that: it doesn't care
// what id the client claims. Set noticeably higher than the device limit so
// it doesn't false-positive on a household/office NAT or a carrier's shared
// IP with several genuine users behind it — it exists to catch "rotate the
// device id in a loop," not "two people on the same wifi."
const DEVICE_DAILY_LIMITS: Record<'coach' | 'pair', number> = {
  coach: 20,
  pair: 5,
};

const IP_DAILY_LIMITS: Record<'coach' | 'pair', number> = {
  coach: 100,
  pair: 25,
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
//
// When it's missing, incrWithDailyExpiry fails open (every cap below is
// unenforced) — an intentional trade-off so a Redis outage doesn't take
// down the coach feature. But a *misconfigured production deployment*
// looks identical to that outage and would otherwise fail open silently
// forever. This flag makes that condition loud in the server logs exactly
// once per server instance (not once per request, to avoid log spam on a
// busy misconfigured deployment).
let warnedMissingUpstash = false;

function upstashCreds(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) return { url, token };
  if (!warnedMissingUpstash) {
    warnedMissingUpstash = true;
    console.warn(
      '[coach+api] UPSTASH_REDIS_REST_URL/TOKEN not set — rate limiting is DISABLED, all cost ceilings are unenforced'
    );
  }
  return null;
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

// Belt-and-suspenders global ceiling — unlike the per-device/per-IP checks
// below, this one fails CLOSED: if Redis is unreachable/misconfigured we
// cannot prove the deployment is under its daily cost ceiling, so the
// honest answer is "unavailable," not "allowed." The per-device/IP checks
// stay fail-open by design (a Redis outage should degrade abuse protection,
// not take the whole feature down for every user) — this is the one limit
// that exists specifically to bound worst-case spend, so it doesn't get
// that same trade-off.
async function checkServerLimit(): Promise<boolean | null> {
  const count = await incrWithDailyExpiry(`coach-usage:${todayKey()}`);
  if (count === null) return null;
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

// Backstop against device-id rotation: keyed by the caller's IP instead of
// anything the client claims. See IP_DAILY_LIMITS above for why the
// threshold is set well above the device limit.
async function checkAndIncrementIpLimit(
  ip: string, kind: 'coach' | 'pair'
): Promise<{ allowed: boolean; limit: number }> {
  const limit = IP_DAILY_LIMITS[kind];
  const key = `ip-usage:${kind}:${ip || 'no-ip'}:${todayKey()}`;
  const count = await incrWithDailyExpiry(key);
  if (count === null) return { allowed: true, limit };
  return { allowed: count <= limit, limit };
}

// Vercel (and most reverse proxies) put the real client IP in the first
// hop of x-forwarded-for; x-real-ip is a fallback for other front ends.
// Neither header is attacker-controllable the way x-device-id is — the
// proxy sets it, not the client.
function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('x-real-ip') ?? '';
}

// A shared secret sent by the client as a header. This is NOT a real secret
// — EXPO_PUBLIC_* values ship inside the client bundle/IPA and are
// extractable by anyone willing to unpack it — so treat it only as a speed
// bump against casual/automated scraping of this endpoint, not as access
// control. The real cost controls are the daily caps above, which don't
// depend on this check at all. If COACH_SHARED_SECRET isn't configured,
// this check is skipped (logged once) rather than locking everyone out —
// same trade-off as the Upstash-missing case below.
let warnedMissingSecret = false;
function checkSharedSecret(request: Request): boolean {
  const expected = process.env.COACH_SHARED_SECRET;
  if (!expected) {
    if (!warnedMissingSecret) {
      warnedMissingSecret = true;
      console.warn('[coach+api] COACH_SHARED_SECRET not set — shared-secret check is DISABLED');
    }
    return true;
  }
  return request.headers.get('x-coach-secret') === expected;
}

// Browser requests carry Origin (or, failing that, Referer); native app
// requests carry neither. When ALLOWED_ORIGINS is configured and a request
// does carry one of these headers, reject anything not on the allowlist —
// this only ever narrows what a *browser* can do against the endpoint
// (e.g. another site's JS calling it with a user's cookies/session), it has
// no effect on native or on tools that don't set these headers at all.
function checkOrigin(request: Request): boolean {
  const allowed: string[] = (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s: string) => s.trim())
    .filter(Boolean);
  if (allowed.length === 0) return true;
  const origin = request.headers.get('origin') ?? request.headers.get('referer');
  if (!origin) return true;
  return allowed.some((a: string) => origin === a || origin.startsWith(`${a}/`));
}

export async function POST(request: Request): Promise<Response> {
  if (!checkOrigin(request)) {
    return Response.json({ error: 'Origin not allowed.' }, { status: 403 });
  }
  if (!checkSharedSecret(request)) {
    return Response.json({ error: 'Missing or invalid credentials.' }, { status: 401 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: 'ANTHROPIC_API_KEY is not configured on this server.' },
      { status: 503 }
    );
  }

  const globalAllowed = await checkServerLimit();
  if (globalAllowed === null) {
    // Fail CLOSED: we could not verify the deployment is under its daily
    // cost ceiling, so refuse rather than risk unbounded spend. See
    // checkServerLimit's comment for why this one differs from the
    // fail-open device/IP checks below.
    return Response.json(
      { error: 'Coach is temporarily unavailable. Please try again shortly.' },
      { status: 503 }
    );
  }
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
  const ip = clientIp(request);

  const { allowed: ipAllowed } = await checkAndIncrementIpLimit(ip, kind);
  if (!ipAllowed) {
    return Response.json(
      { error: 'Too many requests from this network today. Please try again tomorrow.' },
      { status: 429 }
    );
  }

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
          // Coach replies are short paragraphs by design (see the STYLE rule
          // in buildSystemPrompt: "Warm, brief, direct. Short paragraphs. No
          // preamble, no filler.") plus at most a handful of small tool_use
          // blocks (edit_step/set_target/etc.) per turn. 1536 comfortably
          // covers that while capping the worst-case cost per request well
          // below the old 4096 ceiling.
          max_tokens: 1536,
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
