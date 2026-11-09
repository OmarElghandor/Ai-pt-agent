import type {
  Thread,
  ThreadAsk,
  ThreadTopicFile,
} from '@/lib/v2/convo/topics/threadTypes';
import { loadThreadTopicFromFile } from '@/lib/v2/convo/topics/threadLoad';
import { keywordsFromExamples } from './keywords';
import type { ConvoGoal, ConvoGoalBank } from './types';
import { ensureBankRequiredItems } from './requiredItems';
import { validateGoals } from './validate';

function askToGoal(
  thread: Thread,
  ask: ThreadAsk,
  id: string,
  intentEg: string,
): ConvoGoal {
  const examples = ask.frame.chips.filter((c) => c.trim()).slice(0, 4);
  const fallback = ask.frame.tl.replace(/_+/g, '…').trim();
  if (examples.length < 2 && fallback) {
    examples.push(fallback);
  }
  if (examples.length < 1 && ask.tl.trim()) {
    examples.push(ask.tl.trim());
  }
  let keywords = keywordsFromExamples(examples);
  if (keywords.length < 1) {
    keywords = keywordsFromExamples([ask.tl, thread.share.tl, ...examples]);
  }
  if (keywords.length < 1) {
    keywords = ['sim', 'nao'];
  }
  return {
    id,
    intent_eg: intentEg,
    intent_en: `get the learner to answer: ${ask.tl.replace(/\?+$/, '').trim()}`,
    examples_tl: examples.slice(0, 4),
    keywords,
    seed_tl: thread.share.tl,
    seed_ar: thread.share.ar,
    help: {
      frame_tl: ask.frame.tl,
      eg: ask.frame.eg,
      chips: [...ask.frame.chips],
    },
  };
}

/** Convert one thread bank file into goals (ask + each follow-up). */
export function goalsFromThreadDoc(doc: ThreadTopicFile): ConvoGoalBank {
  const goals: ConvoGoal[] = [];
  for (const thread of doc.threads) {
    goals.push(
      askToGoal(
        thread,
        thread.ask,
        `${thread.id}.ask`,
        thread.ask.ar.trim() || thread.ask.tl,
      ),
    );
    thread.follow_ups.forEach((fu, i) => {
      goals.push(
        askToGoal(
          thread,
          fu,
          `${thread.id}.fu${i + 1}`,
          fu.ar.trim() || fu.tl,
        ),
      );
    });
  }
  return {
    source: 'thread',
    topic_id: doc.topic.id,
    goals,
    suggested_words: [],
    scene: {
      character_id: doc.topic.character_id,
      time_of_day: 'morning',
    },
  };
}

export function loadGoalsForTopic(
  topicId: string,
  opts?: { targetLang?: string },
): ConvoGoalBank {
  const doc = loadThreadTopicFromFile(topicId, {
    targetLang: opts?.targetLang,
  });
  const bank = ensureBankRequiredItems(goalsFromThreadDoc(doc));
  const { ok, issues } = validateGoals(bank.goals);
  if (!ok) {
    throw new Error(
      `Invalid goals for topic ${topicId}: ${issues
        .map((i) => `${i.path}: ${i.message}`)
        .join('; ')}`,
    );
  }
  return bank;
}
