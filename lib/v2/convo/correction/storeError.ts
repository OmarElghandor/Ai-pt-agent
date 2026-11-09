import { connectMongo, mongoConfigured } from '@/lib/mongo';
import { V2ErrorModel } from '@/lib/v2/mongo/models';
import type { FreeTextCorrection } from '@/lib/v2/grader';

/**
 * Append a conversation free-text correction to v2_errors (K5).
 * Only severity=error. Never throws — turn must not fail on store errors.
 */
export async function appendConvoCorrectionError(opts: {
  userId: string;
  correction: FreeTextCorrection;
  itemId?: string | null;
  toolId?: string;
}): Promise<void> {
  const { correction } = opts;
  if (correction.severity !== 'error' || !correction.main_error) return;
  if (!mongoConfigured()) return;

  const type = correction.main_error.type;
  const slash = type.indexOf('/');
  const category = (slash >= 0 ? type.slice(0, slash) : 'grammar') as
    | 'grammar'
    | 'vocabulary'
    | 'spelling'
    | 'pronunciation';
  const scope = slash >= 0 ? type.slice(slash + 1) : type;

  try {
    await connectMongo();
    await V2ErrorModel().create({
      user_id: opts.userId,
      item_id: opts.itemId || undefined,
      tool_id: opts.toolId ?? 'convo',
      skill: 'speaking',
      category,
      scope,
      wrong: correction.main_error.from,
      right: correction.main_error.to,
      at: new Date(),
    });
  } catch (err) {
    console.error('[convo] v2_errors append failed', err);
  }
}
