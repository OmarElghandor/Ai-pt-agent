import {
  buildConvoPrompt,
  estimateConvoPromptTokens,
} from '@/lib/v2/convo/prompt';
import {
  dropFreeConvoReaction,
  endsWithQuestionOrInvitation,
  parseFreeConvoReaction,
} from '@/lib/v2/convo/output/parseFree';
import {
  freeTopicById,
  loadFreeTopicsFile,
  loadTopicAngles,
  type FreeTopic,
  type TopicAngle,
} from '@/lib/v2/convo/topics';
import type { ConvoSession, ConvoSessionStore } from '@/lib/v2/convo/session';
import { freePackId } from '@/lib/v2/convo/session/freeInit';
import { classifySideChannel } from '@/lib/v2/convo/sideChannel';
import {
  isNonLearningRequest,
  isOffTopic,
  nearestFreeTopic,
  NON_LEARNING_COACH_EG,
  offTopicGist,
} from '@/lib/v2/convo/free';
import type {
  ConvoStreamModel,
  ConvoTurnMetrics,
  ConvoTurnStreamEvent,
} from './types';

export type RunFreeConvoTurnInput = {
  session: ConvoSession;
  learnerText: string;
  store: ConvoSessionStore;
  model: ConvoStreamModel;
  emit: (event: ConvoTurnStreamEvent) => void;
  topic?: FreeTopic;
  angles?: TopicAngle[];
};

function pushExchange(
  session: ConvoSession,
  role: 'character' | 'learner',
  tl: string,
): void {
  if (!tl.trim()) return;
  session.last_exchanges = [
    ...session.last_exchanges,
    { role, tl: tl.trim() },
  ].slice(-3);
}

function relatedBridgeTopic(topic: FreeTopic): string {
  return topic.related_topic_ids[0] ?? topic.id;
}

function bridgeAngle(topic: FreeTopic): TopicAngle {
  return {
    id: `${topic.id}.bridge`,
    tl: `E o ${relatedBridgeTopic(topic)}? Quer falar disso?`,
    item_hints: [],
  };
}

function angleCandidates(
  angles: TopicAngle[],
  index: number,
): Array<{ id: string; tl: string; item_id: string; qkind: 'open' }> {
  const cur = angles[index];
  const next = angles[index + 1];
  const out: Array<{ id: string; tl: string; item_id: string; qkind: 'open' }> =
    [];
  if (cur)
    out.push({ id: cur.id, tl: cur.tl, item_id: cur.id, qkind: 'open' });
  if (next)
    out.push({ id: next.id, tl: next.tl, item_id: next.id, qkind: 'open' });
  return out;
}

/** Move to next angle (or bridge). Returns the angle question to append. */
function takeNextAngleQuestion(
  session: ConvoSession,
  angles: TopicAngle[],
  topic: FreeTopic,
): TopicAngle {
  const current = angles[session.angle_index];
  if (current && !session.angles_done.includes(current.id)) {
    session.angles_done = [...session.angles_done, current.id];
  }
  const nextIndex = session.angle_index + 1;
  if (nextIndex >= angles.length) {
    const bridge = bridgeAngle(topic);
    session.pending_question = {
      id: bridge.id,
      kind: 'open',
      item_id: bridge.id,
    };
    return bridge;
  }
  session.angle_index = nextIndex;
  const next = angles[nextIndex]!;
  session.pending_question = {
    id: next.id,
    kind: 'open',
    item_id: next.id,
  };
  return next;
}

