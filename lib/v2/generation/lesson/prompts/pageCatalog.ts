import type { Mode, Preset } from '@/lib/v2/content/page';
import { modeForPreset } from '@/lib/v2/content/page';
import { CORE_PROMPT } from './core';

export type PresetCatalog = {
  preset: Preset;
  defaultMode: Mode;
  blocks: string;
  /** Target grammar for this preset's blocks (block addresses only). */
  targets: string;
  modeRules: string;
};

const GUIDED = `GUIDED: steps 12–20 in reading order. About every 4th step is ask (options + answer); none in the first 3.
Steps are a discriminated union:
- kind "reveal": required tip (Egyptian rt); no ask
- kind "ask": required ask { question (rt), options [{label rt, correct}], why?, hint? }; no tip`;

const EXPLORE = `EXPLORE: controls required (reveal_axis / swap / unlock). axis is "rows" or "cols"; reveal_axis.tips = array of rt; swap.options = string[]; control ids c1, c2, …`;

const STATIC = `STATIC: no steps, no controls. Everything visible.`;

export const PRESET_CATALOGS: Record<Preset, PresetCatalog> = {
  phrases: {
    preset: 'phrases',
    defaultMode: 'static',
    blocks: 'cards (≈6, icons) → tip',
    targets: 'Targets N/A (static). If ever guided: b1 (cards), b1/item:i for card i.',
    modeRules: STATIC,
  },
  compare: {
    preset: 'compare',
    defaultMode: 'guided',
    blocks: 'compare → heading → vs_pairs → tip',
    targets:
      'TARGETS (block addresses only, never item ids): b1 (compare), b1/col:N, b1/entry:col:i; b3 (vs_pairs), b3/item:i for pair i.',
    modeRules: GUIDED,
  },
  conjugation: {
    preset: 'conjugation',
    defaultMode: 'explore',
    blocks: 'table → practice → examples → tip',
    targets:
      'TARGETS for controls: b1 (table), b1/col:N, b1/row:N, b1/cell:r:c. practice.questions left empty — code fills them later.',
    modeRules: EXPLORE,
  },
  pattern: {
    preset: 'pattern',
    defaultMode: 'guided',
    blocks: 'formula → examples → practice → tip',
    targets:
      'TARGETS: b1 (formula whole), b1/item:i indexes formula.examples[]; b2/item:i on examples block items. practice.questions left empty — code fills them later.',
    modeRules: GUIDED,
  },
  dictionary: {
    preset: 'dictionary',
    defaultMode: 'static',
    blocks: 'cards (6–12, images)',
    targets: 'Targets N/A (static).',
    modeRules: STATIC,
  },
  scene: {
    preset: 'scene',
    defaultMode: 'static',
    blocks: 'scene (optional tip)',
    targets: 'Targets N/A (static). If guided: b1/item:i for hotspot i.',
    modeRules: STATIC,
  },
  story: {
    preset: 'story',
    defaultMode: 'guided',
    blocks:
      'dialogue (4–6 lines {speaker, ids[]}; speaker ∈ cast + "learner"; today + recycle) → optional tip; cover: tl for self-test. Code fills tl/ar from ids.',
    targets:
      'TARGETS: b1 (dialogue), b1/item:i indexes dialogue lines[] (0-based). Each line: {speaker, ids:[itemIds]} — never raw TL-only lines. cover hides tl.',
    modeRules: GUIDED,
  },
};

export function buildPageSystemPrompt(preset: Preset, mode?: Mode): string {
  const cat = PRESET_CATALOGS[preset] ?? PRESET_CATALOGS.phrases;
  const resolved = mode ?? modeForPreset(preset);
  const modeRules =
    resolved === 'guided'
      ? GUIDED
      : resolved === 'explore'
        ? EXPLORE
        : STATIC;

  return `${CORE_PROMPT}

JOB: ONE PAGE
Write only this page. Blocks never nest. Blocks hold item ids, not raw TL text (except labels in compare entries).
Mode is fixed by code for this preset (${resolved}) — do not invent another mode.

REQUIRED OUTPUT: { "page": {...}, "taught_eg"?: string }.

PRESET ${preset}: blocks in order — ${cat.blocks}
MODE ${resolved}:
${modeRules}

${cat.targets}

COMMON
- Every block needs id b1, b2, …
- Use ONLY allowed item ids (plus verb.<lemma>:<tense>:<person>).
- Every introduces id MUST appear on the page.
- practice.questions: omit or leave [] — assemble fills question ids by page_index.
- compare.columns use head (rt), group (a|b|c), entries [{ref, label}].
- Colors are meanings: group ∈ a,b,c,m,f,verb,prep,pron,neg,neutral.
- Mixed Arabic+TL text is rich text segments {text, lang: eg|ar|tl}.
`.trim();
}
