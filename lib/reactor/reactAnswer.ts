import { generateText } from 'ai';
import { getChatModel } from '@/lib/model';
import { buildV2ReactorPrompt } from './buildReactPrompt';
import {
  ReactRequestSchema,
  type ReactRequest,
  type ReactResponse,
} from './schema';

/**
 * Stateless reactor. SOURCE is always treated as code.
 * Never writes learner progress.
 */
export async function reactAnswer(raw: unknown): Promise<ReactResponse> {
  const parsed = ReactRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      text: '',
      mode: 'practice',
      skill: 'speaking',
      verdict: 'unclear',
    };
  }
  const req = parsed.data;

  if (req.mode === 'open_question' && req.verdict === 'correct') {
    return { text: '', mode: req.mode, skill: req.skill, verdict: req.verdict };
  }
  if (
    req.mode === 'assessment' &&
    req.verdict !== 'correct' &&
    req.verdict !== 'near_miss'
  ) {
    return { text: '', mode: req.mode, skill: req.skill, verdict: req.verdict };
  }

  try {
    const result = await generateText({
      model: getChatModel(),
      prompt: buildV2ReactorPrompt(req),
      temperature: 0.6,
      maxOutputTokens: 200,
    });
    return {
      text: sanitizeReactorText(result.text),
      mode: req.mode,
      skill: req.skill,
      verdict: req.verdict,
    };
  } catch {
    return fallbackReact(req);
  }
}

export function sanitizeReactorText(text: string): string {
  const trimmed = String(text || '').trim();
  // Drop any accidental VERDICT line the model might still emit.
  return trimmed
    .split('\n')
    .filter((line) => !/^VERDICT\s*:/i.test(line.trim()))
    .join('\n')
    .trim();
}

function fallbackReact(req: ReactRequest): ReactResponse {
  if (req.verdict === 'correct' || req.verdict === 'near_miss') {
    const name = req.character_name || 'Rita';
    return {
      text: `<character name="${name}"><pt>Ok.</pt><ar>تمام.</ar></character>`,
      mode: req.mode,
      skill: req.skill,
      verdict: req.verdict,
    };
  }
  const corrected = req.corrected_tl || '';
  const ar =
    req.main_error?.feedback_ar ||
    (req.verdict === 'arabic_only'
      ? 'حلو! قولها بالبرتغالي.'
      : 'جرّب تاني.');
  return {
    text: `<coach><ar>${ar}</ar><arz>${ar}</arz>${corrected ? `<pt>${corrected}</pt>` : ''}</coach>`,
    mode: req.mode,
    skill: req.skill,
    verdict: req.verdict,
  };
}
