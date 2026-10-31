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

const GUIDED = `GUIDED (retired): steps 12–20 in reading order. About every 4th step is ask (options + answer); none in the first 3.
Steps are a discriminated union:
- kind "reveal": required tip (Egyptian rt); no ask
- kind "ask": required ask { question (rt), options [{label rt, correct}], why?, hint? }; no tip`;

const SECTIONS = `SECTIONS (grammar pages): no steps, no asks, no chapters, no autoplay sequence.
Write:
1) the main rule block(s) listed for the preset
2) explain: Egyptian rich text (rt), 2–4 short sentences; highlight TL words with lang "tl"
3) End explain with 1–2 common-mistake pairs typical of Arabic/English speakers:
   each pair = TL segment with wrong:true (the bad form) → TL segment (the correct form) → short Egyptian why.
   Example shape: {text:"Sou cansado", lang:"tl", wrong:true} then {text:"Estou cansado", lang:"tl"} then {text:"الحالة بـ estar", lang:"eg"}
4) examples block when code cannot fill them (pattern: code fills 3–5 — you may leave a stub)
5) omit check / quiz ids — code assigns check from the questions job
Do NOT write steps. Conjugation dial/swap controls are allowed on conjugation pages.`;

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
    defaultMode: 'sections',
    blocks: 'compare → heading → vs_pairs → tip (optional examples)',
    targets:
      'TARGETS (block addresses only, never item ids): b1 (compare), b1/col:N, b1/entry:col:i; b3 (vs_pairs), b3/item:i for pair i.',
    modeRules: SECTIONS,
  },
  conjugation: {
    preset: 'conjugation',
    defaultMode: 'sections',
    blocks: 'table → examples → tip; controls (reveal_axis / swap) live in the examples part',
    targets:
      'TARGETS for controls: b1 (table), b1/col:N, b1/row:N, b1/cell:r:c. Omit practice.questions — code fills check later.',
    modeRules: SECTIONS,
  },
  pattern: {
    preset: 'pattern',
    defaultMode: 'sections',
    blocks: 'formula → examples → tip',
    targets:
      'TARGETS: b1 (formula whole), b1/item:i indexes formula.examples[]; b2/item:i on examples block items. Code fills ≥3 examples via patternFill.',
    modeRules: SECTIONS,
  },
  dictionary: {
    preset: 'dictionary',
    defaultMode: 'static',
    blocks:
      'cards = ALL day words (images; up to 20). Code overwrites the list — do not drop words to fit a count.',
    targets: 'Targets N/A (static). ItemViewer opens each card.',
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
    defaultMode: 'static',
    blocks:
      'dialogue only (6–10 lines {speaker, ids[]}; speaker ∈ chat_character + "learner"; today\'s phrases/patterns + recycle). Every said core phrase and each pattern (via a derived example id) must appear on a learner line. Do NOT force every noun into the dialogue — dictionary owns vocab. No tip, no cover, no steps. Code fills tl/ar from ids.',
    targets:
      'TARGETS: b1 (dialogue), b1/item:i indexes dialogue lines[] (0-based). Each line: {speaker, ids:[itemIds]} — never raw TL-only lines. Intro story has no steps/asks.',
    modeRules: STATIC,
  },
};

export function buildPageSystemPrompt(preset: Preset, mode?: Mode): string {
  const cat = PRESET_CATALOGS[preset] ?? PRESET_CATALOGS.phrases;
  const resolved = mode ?? modeForPreset(preset);
  const modeRules =
    resolved === 'sections'
      ? SECTIONS
      : resolved === 'guided'
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
- practice.questions / check / quiz: omit or leave [] — assemble/code fills check from questions by page_index.
- compare.columns use head (rt), group (a|b|c), entries [{ref, label}].
- Colors are meanings: group ∈ a,b,c,m,f,verb,prep,pron,neg,neutral.
- Mixed Arabic+TL text is rich text segments {text, lang: eg|ar|tl}.
- For sections: explain is required (Egyptian rt, 2–4 sentences) and must end with 1–2 wrong→right TL pairs (wrong:true on the bad form).
`.trim();
}
