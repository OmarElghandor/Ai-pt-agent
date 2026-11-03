import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'node:fs';
import type { ImageSpec } from './templates';

export type VisionQaResult = {
  ok: boolean;
  answers: {
    no_text: boolean;
    person_count_ok: boolean;
    subject_clear: boolean;
    style_ok: boolean;
    meaning_ok: boolean;
    interacting_ok: boolean;
  };
  raw: string;
};

function haikuModel(): string {
  return process.env.CLAUDE_HAIKU_MODEL?.trim() || 'claude-haiku-4-5';
}

/**
 * Haiku vision QA — style + meaning + interaction (for multi-person scenes).
 */
export async function visionQa(
  image: string | Buffer,
  spec: ImageSpec,
): Promise<VisionQaResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY or CLAUDE_API_KEY is not set');
  }

  const expectedPeople = spec.characters?.length ?? 0;
  const needsInteraction =
    expectedPeople >= 2 || spec.type === 'scene' || spec.type === 'story_panel';
  const intent = (spec.intent || spec.subject || '').trim();
  const buf = typeof image === 'string' ? readFileSync(image) : image;
  const b64 = buf.toString('base64');

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
{"no_text":true/false,"person_count_ok":true/false,"subject_clear":true/false,"style_ok":true/false,"meaning_ok":true/false,"interacting_ok":true/false}

1. no_text: Is there NO readable text, letters, or numbers in the image? (true = no text)
2. person_count_ok: Is the number of foreground people exactly ${expectedPeople}? (true if yes; if expected is 0, true only when no named people in the foreground)
3. subject_clear: Is the subject "${spec.subject}" clear without explanation?
4. style_ok: Does it look like a cream-background navy-outline educational cartoon?
5. meaning_ok: Does this image clearly show this intended meaning (not a symbolic shortcut): "${intent}"?
6. interacting_ok: ${
              needsInteraction
                ? 'Are the two people interacting with each other (eye contact or a gesture toward each other)? true only if yes — not side-by-side facing the camera, not one person walking past.'
                : 'Set true (interaction not required for this image).'
            }

JSON only.`,
          },
        ],
      },
    ],
  });

  const block = msg.content.find((b) => b.type === 'text');
  const raw = block && block.type === 'text' ? block.text : '';
  let answers = {
    no_text: false,
    person_count_ok: false,
    subject_clear: false,
    style_ok: false,
    meaning_ok: false,
    interacting_ok: false,
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

  const ok =
    answers.no_text &&
    answers.person_count_ok &&
    answers.subject_clear &&
    answers.style_ok &&
    answers.meaning_ok &&
    answers.interacting_ok;

  return { ok, answers, raw };
}
