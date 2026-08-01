export async function POST(request: Request): Promise<Response> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: 'ANTHROPIC_API_KEY is not configured on this server.' },
      { status: 503 }
    );
  }

  let body: { messages: unknown; systemPrompt: string; tools?: unknown };
  try {
    body = await request.json();
  } catch {
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
    upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'server-side-fallback-2026-07-01',
      },
      body: JSON.stringify({
        // claude-3-5-haiku-20241022 was retired Feb 2026 (the route 404'd and the
        // app silently fell back to the offline stub — a major cause of vague
        // plans). Sonnet 5 with low effort is plenty for this tool-use chat —
        // it doesn't need Opus-tier reasoning — at a third of the cost; the
        // server-side fallback re-runs any safety-classifier decline on
        // another model.
        model: 'claude-sonnet-5',
        max_tokens: 4096,
        output_config: { effort: 'low' },
        fallbacks: 'default',
        system: systemPrompt,
        messages,
        // The coach edits the goal through these tools. The app applies each
        // tool_use block after the user confirms it, so no tool_result is
        // ever sent back — history is replayed as plain text.
        ...(tools && tools.length > 0
          ? { tools, tool_choice: { type: 'auto' } }
          : {}),
      }),
    });
  } catch {
    // Network failure reaching the model API — report a gateway error instead
    // of crashing the route with an unhandled rejection.
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
