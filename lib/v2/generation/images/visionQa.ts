import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'node:fs';
import type { ImageSpec } from './templates';
import { getImageTheme } from '@/lib/v2/images/themes';

export type VisionQaResult = {
  ok: boolean;
  answers: {
    no_text: boolean;
    person_count_ok: boolean;
    subject_clear: boolean;
    style_ok: boolean;
    meaning_ok: boolean;
    interacting_ok: boolean;
    /** Object-only: subject fills ≥ half the frame on plain white paper. */
    object_frame_ok?: boolean;
    /** Scene/action: colours match the assigned theme. */
    theme_ok?: boolean;
  };
  raw: string;
};

function haikuModel(): string {
  return process.env.CLAUDE_HAIKU_MODEL?.trim() || 'claude-haiku-4-5';
}

/**
 * Haiku vision QA — style + meaning; branched by image kind (19 §6).
 */
export async function visionQa(
  image: string | Buffer,
  spec: ImageSpec,
): Promise<VisionQaResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY or CLAUDE_API_KEY is not set');
  }

  const isObject = spec.type === 'object';
  const expectedPeople = isObject ? 0 : (spec.characters?.length ?? 0);
  const needsInteraction =
    !isObject &&
    (expectedPeople >= 2 ||
      spec.type === 'scene' ||
      spec.type === 'story_panel');
  const intent = (spec.intent || spec.subject || '').trim();
  const theme = !isObject ? getImageTheme(spec.theme) : null;
  const buf = typeof image === 'string' ? readFileSync(image) : image;
  const b64 = buf.toString('base64');

  const meaningQ = isObject
    ? `meaning_ok: Without any label, would a learner clearly say this picture shows "${intent || spec.subject}"? (true only if the meaning is unmistakable)`
    : `meaning_ok: Does this image clearly show this intended meaning (not a symbolic shortcut): "${intent}"?`;

  const styleQ = isObject
    ? `style_ok: Is it ink linework with soft watercolour washes on textured white paper (not photorealistic, not 3D, not cartoon sticker)?`
    : `style_ok: Is it ink linework with soft watercolour washes on textured paper, adult proportions (not photorealistic, not 3D, not childish cartoon)?`;

  const objectExtra = isObject
    ? `
7. object_frame_ok: Is the subject alone (no people, no hands), filling at least half the frame, on a plain white / paper background with no room or tabletop scene and no writing on packets or labels?
8. theme_ok: Set true (objects have no colour theme).`
    : `
7. object_frame_ok: Set true (not an object image).
8. theme_ok: ${
        theme
          ? `Do the colours and light roughly match this theme — colours: ${theme.colours}; light: ${theme.light}? true if yes.`
          : 'Set true (no theme assigned).'
      }`;

  const client = new Anthropic({ apiKey });
  const msg = await client.messages.create({
    model: haikuModel(),
    max_tokens: 450,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/png', data: b64 },
          },
          {
            type: 'text',
            text: `Answer these questions about the illustration with YES or NO only, as JSON:
{"no_text":true/false,"person_count_ok":true/false,"subject_clear":true/false,"style_ok":true/false,"meaning_ok":true/false,"interacting_ok":true/false,"object_frame_ok":true/false,"theme_ok":true/false}

1. no_text: Is there NO readable text, letters, or numbers in the image? (true = no text)
2. person_count_ok: Is the number of foreground people exactly ${expectedPeople}? (true if yes; if expected is 0, true only when there are no people and no hands in the foreground)
3. subject_clear: Is the subject "${spec.subject}" clear without explanation?
4. ${styleQ}
5. ${meaningQ}
6. interacting_ok: ${
              needsInteraction
                ? 'Are the two people interacting with each other (eye contact or a gesture toward each other)? true only if yes — not side-by-side facing the camera, not one person walking past.'
                : 'Set true (interaction not required for this image).'
            }
${objectExtra}

JSON only.`,
          },
        ],
      },
    ],
  });

  const block = msg.content.find((b) => b.type === 'text');
  const raw = block && block.type === 'text' ? block.text : '';
  let answers: VisionQaResult['answers'] = {
    no_text: false,
    person_count_ok: false,
    subject_clear: false,
    style_ok: false,
    meaning_ok: false,
    interacting_ok: false,
    object_frame_ok: false,
    theme_ok: false,
  };
  try {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start >= 0 && end > start) {
      answers = { ...answers, ...JSON.parse(raw.slice(start, end + 1)) };
    }
  } catch {
    // leave false
  }

  if (!intent) answers.meaning_ok = true;
  if (!needsInteraction) answers.interacting_ok = true;
  if (!isObject) answers.object_frame_ok = true;
  if (!theme) answers.theme_ok = true;

  const ok =
    answers.no_text &&
    answers.person_count_ok &&
    answers.subject_clear &&
    answers.style_ok &&
    answers.meaning_ok &&
    answers.interacting_ok &&
    Boolean(answers.object_frame_ok) &&
    Boolean(answers.theme_ok);

  return { ok, answers, raw };
}
