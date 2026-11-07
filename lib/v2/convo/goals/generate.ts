import { connectMongo, mongoConfigured } from '@/lib/mongo';
import { V2ConvoGoalBankModel } from '@/lib/v2/mongo/models';
import { keywordsFromExamples } from './keywords';
import type { ConvoGoal, ConvoGoalBank } from './types';
import { validateGoals } from './validate';

export type GoalGenerator = (input: {
  topicSlug: string;
  topicLabel: string;
  targetLang: string;
}) => Promise<ConvoGoal[]>;

function slugifyTopic(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 48) || 'topic';
}

/** Extract a topic label from «Quero falar de X» / chip «Sobre X». */
export function extractTopicLabel(text: string): string | null {
  const t = text.trim();
  if (!t) return null;
  const m =
    t.match(
      /(?:quero\s+falar\s+(?:de|sobre)|vamos\s+falar\s+(?:de|sobre)|sobre)\s+(.+?)[.!?]*$/i,
    ) ?? t.match(/^sobre\s+(.+)$/i);
  if (!m?.[1]) return null;
  const label = m[1].replace(/^o\s+meu\s+/i, '').replace(/^a\s+/i, '').trim();
  return label || null;
}

export function topicSlugFromLabel(label: string): string {
  return slugifyTopic(label);
}

/** Deterministic stub generator for tests / offline fallback. */
export function stubGenerateGoals(input: {
  topicSlug: string;
  topicLabel: string;
}): ConvoGoal[] {
  const label = input.topicLabel.trim() || input.topicSlug;
  const base = [
    {
      intent_en: `say they like ${label}`,
      intent_eg: `يقول إنه بيحب ${label}`,
      examples: [`Gosto de ${label}.`, `Eu gosto de ${label}.`],
      frame: `Gosto de ___.`,
      eg: `قول بتحب إيه`,
      chips: [`Gosto de ${label}.`, 'Gosto muito.', 'Não gosto.'],
    },
    {
      intent_en: `say why ${label} matters to them`,
      intent_eg: `يقول ليه ${label} مهم`,
      examples: [`Porque é fixe.`, `Porque gosto.`],
      frame: `Porque ___.`,
      eg: `قول ليه`,
      chips: ['Porque é fixe.', 'Porque é importante.'],
    },
    {
      intent_en: `ask the character about ${label}`,
      intent_eg: `يسألها عن ${label}`,
      examples: [`E tu?`, `Gostas de ${label}?`],
      frame: `Gostas de ___?`,
      eg: `اسألها بتحب؟`,
      chips: [`Gostas de ${label}?`, 'E tu?'],
    },
    {
      intent_en: `say how often they do something related`,
      intent_eg: `يقول بيعملها كل قد إيه`,
      examples: ['Às vezes.', 'Todos os dias.', 'Ao fim de semana.'],
      frame: `___ .`,
      eg: `قول كل قد إيه`,
      chips: ['Às vezes.', 'Todos os dias.', 'Nunca.'],
    },
    {
      intent_en: `wrap up the ${label} chat`,
      intent_eg: `يخلّص الكلام عن الموضوع`,
      examples: ['Fixe!', 'Obrigado.', 'Até logo!'],
      frame: `___!`,
      eg: `قول خلاص أو شكراً`,
      chips: ['Fixe!', 'Obrigado.', 'Até logo!'],
    },
  ];
  return base.map((b, i) => ({
    id: `${input.topicSlug}.g${i + 1}`,
    intent_eg: b.intent_eg,
    intent_en: b.intent_en,
    examples_tl: b.examples,
    keywords: keywordsFromExamples(b.examples),
    help: { frame_tl: b.frame, eg: b.eg, chips: b.chips },
  }));
}

