import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const PROMPT_DIR = path.join(process.cwd(), 'content', 'prompts', 'practice');

function load(name: string): string {
  return readFileSync(path.join(PROMPT_DIR, name), 'utf8');
}

function fileVersion(name: string): string {
  return createHash('sha1').update(load(name)).digest('hex').slice(0, 12);
}

export const PROMPT_VERSIONS = {
  spec: () => fileVersion('spec.md'),
  pack: () => fileVersion('pack.md'),
  reviewer: () => fileVersion('reviewer.md'),
  reaction: 'friendPrompt-p4',
  friend: 'friendPrompt-p5',
};

export function promptVersionsSnapshot(): Record<string, string> {
  return {
    spec: PROMPT_VERSIONS.spec(),
    pack: PROMPT_VERSIONS.pack(),
    reviewer: PROMPT_VERSIONS.reviewer(),
    reaction: PROMPT_VERSIONS.reaction,
    friend: PROMPT_VERSIONS.friend,
  };
}

export function buildSpecSystemPrompt(): string {
  return load('spec.md');
}

export function buildSpecUserPrompt(inputs: {
  slot?: {
    slot_id: string | null;
    pattern: string;
    situation_ar: string;
    cells: string[];
  };
  slotCellIds?: string[];
  topic: string;
  cefrLevel: string;
  depthTier: number;
  allowedWords: unknown;
  nucleus: unknown;
  introducedCells: unknown;
  existingLessons: unknown;
  registerMap: unknown;
}): string {
  const slot = inputs.slot || {
    slot_id: null,
    pattern: '',
    situation_ar: '',
    cells: inputs.slotCellIds || [],
  };
  return `Plan the conversation-practice lesson from these inputs.

SLOT:
${JSON.stringify(slot, null, 2)}

TOPIC: ${inputs.topic}
LEVEL: ${inputs.cefrLevel}
TIER: ${inputs.depthTier}

ALLOWED_WORDS:
${JSON.stringify(inputs.allowedWords, null, 2)}

NUCLEUS:
${JSON.stringify(inputs.nucleus, null, 2)}

INTRODUCED_CELLS:
${JSON.stringify(inputs.introducedCells, null, 2)}

EXISTING_LESSONS:
${JSON.stringify(inputs.existingLessons, null, 2)}

REGISTER_MAP:
${JSON.stringify(inputs.registerMap, null, 2)}

Return only one valid JSON object. No markdown fences. No trailing commas. Fully closed.`;
}

export function buildPackSystemPrompt(): string {
  return load('pack.md');
}

export function buildPackUserPrompt(inputs: {
  cefrLevel: string;
  spec: unknown;
  allowedWords: unknown;
  nucleus: unknown;
  cellForms: unknown;
}): string {
  return `Write the story-lesson pack.

LEVEL: ${inputs.cefrLevel}

SPEC:
${JSON.stringify(inputs.spec, null, 2)}

ALLOWED_WORDS:
${JSON.stringify(inputs.allowedWords, null, 2)}

NUCLEUS:
${JSON.stringify(inputs.nucleus, null, 2)}

CELL_FORMS:
${JSON.stringify(inputs.cellForms, null, 2)}

Return only one valid JSON object with keys script, intro_ar, intro_arz, character, grammar_card, scenes, beats, summary, closing_hook (pt, ar, arz), assessment. No markdown. No trailing commas. Fully closed.`;
}

export function buildReviewerSystemPrompt(): string {
  return load('reviewer.md');
}

export function buildReviewerUserPrompt(inputs: {
  cefrLevel: string;
  spec: unknown;
  pack: unknown;
  allowedWords: unknown;
  nucleus: unknown;
}): string {
  return `Review this story-lesson.

LEVEL: ${inputs.cefrLevel}

SPEC:
${JSON.stringify(inputs.spec, null, 2)}

PACK:
${JSON.stringify(inputs.pack, null, 2)}

ALLOWED_WORDS:
${JSON.stringify(inputs.allowedWords, null, 2)}

NUCLEUS:
${JSON.stringify(inputs.nucleus, null, 2)}

Return only one valid JSON object. No markdown fences. Fully closed.`;
}
