import {
  buildFreeReactionPrompt,
  estimateConvoPromptTokens,
  freePromptPartsToMessages,
} from '@/lib/v2/convo/prompt';
import {
  dropFreeConvoReaction,
  parseFreeConvoReaction,
  visibleFreeStreamText,
} from '@/lib/v2/convo/output/parseFree';
import {
  freeTopicById,
  loadFreeTopicsFile,
  loadThreadTopic,
  requirePersona,
  type FreeTopic,
} from '@/lib/v2/convo/topics';
import type { ConvoSession, ConvoSessionStore } from '@/lib/v2/convo/session';
import { freePackId } from '@/lib/v2/convo/session/freeInit';
import {
  classifySideChannel,
  logUnmatchedTopicRequestSync,
  matchTopicRequest,
  topicRequestCoachEg,
} from '@/lib/v2/convo/sideChannel';
import {
  advanceAfterAnswer,
  currentNextLine,
  extractFreeFact,
  handleFreeArabicSide,
  isLearnerQuestionToCharacter,
  isNonLearningRequest,
  isOffTopic,
  nearestFreeTopic,
  NON_LEARNING_COACH_EG,
  offTopicGist,
  pushFreeFact,
  type FreeNextLine,
} from '@/lib/v2/convo/free';
import type { ConvoCoachCaller } from '@/lib/v2/convo/sideChannel/coachCall';
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
  /** When true, learner used ساعدني أرد chips this turn. */
  assisted?: boolean;
  coachCaller?: ConvoCoachCaller;
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

function applyNextLine(session: ConvoSession, next: FreeNextLine): void {
  session.last_line_id = next.line_id;
  session.pending_question = {
    id: next.line_id,
    kind: 'open',
    item_id: next.line_id,
  };
  session.assisted = false;
}

function closeWithFact(
  session: ConvoSession,
  line: FreeNextLine,
  learnerText: string,
): void {
  const hints = [
    ...(line.frame?.chips ?? []),
    ...session.suggested_words.slice(0, 8),
  ];
  const fact = extractFreeFact({ learnerText, hints });
  session.facts = pushFreeFact(session.facts, fact);
}

function learnerAskedQuestion(text: string): boolean {
  const t = text.trim();
  return /\?\s*$/.test(t) || /^e\s+tu\b/i.test(t);
}