export async function getCachedGoalBank(
  targetLang: string,
  topicSlug: string,
): Promise<ConvoGoalBank | null> {
  if (!mongoConfigured()) return null;
  await connectMongo();
  const doc = await V2ConvoGoalBankModel()
    .findOne({ target_lang: targetLang, topic_slug: topicSlug })
    .lean();
  if (!doc || !Array.isArray((doc as { goals?: unknown }).goals)) return null;
  const goals = (doc as { goals: ConvoGoal[] }).goals;
  const { ok } = validateGoals(goals);
  if (!ok) return null;
  return {
    source: 'generated',
    topic_id: topicSlug,
    goals,
    suggested_words: [],
    scene: {
      character_id: 'ines',
      time_of_day: 'morning',
    },
  };
}

export async function saveGoalBankCache(opts: {
  targetLang: string;
  topicSlug: string;
  goals: ConvoGoal[];
}): Promise<void> {
  if (!mongoConfigured()) return;
  await connectMongo();
  await V2ConvoGoalBankModel().findOneAndUpdate(
    { target_lang: opts.targetLang, topic_slug: opts.topicSlug },
    {
      $set: {
        target_lang: opts.targetLang,
        topic_slug: opts.topicSlug,
        goals: opts.goals,
      },
    },
    { upsert: true },
  );
}

/**
 * Load cached goals or generate once and cache (shared across users).
 */
export async function ensureGeneratedGoalBank(opts: {
  topicLabel: string;
  targetLang?: string;
  generator?: GoalGenerator;
}): Promise<{ bank: ConvoGoalBank; fromCache: boolean }> {
  const targetLang = opts.targetLang ?? 'pt-PT';
  const topicSlug = topicSlugFromLabel(opts.topicLabel);
  const cached = await getCachedGoalBank(targetLang, topicSlug);
  if (cached) return { bank: cached, fromCache: true };

  const generator = opts.generator ?? (async (input) => stubGenerateGoals(input));
  let goals = await generator({
    topicSlug,
    topicLabel: opts.topicLabel,
    targetLang,
  });
  const { ok, issues } = validateGoals(goals);
  if (!ok) {
    goals = stubGenerateGoals({ topicSlug, topicLabel: opts.topicLabel });
    const again = validateGoals(goals);
    if (!again.ok) {
      throw new Error(
        `Generated goals invalid: ${issues.map((i) => i.message).join('; ')}`,
      );
    }
  }
  await saveGoalBankCache({ targetLang, topicSlug, goals });
  return {
    bank: {
      source: 'generated',
      topic_id: topicSlug,
      goals,
      suggested_words: [],
      scene: { character_id: 'ines', time_of_day: 'morning' },
    },
    fromCache: false,
  };
}

/** In-memory cache for tests (no Mongo). */
const memoryBanks = new Map<string, ConvoGoal[]>();

export function memoryCacheKey(lang: string, slug: string): string {
  return `${lang}::${slug}`;
}

export function resetMemoryGoalBanks(): void {
  memoryBanks.clear();
}

export async function ensureGeneratedGoalBankMemory(opts: {
  topicLabel: string;
  targetLang?: string;
  generator?: GoalGenerator;
}): Promise<{ bank: ConvoGoalBank; fromCache: boolean }> {
  const targetLang = opts.targetLang ?? 'pt-PT';
  const topicSlug = topicSlugFromLabel(opts.topicLabel);
  const key = memoryCacheKey(targetLang, topicSlug);
  const hit = memoryBanks.get(key);
  if (hit) {
    return {
      bank: {
        source: 'generated',
        topic_id: topicSlug,
        goals: hit,
        suggested_words: [],
        scene: { character_id: 'ines', time_of_day: 'morning' },
      },
      fromCache: true,
    };
  }
  const generator =
    opts.generator ?? (async (input) => stubGenerateGoals(input));
  const goals = await generator({
    topicSlug,
    topicLabel: opts.topicLabel,
    targetLang,
  });
  memoryBanks.set(key, goals);
  return {
    bank: {
      source: 'generated',
      topic_id: topicSlug,
      goals,
      suggested_words: [],
      scene: { character_id: 'ines', time_of_day: 'morning' },
    },
    fromCache: false,
  };
}
