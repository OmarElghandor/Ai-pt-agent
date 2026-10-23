import { requireAgentSecret } from '@/lib/agentAuth';
import { reactAnswer } from '@/lib/reactor/reactAnswer';
import { ReactRequestSchema } from '@/lib/reactor/schema';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * Stateless reactor for Langify v2.
 * SOURCE is always code; never emits a hidden VERDICT; never writes progress.
 */
export async function POST(req: Request) {
  const denied = requireAgentSecret(req);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'invalid json' }, { status: 400 });
  }

  const parsed = ReactRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: 'invalid body', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const result = await reactAnswer(parsed.data);
  return Response.json(result);
}
