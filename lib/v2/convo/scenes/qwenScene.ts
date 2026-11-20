import { generateText } from 'ai';
import { getChatModel } from '@/lib/model';
import type { ConvoGoal, ConvoGoalBank } from '@/lib/v2/convo/goals/types';
import { goalOptionAnswerWords, isAnswerWordInGoal } from './closeButWrong';
import { normalizeSceneText } from './weak';

export const SCENE_QWEN_TIMEOUT_MS = 4_000;

export type SceneQwenResult = {
  kind: 'answer' | 'side_question' | 'other';
  goal: string | null;
  option: string | null;
  corrected: string;
  has_error: boolean;
  note_eg: string;
  /** Expected answer word from the options (batch-rp-4). */
  answer_word?: string | null;
  /** True when the learner misspelled that word (batch-rp-4). */
  answer_word_misspelled?: boolean;
};

const SYSTEM =
  'You read one message from a beginner learner of European Portuguese in a role-play. Return JSON only.';

const RULES = [
  'fix every mistake (spelling, accents, missing or wrong words), and keep the learner\'s words where they are correct;',
  'when the learner\'s meaning matches an example, prefer the example\'s wording (quero → queria);',
  'has_error is false if the only differences are capital letters or final punctuation;',
  'answer_word is the correctly spelled expected word from the current goal\'s option keywords/examples that the learner was answering;',
  'answer_word_misspelled is true only when that word itself is misspelled in the learner message (not merely missing accents).',
].join(' ');

export function buildSceneQwenCandidates(
  bank: ConvoGoalBank,
  currentGoalId: string | null,
): ConvoGoal[] {
  const goals = bank.goals;
  const currentIdx = goals.findIndex((g) => g.id === currentGoalId);
  if (currentIdx < 0) return [];

  const current = goals[currentIdx]!;
  const out: ConvoGoal[] = [current];
  if (current.farewell) return out;

  let added = 0;
  for (let i = currentIdx + 1; i < goals.length && added < 2; i++) {
    const g = goals[i]!;
    if (g.farewell) continue;
    out.push(g);
    added++;
  }
  return out;
}

/** Candidates: current + next 2 non-farewell (+ farewell only if current). Open-goal aware. */
export function sceneQwenCandidatesFromOpen(
  openGoals: ConvoGoal[],
): ConvoGoal[] {
  if (!openGoals.length) return [];
  const current = openGoals[0]!;
  const out: ConvoGoal[] = [current];
  if (current.farewell) return out;
  let added = 0;
  for (let i = 1; i < openGoals.length && added < 2; i++) {
    const g = openGoals[i]!;
    if (g.farewell) continue;
    out.push(g);
    added++;
  }
  return out;
}

function emptyExtras(raw: SceneQwenResult): Pick<
  SceneQwenResult,
  'answer_word' | 'answer_word_misspelled'
> {
  return {
    answer_word: raw.answer_word ?? null,
    answer_word_misspelled: Boolean(raw.answer_word_misspelled),
  };
}

export function validateSceneQwenResult(
  raw: SceneQwenResult | null | undefined,
  candidates: ConvoGoal[],
): SceneQwenResult | null {
  if (!raw) return null;
  if (raw.kind === 'side_question' || raw.kind === 'other') {
    return {
      kind: raw.kind,
      goal: null,
      option: null,
      corrected: raw.corrected ?? '',
      has_error: Boolean(raw.has_error),
      note_eg: raw.note_eg ?? '',
      ...emptyExtras(raw),
    };
  }
  if (raw.kind !== 'answer') return null;
  const goal = candidates.find((g) => g.id === raw.goal);
  if (!goal) return null;
  const opt = goal.options?.find((o) => o.value === raw.option);
  if (!opt) return null;

  let answerWord =
    typeof raw.answer_word === 'string' && raw.answer_word.trim()
      ? raw.answer_word.trim()
      : null;
  // Ignore answer_word when it is not in this goal's option words (R4-8).
  if (answerWord && !isAnswerWordInGoal(goal, answerWord)) {
    answerWord = null;
  } else if (answerWord) {
    // Canonicalize to authored spelling when possible.
    const authored = goalOptionAnswerWords(goal).find(
      (w) => normalizeSceneText(w) === normalizeSceneText(answerWord!),
    );
    if (authored) answerWord = authored;
  }

  return {
    kind: 'answer',
    goal: goal.id,
    option: opt.value,
    corrected: raw.corrected ?? '',
    has_error: Boolean(raw.has_error),
    note_eg: raw.note_eg ?? '',
    answer_word: answerWord,
    answer_word_misspelled: Boolean(answerWord && raw.answer_word_misspelled),
  };
}

export function parseSceneQwenJson(text: string): SceneQwenResult | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    const slice =
      start >= 0 && end > start ? trimmed.slice(start, end + 1) : trimmed;
    const obj = JSON.parse(slice) as Record<string, unknown>;
    const kind =
      obj.kind === 'answer' ||
      obj.kind === 'side_question' ||
      obj.kind === 'other'
        ? obj.kind
        : 'other';
    return {
      kind,
      goal: typeof obj.goal === 'string' ? obj.goal : null,
      option: typeof obj.option === 'string' ? obj.option : null,
      corrected: typeof obj.corrected === 'string' ? obj.corrected : '',
      has_error: Boolean(obj.has_error),
      note_eg: typeof obj.note_eg === 'string' ? obj.note_eg : '',
      answer_word:
        typeof obj.answer_word === 'string' ? obj.answer_word : null,
      answer_word_misspelled: Boolean(obj.answer_word_misspelled),
    };
  } catch {
    return null;
  }
}

function buildPrompt(opts: {
  lastCharacter: string;
  learnerText: string;
  candidates: ConvoGoal[];
}): string {
  const goals = opts.candidates.map((g) => ({
    id: g.id,
    options: (g.options ?? []).map((o) => ({
      value: o.value,
      keywords: o.keywords,
      examples: o.examples,
    })),
  }));
  return [
    `Character's last line: ${opts.lastCharacter}`,
    `Learner message: ${opts.learnerText}`,
    `Candidate goals: ${JSON.stringify(goals)}`,
    `Rules: ${RULES}`,
    'Output JSON: {"kind":"answer"|"side_question"|"other","goal":"<id or null>","option":"<value or null>","corrected":"<pt-PT>","has_error":true|false,"note_eg":"<eg or empty>","answer_word":"<word or null>","answer_word_misspelled":true|false}',
  ].join('\n');
}

export async function callSceneQwen(opts: {
  lastCharacter: string;
  learnerText: string;
  candidates: ConvoGoal[];
  /** Sync or delayed stub (G10: correction after bubble). */
  stub?: SceneQwenResult | Promise<SceneQwenResult>;
}): Promise<SceneQwenResult | null> {
  if (opts.stub !== undefined) return await opts.stub;

  const prompt = buildPrompt(opts);
  try {
    const out = await generateText({
      model: getChatModel(),
      system: SYSTEM,
      prompt,
      temperature: 0,
      maxOutputTokens: 150,
      abortSignal: AbortSignal.timeout(SCENE_QWEN_TIMEOUT_MS),
    });
    return parseSceneQwenJson(out.text ?? '');
  } catch {
    return null;
  }
}