async function callFreeModel(opts: {
  model: ConvoStreamModel;
  system: string;
  prompt: string;
  emit: (event: ConvoTurnStreamEvent) => void;
  knownWords?: string[];
  learnerText?: string;
}): Promise<{
  reaction: string;
  reaction_ar: string;
  unknownWords: string[];
  metricsPartial: Pick<
    ConvoTurnMetrics,
    'ttft_ms' | 'input_tokens' | 'cached_input_tokens' | 'output_tokens'
  >;
}> {
  const { model, system, prompt, emit } = opts;
  const asked = learnerAskedQuestion(opts.learnerText ?? '');
  let rawAcc = '';
  let visibleAcc = '';
  const onChunk = (chunk: string) => {
    rawAcc += chunk;
    const nextVisible = visibleFreeStreamText(rawAcc);
    if (nextVisible.length > visibleAcc.length) {
      const delta = nextVisible.slice(visibleAcc.length);
      visibleAcc = nextVisible;
      if (delta) emit({ type: 'reaction_delta', text: delta });
    }
  };

  const streamFn = model.stream?.bind(model) ?? model.complete.bind(model);
  let result = await streamFn({
    system,
    prompt,
    maxTokens: 96,
    onChunk,
  });

  let parsed = parseFreeConvoReaction(result.text, {
    knownWords: opts.knownWords,
    learnerAsked: asked,
  });
  if (parsed.decision === 'regenerate' && parsed.regenerateReason) {
    result = await streamFn({
      system,
      prompt,
      maxTokens: 96,
      regenerateReason: parsed.regenerateReason,
      onChunk,
    });
    parsed = parseFreeConvoReaction(result.text, {
      knownWords: opts.knownWords,
      learnerAsked: asked,
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
    reaction_ar: parsed.decision === 'drop' ? '' : parsed.reaction_ar,
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
 * One Module C free-chat turn (Batch 9 C2).
 * Code owns the next authored line; the model only reacts (prompt still
 * transitional until C4).
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
  let threadDoc = loadThreadTopic(topic.id);

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
  if (sideKind === 'topic_request') {
    const matched = matchTopicRequest(input.learnerText);
    const coach = topicRequestCoachEg(matched);
    if (matched) {
      session.paused_for_pack_id = matched.pack_id;
      emit({
        type: 'coach',
        id: 'free_topic_request',
        eg: coach.eg,
        moment: 'topic_request',
      });
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
      emit({
        type: 'coach',
        id: `open_pack:${matched.pack_id}`,
        eg: coach.href ? `${coach.eg}\n${coach.href}` : coach.eg,
        moment: 'topic_request_cta',
      });
    } else {
      logUnmatchedTopicRequestSync({
        userId: session.user_id,
        queryEg: input.learnerText.trim(),
      });
      emit({
        type: 'coach',
        id: 'free_topic_request_unmatched',
        eg: coach.eg,
        moment: 'topic_request',
      });
    }
    return finish(true);
  }
  const pendingLine = currentNextLine(
    threadDoc,
    session.thread_index,
    session.free_step,
    topic,
  );

  if (
    sideKind === 'arabic_answer' ||
    sideKind === 'other' ||
    sideKind === 'language_question'
  ) {
    await handleFreeArabicSide({
      kind: sideKind,
      learnerText: input.learnerText.trim(),
      frame: pendingLine.frame,
      emit,
      ...(input.coachCaller ? { coachCaller: input.coachCaller } : {}),
    });
    return finish(true);
  }

  const learnerText = input.learnerText.trim();
  if (input.assisted) {
    session.assisted = true;
  }

  if (learnerText && isNonLearningRequest(learnerText)) {
    emit({
      type: 'coach',
      id: 'free_non_learning',
      eg: NON_LEARNING_COACH_EG,
      moment: 'non_learning',
    });
    return finish(true);
  }

  let current = currentNextLine(
    threadDoc,
    session.thread_index,
    session.free_step,
    topic,
  );

  let switchedTopic = false;
  let bridgingBack = false;
  let eventLine = learnerText
    ? 'learner replied; continue the free chat'
    : 'conversation started; ask about the topic';

  if (learnerText && isLearnerQuestionToCharacter(learnerText)) {
    eventLine = 'learner asked you a question';
  } else if (session.assisted) {
    eventLine = 'learner used the help chips';
  }

  if (learnerText) {
    const extras = [
      ...session.suggested_words,
      ...(current.frame?.chips ?? []),
      current.tl,
      current.share_tl ?? '',
      ...threadDoc.threads.flatMap((th) => [
        th.share.tl,
        th.ask.tl,
        ...th.ask.frame.chips,
        ...th.follow_ups.flatMap((fu) => [fu.tl, ...fu.frame.chips]),
      ]),
    ];
    if (isOffTopic(learnerText, topic, extras)) {
      session.off_topic_streak = (session.off_topic_streak ?? 0) + 1;
      const gist = offTopicGist(learnerText);
      if (session.off_topic_streak >= 2) {
        const all = loadFreeTopicsFile().topics;
        const nextTopic = nearestFreeTopic(topic, all, learnerText);
        topic = nextTopic;
        threadDoc = loadThreadTopic(nextTopic.id);
        session.topic_id = nextTopic.id;
        session.pack_id = freePackId(nextTopic.id);
        session.character_id = nextTopic.character_id;
        session.thread_index = 0;
        session.free_step = { kind: 'ask' };
        session.threads_done = [];
        session.off_topic_streak = 0;
        session.suggested_words = nextTopic.word_set.slice(0, 15);
        current = currentNextLine(
          threadDoc,
          0,
          { kind: 'ask' },
          topic,
        );
        applyNextLine(session, current);
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
        bridgingBack = true;
      }
    } else {
      session.off_topic_streak = 0;
      pushExchange(session, 'learner', learnerText);
    }
  }

  // Preview the authored next line for NEXT LINE (after this answer).
  let nextLinePreview = current.bubble_tl;
  if (learnerText && !bridgingBack && !switchedTopic) {
    const preview = advanceAfterAnswer({
      doc: threadDoc,
      topic,
      thread_index: session.thread_index,
      step: session.free_step,
      threads_done: session.threads_done,
      learnerText,
    });
    nextLinePreview = preview.next.bubble_tl;
  } else if (bridgingBack) {
    nextLinePreview = `Mas diz-me… ${current.tl}`;
  }

  const persona = requirePersona(topic.character_id);
  const promptBuilt = buildFreeReactionPrompt({
    module: 'free',
    pack: null,
    freeTopicTitle: topic.title_tl,
    facts: session.facts,
    event: {
      verdict: 'correct',
      item_id: '',
      question_id: session.pending_question?.id ?? '',
      question_kind: 'open',
      phase: session.phase,
    },
    eventLine,
    candidates: [],
    lastExchanges: session.last_exchanges,
    learnerAnswer: learnerText || '(ready)',
    personaJson: JSON.stringify(persona),
    nextLineTl: nextLinePreview,
  });

  const { system, prompt } = freePromptPartsToMessages(promptBuilt);

  const modelOut = await callFreeModel({
    model: input.model,
    system,
    prompt,
    emit,
    knownWords: session.suggested_words,
    learnerText,
  });
  metrics = { ...metrics, ...modelOut.metricsPartial };

  if (modelOut.reaction) {
    pushExchange(session, 'character', modelOut.reaction);
  }

  let nextLine: FreeNextLine;
  if (bridgingBack) {
    nextLine = {
      ...current,
      bubble_tl: `Mas diz-me… ${current.tl}`,
      tl: current.tl,
    };
    applyNextLine(session, current);
  } else if (switchedTopic) {
    nextLine = current;
  } else if (learnerText) {
    closeWithFact(session, current, learnerText);
    const advanced = advanceAfterAnswer({
      doc: threadDoc,
      topic,
      thread_index: session.thread_index,
      step: session.free_step,
      threads_done: session.threads_done,
      learnerText,
    });
    if (advanced.switch_topic_id) {
      const nextTopic = freeTopicById(advanced.switch_topic_id)!;
      topic = nextTopic;
      threadDoc = loadThreadTopic(nextTopic.id);
      session.topic_id = nextTopic.id;
      session.pack_id = freePackId(nextTopic.id);
      session.character_id = nextTopic.character_id;
      session.suggested_words = nextTopic.word_set.slice(0, 15);
      const openLine = currentNextLine(
        threadDoc,
        0,
        { kind: 'ask' },
        topic,
      );
      const withOpening: FreeNextLine = {
        ...openLine,
        bubble_tl: `${topic.opening_tl.replace(/\{name\}!?\s*,?\s*/g, '').trim()} ${openLine.bubble_tl}`.trim(),
        bubble_ar: `${topic.opening_ar.replace(/\{name\}!?\s*,?\s*/g, '').trim()} ${openLine.bubble_ar}`.trim(),
      };
      session.thread_index = 0;
      session.free_step = { kind: 'ask' };
      session.threads_done = [];
      nextLine = withOpening;
      applyNextLine(session, openLine);
    } else {
      session.thread_index = advanced.thread_index;
      session.free_step = advanced.step;
      session.threads_done = advanced.threads_done;
      nextLine = advanced.next;
      applyNextLine(session, nextLine);
    }
  } else {
    nextLine = current;
    applyNextLine(session, nextLine);
  }

  const authoredTl = nextLine.bubble_tl || nextLine.tl;
  const authoredAr = nextLine.bubble_ar || nextLine.ar;
  const characterExchange = [modelOut.reaction, authoredTl]
    .filter(Boolean)
    .join(' ')
    .trim();
  if (authoredTl) {
    // One character exchange per turn = reaction + next line
    if (modelOut.reaction) {
      // Replace the reaction-only exchange with the combined line.
      const withoutLast = session.last_exchanges.slice(0, -1);
      session.last_exchanges = [
        ...withoutLast,
        { role: 'character', tl: characterExchange },
      ].slice(-3);
    } else {
      pushExchange(session, 'character', authoredTl);
    }
  }

  if (authoredTl) {
    emit({
      type: 'authored_append',
      tl: authoredTl,
      audio_key: `free:${topic.id}:${nextLine.line_id}`,
    });
  }

  const bubbleAr = [modelOut.reaction_ar, authoredAr]
    .filter(Boolean)
    .join(' ')
    .trim();
  if (bubbleAr) {
    emit({ type: 'bubble_ar', ar: bubbleAr });
  }

  // Keep a question event for older clients / tests that look for it.
  emit({
    type: 'question',
    id: nextLine.line_id,
    tl: authoredTl,
    kind: 'open',
    item_id: nextLine.line_id,
    audio_key: `free:${topic.id}:${nextLine.line_id}`,
    ...(modelOut.unknownWords.length
      ? { unknown_words: modelOut.unknownWords }
      : {}),
  });

  if (nextLine.frame) {
    emit({
      type: 'free_frame',
      tl: nextLine.frame.tl,
      eg: nextLine.frame.eg,
      chips: nextLine.frame.chips,
    });
  }

  return finish(true);
}
