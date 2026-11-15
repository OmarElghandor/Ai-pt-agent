import type { ScriptLine } from '../scriptChecks';
import type { ScriptPromptBrief } from './script';
import { levelTargetText } from './script';

/**
 * Library line / moment rewrite prompt (14d §2.2b, §4).
 * Rules only: no Portuguese or Arabic example content lives here.
 */
export const PROMPT_VERSION = 'library-rewrite-v1';

export function buildSystem(opts: { target_level: number }): string {
  return `You rewrite a small part of an existing listening script for a language-learning library. The target language is European Portuguese (pt-PT). The learners are Arabic speakers.

You are given the episode brief summary, a window of surrounding lines for context, and the exact lines to replace. Replace ONLY those lines.

LEVEL TARGET
${levelTargetText(opts.target_level)}

RULES
- Return exactly as many replacement lines as there are target lines, in the same order. Each replacement slots into the position of the target line it replaces; the context lines before and after stay unchanged, so the new lines must connect to them naturally.
- Every line has "speaker" (a voice_key copied exactly from the cast list), "tl" (correct pt-PT, plain text, no "/" characters), "ar" (a simple Modern Standard Arabic meaning, one sentence, required) and optionally "tl_f" (only on learner lines whose form differs by the speaker's gender; "tl" is the masculine form).
- Keep the formality of the surrounding lines. No real brand, shop, company or person names.
- Do not change "scene" or "moment"; the code keeps them.
- If a "must_say" phrase is given, it must appear word for word in one of the replacement lines.
- Follow the admin instruction when one is given, unless it breaks the rules above.

OUTPUT
Reply with one JSON object only:
{
  "lines": [
    {"speaker": "<voice_key>", "tl": "<line>", "tl_f": "<optional>", "ar": "<meaning>"}
  ]
}`;
}

export type RewriteContextLine = ScriptLine & { index: number };

export type RewritePromptInput = {
  brief: ScriptPromptBrief;
  /** Lines in the window (3 before the first target, 3 after the last). */
  context: RewriteContextLine[];
  /** Indices (into the full script) of the lines to replace. */
  targets: number[];
  mode: 'line' | 'moment';
  moment?: { id: string; eg: string; direction: string; must_say: string } | null;
  instruction?: string;
};

export function buildUser(input: RewritePromptInput): string {
  const targetSet = new Set(input.targets);
  const payload = {
    brief_summary: {
      type: input.brief.type,
      target_level: input.brief.target_level,
      setup_eg: input.brief.intro_eg,
      beats_in_order: input.brief.beats,
      cast: input.brief.cast.map((c) => ({
        voice_key: c.voice_key,
        role_eg: c.role_eg,
        learner: c.learner,
        gender: c.gender ?? null,
      })),
    },
    mode: input.mode,
    moment: input.moment
      ? {
          id: input.moment.id,
          situation_eg: input.moment.eg,
          direction: input.moment.direction,
          must_say: input.moment.must_say || null,
        }
      : null,
    window: input.context.map((l) => ({
      index: l.index,
      replace: targetSet.has(l.index),
      speaker: l.speaker,
      tl: l.tl,
      ...(l.tl_f ? { tl_f: l.tl_f } : {}),
      ar: l.ar,
    })),
    replace_indices: input.targets,
    replacement_count: input.targets.length,
    instruction: input.instruction?.trim() || null,
  };
  return `Rewrite the lines marked replace=true.

INPUT (JSON)
${JSON.stringify(payload, null, 2)}

Return exactly ${input.targets.length} replacement line${input.targets.length === 1 ? '' : 's'}.`;
}
