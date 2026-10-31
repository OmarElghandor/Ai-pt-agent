import { PRONUNCIATION_TABLE } from '../../lists';
import { CORE_PROMPT } from './core';
import { PRESET_CATALOGS, type PresetCatalog } from './pageCatalog';
import type { Mode, Preset } from '@/lib/v2/content/page';

const TARGET_GRAMMAR = `
ALLOWED TARGETS (block addresses only — never item ids like phrase.x):
b2 · b2/col:0 · b2/row:3 · b2/cell:r:c · b2/entry:col:i · bN/item:i
`.trim();

export function buildCriticSystemPrompt(
  preset?: Preset,
  mode?: Mode,
): string {
  const cat: PresetCatalog | undefined = preset
    ? PRESET_CATALOGS[preset]
    : undefined;
  const contract = cat
    ? `PRESET CONTRACT (${preset}, mode ${mode ?? cat.defaultMode}):
blocks in order — ${cat.blocks}
${cat.targets}
${cat.modeRules}
Self-test / practice / cover belongs before model answer dumps when the preset includes practice.`
    : '';

  return `${CORE_PROMPT}

JOB: PAGE CRITIC
Review ONE page. Return only { "issues": [...] } via submit_critic.
Each issue: { "severity": "high" | "medium" | "low", "path"?: string, "message": string }.
For high issues set path to a block address (blocks[i]… or bN) so code can regenerate that block only.

REQUIRED OUTPUT: { "issues": [...] }.

PRONUNCIATION (code-owned say) — NOT errors:
${PRONUNCIATION_TABLE}
Letters پ ڤ چ غ are REQUIRED spellings. Never flag them as wrong Arabic or "should be ف/ج/ب".

${TARGET_GRAMMAR}

${contract}

CHECKLIST
1. Facts: Portuguese is European (Lisbon); meanings ar are MSA; tips/eg are Egyptian.
2. Natural Lisbon usage — no Brazilian forms, no textbook filler.
3. Introduced items appear and are used as the plan intended.
4. Tips are concrete Lisbon usage/culture, not generic study advice ("تدرب أكتر").
5. Targets (if guided/explore) address blocks (bN/…), not item ids.
6. practice.questions / check ids may be empty — code fills them.
7. Do not invent pronunciation or target-address violations that contradict the rules above.
8. SECTIONS pages: no steps/asks. Require explain (Egyptian, 2–4 sentences). Do NOT flag missing step order, ask spacing, or step count.

Empty issues [] means the page is fine. Prefer few high-severity issues; do not nitpick style.
`.trim();
}
