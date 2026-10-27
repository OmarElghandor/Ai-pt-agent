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
  };
  raw: string;
};

function haikuModel(): string {
  return process.env.CLAUDE_HAIKU_MODEL?.trim() || 'claude-haiku-4-5';
}

/**
 * Haiku vision QA — 4 yes/no checks from 03.
 */
export async function visionQa(
  imagePath: string,
  spec: ImageSpec,
): Promise<VisionQaResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY or CLAUDE_API_KEY is not set');
  }

  const expectedPeople = spec.characters?.length ?? 0;
  const buf = readFileSync(imagePath);
  const b64 = buf.toString('base64');

  const client = new Anthropic({ apiKey });
  const msg = await client.messages.create({
    model: haikuModel(),
    max_tokens: 400,
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
            text: `Answer these 4 questions about the illustration with YES or NO only, as JSON:
{"no_text":true/false,"person_count_ok":true/false,"subject_clear":true/false,"style_ok":true/false}

1. no_text: Is there NO readable text, letters, or numbers in the image? (true = no text)
2. person_count_ok: Is the number of foreground people exactly ${expectedPeople}? (true if yes; if expected is 0, true only when no named people in the foreground)
3. subject_clear: Is the subject "${spec.subject}" clear without explanation?
4. style_ok: Does it look like a cream-background navy-outline educational cartoon?

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

  const ok =
    answers.no_text &&
    answers.person_count_ok &&
    answers.subject_clear &&
    answers.style_ok;

  return { ok, answers, raw };
}