async function callFreeModel(opts: {
  model: ConvoStreamModel;
  system: string;
  prompt: string;
  emit: (event: ConvoTurnStreamEvent) => void;
  knownWords?: string[];
}): Promise<{
  reaction: string;
  unknownWords: string[];
  metricsPartial: Pick<
    ConvoTurnMetrics,
    'ttft_ms' | 'input_tokens' | 'cached_input_tokens' | 'output_tokens'
  >;
}> {
  const { model, system, prompt, emit } = opts;
  const onChunk = (chunk: string) => {
    emit({ type: 'reaction_delta', text: chunk });
  };

  const streamFn = model.stream?.bind(model) ?? model.complete.bind(model);
  let result = await streamFn({
    system,
    prompt,
    maxTokens: 64,
    onChunk,
  });

  let parsed = parseFreeConvoReaction(result.text, {
    knownWords: opts.knownWords,
  });
  if (parsed.decision === 'regenerate' && parsed.regenerateReason) {
    result = await streamFn({
      system,
      prompt,
      maxTokens: 64,
      regenerateReason: parsed.regenerateReason,
      onChunk,
    });
    parsed = parseFreeConvoReaction(result.text, {
      knownWords: opts.knownWords,
    });
    if (parsed.decision === 'regenerate') {
      parsed = dropFreeConvoReaction(parsed);
    }
  }

  const inputTokens =
    result.usage?.inputTokens ??
    estimateConvoPromptTokens(`${system}\n${prompt}`);
  const cachedInputTokens =
    result.usage?.cachedInputTokens ?? estimateConvoPromptTokens(system);
  const outputTokens =
    result.usage?.outputTokens ?? estimateConvoPromptTokens(result.text);

  return {
    reaction: parsed.decision === 'drop' ? '' : parsed.reaction,
    unknownWords: parsed.unknownWords,
    metricsPartial: {
      ttft_ms: result.ttftMs,
      input_tokens: inputTokens,
      cached_input_tokens: cachedInputTokens,
      output_tokens: outputTokens,
    },
  };
}

/**
 * One Module C free-chat turn (T7.2).
 * No pack grading. Reply must end with a question; else append next angle.
 */
