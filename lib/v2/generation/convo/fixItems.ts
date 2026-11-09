import {
  containsItemSurface,
  type ValidateConvoPackOpts,
} from '@/lib/v2/convo/pack/validate';
import type { ConvoItemBank, ConvoPackData } from '@/lib/v2/convo/pack/schema';

/**
 * Deterministic fixes so generated groups can pass the pack validator:
 * choice lines must contain the item surface; open lines must not.
 */
export function fixGeneratedItemBanks(
  items: Record<string, ConvoItemBank>,
  opts: ValidateConvoPackOpts,
): Record<string, ConvoItemBank> {
  const surfaceById = new Map(opts.itemSurfaces.map((s) => [s.id, s.tl]));
  const out: Record<string, ConvoItemBank> = {};

  for (const [itemId, bank] of Object.entries(items)) {
    const itemTl = surfaceById.get(itemId) ?? '';
    const choice_questions = bank.choice_questions.map((q, qi) => {
      let tl = q.tl;
      if (itemTl && !containsItemSurface(tl, itemTl)) {
        const other =
          q.option_ids.find((id) => id !== itemId) ??
          q.option_ids[1] ??
          'outra';
        const otherTl = surfaceById.get(other) ?? other;
        // Use a short speakable form: strip articles for display if long.
        const a = itemTl.replace(/^(o|a|os|as|à|ao)\s+/i, '');
        const b = otherTl.replace(/^(o|a|os|as|à|ao)\s+/i, '');
        tl = `${a} ou ${b}?`;
        if (!containsItemSurface(tl, itemTl)) {
          tl = `${itemTl}?`;
        }
      }
      return {
        ...q,
        id: q.id || `q_${itemId.replace(/\W+/g, '_')}_choice_${qi}`,
        tl,
        correct_id: itemId,
        option_ids:
          q.option_ids.includes(itemId) ? q.option_ids : [itemId, ...q.option_ids].slice(0, 3),
      };
    });

    const open_questions = bank.open_questions.map((q, qi) => {
      let tl = q.tl;
      if (itemTl && containsItemSurface(tl, itemTl)) {
        tl = 'E agora?';
      }
      return {
        ...q,
        id: q.id || `q_${itemId.replace(/\W+/g, '_')}_open_${qi}`,
        item_id: itemId,
        tl,
        help_ladder: q.help_ladder ?? {
          step1_reask_tl: 'Como?',
          step2_hint_eg: `بتبدأ بـ ${itemTl.slice(0, 3)}…`,
        },
      };
    });

    // Guarantee minima.
    const choices =
      choice_questions.length > 0
        ? choice_questions
        : [
            {
              id: `q_${itemId.replace(/\W+/g, '_')}_choice`,
              tl: itemTl ? `${itemTl}?` : 'Isto?',
              option_ids: [itemId, itemId],
              correct_id: itemId,
            },
          ];
    // option_ids need 2 distinct — fix if duplicated
    for (const c of choices) {
      if (new Set(c.option_ids).size < 2) {
        const distractor =
          Object.keys(items).find((id) => id !== itemId) ?? `${itemId}.alt`;
        c.option_ids = [itemId, distractor];
      }
    }
    const opens =
      open_questions.length > 0
        ? open_questions
        : [
            {
              id: `q_${itemId.replace(/\W+/g, '_')}_open`,
              tl: 'E agora?',
              item_id: itemId,
              help_ladder: {
                step1_reask_tl: 'Como?',
                step2_hint_eg: `بتبدأ بـ ${itemTl.slice(0, 3)}…`,
              },
            },
          ];

    out[itemId] = {
      ...bank,
      coach_intro_eg:
        bank.coach_intro_eg?.trim() ||
        (itemTl ? `عشان نقول كده بنقول ${itemTl}` : 'قولها كده'),
      choice_questions: choices,
      open_questions: opens,
      common_mistakes: bank.common_mistakes ?? [],
    };
  }
  return out;
}

export function ensureRecapCoverage(
  pack: Pick<ConvoPackData, 'groups' | 'recap'>,
): ConvoPackData['recap'] {
  const expected = new Set(pack.groups.flatMap((g) => g.item_ids));
  const questions = [...(pack.recap?.questions ?? [])];
  const have = new Set(questions.map((q) => q.item_id));
  for (const id of expected) {
    if (!have.has(id)) {
      questions.push({
        id: `recap_auto_${id.replace(/[^a-z0-9]+/gi, '_')}`,
        tl: 'E depois?',
        item_id: id,
      });
    }
  }
  return {
    framing_eg: pack.recap?.framing_eg,
    questions,
  };
}
