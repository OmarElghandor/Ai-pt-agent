import { requireAgentSecret } from '@/lib/agentAuth';
import { gradeAnswer } from '@/lib/grader/gradeAnswer';
import { GradeRequestSchema } from '@/lib/grader/schema';

export const runtime = 'nodejs';
export const maxDuration = 30;

/**
 * Stateless grader for Langify v2.
 * POST body: GradeRequest. Header: x-agent-secret.
 * Never writes learner progress. Rejects listening/reading skills (400).
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

  const parsed = GradeRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: 'invalid body', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  if (parsed.data.skill === 'listening' || parsed.data.skill === 'reading') {
    return Response.json(
      {
        error: 'listening and reading are graded by code in Langify; do not call /api/grade',
      },
      { status: 400 },
    );
  }

  const result = await gradeAnswer(parsed.data);
  return Response.json(result);
}
