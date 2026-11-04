import type { Issue } from '@/lib/v2/content/validate';
import {
  findBrazilianLeak,
  wordCount,
  CONVO_REACTION_MAX_WORDS,
} from '@/lib/v2/convo/output/checks';
import { buildConvoAcceptedForms } from '@/lib/v2/convo/grade/accepted';
import {
  validateConvoPack,
  type ValidateConvoPackOpts,
} from '@/lib/v2/convo/pack/validate';
import type {
  ConvoItemBank,
  ConvoPackData,
} from '@/lib/v2/convo/pack/schema';
import {
  ensureRecapCoverage,
  fixGeneratedItemBanks,
} from './fixItems';

export type AssembleConvoResult = {
  pack: ConvoPackData;
  accepted_forms: Record<string, string[]>;
  issues: Issue[];
  warnings: string[];
  ok: boolean;
  dropped_questions: string[];
};

function collectCharacterLines(pack: ConvoPackData): Array<{
  path: string;
  tl: string;
}> {
  const out: Array<{ path: string; tl: string }> = [];
  out.push({ path: 'opening.tl', tl: pack.opening.tl });
  out.push({ path: 'closing.tl', tl: pack.closing.tl });
  out.push({ path: 'bridge.tl', tl: pack.bridge.tl });
  for (const q of pack.recap.questions) {
    out.push({ path: `recap.${q.id}`, tl: q.tl });
  }
  for (const [itemId, bank] of Object.entries(pack.items)) {
    for (const [i, q] of bank.choice_questions.entries()) {
      out.push({ path: `items.${itemId}.choice[${i}]`, tl: q.tl });
    }
    for (const [i, q] of bank.open_questions.entries()) {
      out.push({ path: `items.${itemId}.open[${i}]`, tl: q.tl });
      if (q.help_ladder?.step1_reask_tl) {
        out.push({
          path: `items.${itemId}.open[${i}].reask`,
          tl: q.help_ladder.step1_reask_tl,
        });
      }
    }
  }
  return out;
}

/**
 * Drop offending character questions that fail Brazilian / length checks.
 * Keeps ≥1 choice and ≥1 open per item when possible.
 */
function dropBadQuestions(
  items: Record<string, ConvoItemBank>,
  warnings: string[],
): { items: Record<string, ConvoItemBank>; dropped: string[] } {
  const dropped: string[] = [];
  const next: Record<string, ConvoItemBank> = {};

  for (const [itemId, bank] of Object.entries(items)) {
    const choices = bank.choice_questions.filter((q) => {
      const br = findBrazilianLeak(q.tl);
      const long = wordCount(q.tl) > CONVO_REACTION_MAX_WORDS;
      if (br || long) {
        dropped.push(q.id);
        warnings.push(
          `dropped choice ${q.id}: ${br ? `brazilian:${br}` : 'length'}`,
        );
        return false;
      }
      return true;
    });
    const opens = bank.open_questions.filter((q) => {
      const br = findBrazilianLeak(q.tl);
      const long = wordCount(q.tl) > CONVO_REACTION_MAX_WORDS;
      if (br || long) {
        dropped.push(q.id);
        warnings.push(
          `dropped open ${q.id}: ${br ? `brazilian:${br}` : 'length'}`,
        );
        return false;
      }
      return true;
    });
    next[itemId] = {
      ...bank,
      choice_questions: choices.length > 0 ? choices : bank.choice_questions.slice(0, 1),
      open_questions: opens.length > 0 ? opens : bank.open_questions.slice(0, 1),
    };
    // If we had to restore a bad one to keep minima, warn.
    if (choices.length === 0 && bank.choice_questions[0]) {
      warnings.push(
        `kept failing choice ${bank.choice_questions[0].id} to satisfy choice_min`,
      );
    }
    if (opens.length === 0 && bank.open_questions[0]) {
      warnings.push(
        `kept failing open ${bank.open_questions[0].id} to satisfy open_min`,
      );
    }
  }
  return { items: next, dropped };
}

/**
 * Code assemble: accepted forms, recap coverage, help-ladder readiness,
 * line checks with question drops, full pack validate.
 */
export function assembleConvoPack(
  raw: Partial<ConvoPackData> & Record<string, unknown>,
  opts: ValidateConvoPackOpts,
): AssembleConvoResult {
  const warnings: string[] = [];
  const surfaces = opts.itemSurfaces;

  let items = fixGeneratedItemBanks(
    (raw.items as Record<string, ConvoItemBank>) ?? {},
    opts,
  );
  const droppedPass1 = dropBadQuestions(items, warnings);
  items = fixGeneratedItemBanks(droppedPass1.items, opts);
  // One retry pass after fixes.
  const droppedPass2 = dropBadQuestions(items, warnings);
  items = fixGeneratedItemBanks(droppedPass2.items, opts);

  const groups = (raw.groups as ConvoPackData['groups']) ?? [];
  const pack: ConvoPackData = {
    pack_id: String(raw.pack_id ?? ''),
    day: Number(raw.day),
    target_lang: String(raw.target_lang ?? 'pt-PT'),
    scene: raw.scene as ConvoPackData['scene'],
    visual: raw.visual as ConvoPackData['visual'],
    groups,
    items,
    recap: ensureRecapCoverage({
      groups,
      recap: raw.recap as ConvoPackData['recap'],
    }),
    opening: (raw.opening as ConvoPackData['opening']) ?? { tl: 'Olá!' },
    closing: (raw.closing as ConvoPackData['closing']) ?? {
      tl: 'Obrigada!',
    },
    bridge: (raw.bridge as ConvoPackData['bridge']) ?? {
      tl: 'Queres continuar?',
    },
  };

  // Map open questions without map_step: attach first route step using that item.
  if (pack.visual.type === 'map') {
    for (const [itemId, bank] of Object.entries(pack.items)) {
      for (const q of bank.open_questions) {
        if (!q.map_step) {
          const step = pack.visual.route.find((s) => s.item_id === itemId);
          if (step) q.map_step = step.step_id;
        }
      }
    }
  }

  // Ensure every open has a choice sibling (help step 3).
  for (const [itemId, bank] of Object.entries(pack.items)) {
    if (bank.open_questions.length > 0 && bank.choice_questions.length === 0) {
      const tl = surfaces.find((s) => s.id === itemId)?.tl ?? itemId;
      bank.choice_questions.push({
        id: `q_${itemId.replace(/\W+/g, '_')}_choice_asm`,
        tl: `${tl}?`,
        option_ids: [itemId, itemId],
        correct_id: itemId,
      });
      warnings.push(`assemble added choice for ${itemId} (help step 3)`);
    }
  }
  pack.items = fixGeneratedItemBanks(pack.items, opts);

  const accepted_forms: Record<string, string[]> = {};
  for (const itemId of Object.keys(pack.items)) {
    const tl = surfaces.find((s) => s.id === itemId)?.tl ?? '';
    accepted_forms[itemId] = buildConvoAcceptedForms(tl);
  }

  for (const line of collectCharacterLines(pack)) {
    const br = findBrazilianLeak(line.tl);
    if (br) warnings.push(`${line.path}: brazilian ${br}`);
    if (wordCount(line.tl) > CONVO_REACTION_MAX_WORDS) {
      warnings.push(`${line.path}: length ${wordCount(line.tl)}`);
    }
  }

  const validated = validateConvoPack(pack, opts);
  return {
    pack: validated.pack ?? pack,
    accepted_forms,
    issues: validated.issues,
    warnings,
    ok: validated.ok,
    dropped_questions: [...droppedPass1.dropped, ...droppedPass2.dropped],
  };
}
