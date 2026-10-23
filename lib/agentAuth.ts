/**
 * Shared-secret auth for Langify → agent grade/react endpoints.
 * Header: x-agent-secret  ·  Env: AGENT_SHARED_SECRET
 */
export function requireAgentSecret(req: Request): Response | null {
  const expected = process.env.AGENT_SHARED_SECRET?.trim();
  if (!expected) {
    return Response.json(
      { error: 'AGENT_SHARED_SECRET is not configured' },
      { status: 503 },
    );
  }
  const got = req.headers.get('x-agent-secret')?.trim() ?? '';
  if (got !== expected) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  return null;
}