export async function runFreeConvoTurn(
  input: RunFreeConvoTurnInput,
): Promise<{ session: ConvoSession; metrics: ConvoTurnMetrics }> {
  const started = Date.now();
  let session = structuredClone(input.session);
  const topicId = session.topic_id;
  if (!topicId) throw new Error('free session missing topic_id');

  let topic = input.topic ?? freeTopicById(topicId);
  if (!topic) throw new Error(`Unknown free topic: ${topicId}`);
  let angles = input.angles ?? loadTopicAngles(topicId).angles;

  const emit = input.emit;
  let metrics: ConvoTurnMetrics = {
    input_tokens: 0,
    cached_input_tokens: 0,
    output_tokens: 0,
    ttft_ms: 0,
    total_ms: 0,
  };

  const finish = async (ok: boolean, error?: string) => {
    session.updated_at = new Date().toISOString();
    session = await input.store.save(session);
    metrics.total_ms = Date.now() - started;
    emit({
      type: 'session',
      session: {
        id: session.id,
        rungs: session.rungs,
        phase: session.phase,
        status: session.status,
        help_ladder: session.help_ladder,
        current_group: session.current_group,
        pending_question: session.pending_question,
        correct_streak: session.correct_streak,
        struggled: session.struggled,
        said_once: session.said_once,
        survival_used: session.survival_used,
      },
    });
    emit({ type: 'metrics', ...metrics });
    emit({ type: 'done', ok, ...(error ? { error } : {}) });
    return { session, metrics };
  };

  const sideKind = classifySideChannel(input.learnerText);
  if (sideKind === 'arabic_answer' || sideKind === 'other') {
    emit({
      type: 'coach',
      id: 'free_ar_invite',
      eg: 'قولها بالبرتغالي، جرّب 😊',
      moment: 'arabic_answer',
    });
    return finish(true);
  }
  if (sideKind === 'language_question') {
    emit({
      type: 'coach',
      id: 'free_lang_q',
      eg: 'سؤال حلو — خلّينا نكمل بالبرتغالي، جرّب تقولها.',
      moment: 'language_question',
    });
    return finish(true);
  }

  const learnerText = input.learnerText.trim();

  // Non-learning English meta requests → coach decline only (09 §9).
  if (learnerText && isNonLearningRequest(learnerText)) {
    emit({
      type: 'coach',
      id: 'free_non_learning',
      eg: NON_LEARNING_COACH_EG,
      moment: 'non_learning',
    });
    return finish(true);
  }

  let switchedTopic = false;
  let eventLine = learnerText
    ? 'learner replied; continue the free chat'
    : 'conversation started; ask about the topic';

  if (learnerText) {
    const extras = [
      ...session.suggested_words,
      ...(angles[session.angle_index]?.item_hints ?? []),
    ];
    if (isOffTopic(learnerText, topic, extras)) {
      session.off_topic_streak = (session.off_topic_streak ?? 0) + 1;
      const gist = offTopicGist(learnerText);
      if (session.off_topic_streak >= 2) {
        const all = loadFreeTopicsFile().topics;
        const nextTopic = nearestFreeTopic(topic, all, learnerText);
        topic = nextTopic;
        angles = loadTopicAngles(nextTopic.id).angles;
        session.topic_id = nextTopic.id;
        session.pack_id = freePackId(nextTopic.id);
        session.character_id = nextTopic.character_id;
        session.angle_index = 0;
        session.angles_done = [];
        session.off_topic_streak = 0;
        session.suggested_words = nextTopic.word_set.slice(0, 15);
        const first = angles[0];
        session.pending_question = first
          ? { id: first.id, kind: 'open', item_id: first.id }
          : null;
        switchedTopic = true;
        eventLine = `learner went off topic twice; switched to ${nextTopic.title_tl}`;
        emit({
          type: 'coach',
          id: 'free_topic_switch',
          eg: `خلّينا نغيّر الموضوع لـ ${nextTopic.title_ar} 🙂`,
          moment: 'topic_switch',
        });
      } else {
        eventLine = `learner went off topic: ${gist}`;
      }
      // Keep exchanges Portuguese-only (09 §5.1 part 5); gist lives in event line.
    } else {
      session.off_topic_streak = 0;
      pushExchange(session, 'learner', learnerText);
    }
  }

  const candidates = angleCandidates(angles, session.angle_index);

  const promptBuilt = buildConvoPrompt({
    module: 'free',
    pack: null,
    freeTopicTitle: topic.title_tl,
    facts: session.facts,
    suggestedWords: session.suggested_words,
    event: {
      verdict: 'correct',
      item_id: '',
      question_id: session.pending_question?.id ?? '',
      question_kind: 'open',
      phase: session.phase,
    },
    eventLine,
    candidates,
    lastExchanges: session.last_exchanges,
    learnerAnswer: learnerText || '(ready)',
  });

  const system = promptBuilt.parts
    .filter((p) => p.cache)
    .map((p) => p.text)
    .join('\n\n');
  const prompt = promptBuilt.parts
    .filter((p) => !p.cache)
    .map((p) => `### ${p.index}\n${p.text}`)
    .join('\n\n');

  const modelOut = await callFreeModel({
    model: input.model,
    system,
    prompt,
    emit,
    knownWords: session.suggested_words,
  });
  metrics = { ...metrics, ...modelOut.metricsPartial };

  let questionTl = '';
  let questionId = session.pending_question?.id ?? '';
  const bridgingBack =
    !switchedTopic &&
    eventLine.startsWith('learner went off topic:') &&
    !eventLine.includes('twice');

  if (
    modelOut.reaction &&
    endsWithQuestionOrInvitation(modelOut.reaction) &&
    !bridgingBack
  ) {
    pushExchange(session, 'character', modelOut.reaction);
    questionTl = modelOut.reaction;
    questionId = session.pending_question?.id ?? `free.${session.angle_index}`;
    // Close current angle after a solid exchange ending in a question.
    const current = angles[session.angle_index];
    if (current && !session.angles_done.includes(current.id)) {
      session.angles_done = [...session.angles_done, current.id];
    }
    if (session.angle_index + 1 < angles.length) {
      session.angle_index += 1;
    }
    const pendingAngle =
      angles[session.angle_index] ?? bridgeAngle(topic);
    session.pending_question = {
      id: pendingAngle.id,
      kind: 'open',
      item_id: pendingAngle.id,
    };
  } else {
    if (modelOut.reaction) {
      pushExchange(session, 'character', modelOut.reaction);
    }
    // First off-topic (or forced bridge): re-ask current angle, do not advance.
    const current =
      angles[session.angle_index] ??
      (session.pending_question
        ? {
            id: session.pending_question.id,
            tl: '',
            item_hints: [] as string[],
          }
        : null);
    let appended: TopicAngle;
    if (bridgingBack && current && current.tl) {
      appended = current;
      session.pending_question = {
        id: current.id,
        kind: 'open',
        item_id: current.id,
      };
    } else if (switchedTopic && angles[0]) {
      appended = angles[0];
      session.pending_question = {
        id: appended.id,
        kind: 'open',
        item_id: appended.id,
      };
    } else {
      appended = takeNextAngleQuestion(session, angles, topic);
    }
    pushExchange(session, 'character', appended.tl);
    questionTl = appended.tl;
    questionId = appended.id;
  }

  emit({
    type: 'question',
    id: questionId,
    tl: questionTl,
    kind: 'open',
    item_id: questionId,
    audio_key: `free:${topic.id}:${questionId}`,
    ...(modelOut.unknownWords.length
      ? { unknown_words: modelOut.unknownWords }
      : {}),
  });

  return finish(true);
}
