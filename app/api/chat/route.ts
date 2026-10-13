import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
  type UIMessage,
} from 'ai';
import {
  buildFriendInstruction,
  buildLessonReactionInstruction,
} from '@/lib/friendPrompt';
import {
  dropJunkCoach,
  extractPraisePhrases,
  parseFriendOutput,
  parseOpenVerdict,
} from '@/lib/friendParse';
import { lastExchanges } from '@/lib/history';
import { warmKnownCache, getKnownCache } from '@/lib/knownCache';
import { refreshMongoCatalogue } from '@/lib/lessons/catalogue';
import { typedToPlain } from '@/lib/messages';
import {
  formatKnownForPrompt,
  markLessonPracticed,
  markCellsPracticedInChat,
} from '@/lib/mongo/userProgress';
import { getChatModel } from '@/lib/model';
import type { CefrLevel } from '@/lib/prompts';
import { appendLearnerLog, readLearner, writeLearner } from '@/lib/store';
import {
  applyLearnerTurn,
  commitOpenVerdict,
  commitPersonalSlotAdvance,
  shouldEmitPracticePraise,
  takePracticePraise,
  unresolvedPracticePrompt,
} from '@/lib/turn';
import type { TurnAction, TypedMessage, TurnLogDetail, Progress } from '@/lib/progressTypes';

export const runtime = 'nodejs';
export const maxDuration = 60;

const VALID_LEVELS: CefrLevel[] = ['A0', 'A1', 'A2', 'B1'];

/** Keep the voices Prompt 4 assigns to this verdict. A correct practice turn is the character only. */
function voicesForPracticeVerdict(messages: TypedMessage[], verdict: string): TypedMessage[] {
  const want =
    verdict === 'correct'
      ? new Set(['character', 'praise'])
      : verdict === 'near-miss' || verdict === 'near_miss'
        ? new Set(['character', 'coach'])
        : verdict === 'wrong'
          ? new Set(['coach', 'help', 'correction'])
          : null;
  if (!want) return messages;
  const kept = messages.filter((m) => want.has(m.type));
  return kept.length ? kept : messages;
}

function textFromUIMessage(message: UIMessage): string {
  return message.parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('');
}

function writeDataMessages(
  writer: { write: (part: import('ai').UIMessageChunk) => void },
  messages: TypedMessage[],
): void {
  for (const message of messages) {
    writer.write({
      type: 'data-typed',
      data: message,
    } as import('ai').UIMessageChunk);
  }
}

function writeTextMessage(
  writer: { write: (part: import('ai').UIMessageChunk) => void },
  text: string,
): void {
  const id = crypto.randomUUID();
  writer.write({ type: 'text-start', id });
  writer.write({ type: 'text-delta', id, delta: text });
  writer.write({ type: 'text-end', id });
}

function formatLogLine(log: TurnLogDetail): string {
  return [
    `mode=${log.mode}`,
    `lesson=${log.lessonId ?? '-'}`,
    `stage=${log.stage ?? '-'}`,
    `item=${log.itemId ?? '-'}`,
    `script=${log.script}`,
    `source=${log.gradingSource}`,
    `verdict=${log.verdict ?? '-'}`,
    `matched=${log.matchedAnswer ?? '-'}`,
    log.modelVerdictRaw ? `rawVerdict=${log.modelVerdictRaw}` : null,
    `types=${log.messageTypes.join(',') || '-'}`,
    `latency=${log.modelLatencyMs ?? 0}ms`,
    `finish=${log.finishReason ?? '-'}`,
    `out=${log.outputTokens ?? 0}`,
  ]
    .filter(Boolean)
    .join(' · ');
}

function persistTurn(
  sessionId: string,
  learner: ReturnType<typeof readLearner>,
  progress: typeof learner.progress,
  outbound: TypedMessage[],
  log: TurnLogDetail,
): void {
  log.messageTypes = outbound.map((m) => m.type);
  const line = formatLogLine(log);
  progress.lastLogLine = line;
  progress.lastTurnLog = log;
  learner.visible.push(...outbound);
  learner.progress = progress;
  writeLearner(learner);
  appendLearnerLog(sessionId, line);
  console.log('[turn]', line);
}

function rememberPraise(progress: Progress, messages: TypedMessage[]): void {
  const phrases = extractPraisePhrases(messages);
  if (phrases.length) {
    progress.recentPraise = [...(progress.recentPraise ?? []), ...phrases].slice(-5);
  }
  const characterLines = messages
    .filter((message) => message.type === 'character')
    .flatMap((message) => message.segments.filter((seg) => seg.lang === 'pt').map((seg) => seg.text.trim()))
    .filter(Boolean);
  if (characterLines.length) {
    progress.recentCharacterReactions = [
      ...(progress.recentCharacterReactions ?? []),
      ...characterLines,
    ].slice(-3);
  }
}

export async function POST(req: Request) {
  const body = await req.json();
  const {
    message,
    sessionId,
    level: rawLevel,
    action,
  }: {
    message?: UIMessage;
    sessionId: string;
    level?: string;
    action?: TurnAction;
  } = body;

  if (!sessionId) {
    return new Response(JSON.stringify({ error: 'sessionId required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const userText = message ? textFromUIMessage(message) : '';
  if (!message && (!action || action.type === 'message')) {
    return new Response(JSON.stringify({ error: 'message required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const level: CefrLevel = VALID_LEVELS.includes(rawLevel as CefrLevel)
    ? (rawLevel as CefrLevel)
    : 'A0';

  let learner;
  try {
    learner = readLearner(sessionId);
  } catch {
    return new Response(JSON.stringify({ error: 'invalid session' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  await refreshMongoCatalogue().catch(() => 0);
  await warmKnownCache(sessionId).catch(() => null);

  learner.level = level;
  const applied = applyLearnerTurn({
    progress: structuredClone(learner.progress),
    userText,
    action: action ?? { type: 'message' },
  });

  if (userText.trim() && action?.type !== 'start-practice') {
    learner.visible.push({
      id: crypto.randomUUID(),
      role: 'user',
      type: 'chat',
      at: Date.now(),
      segments: [{ lang: 'pt', text: userText }],
      learnerVerdict: applied.learnerVerdict,
    });
    writeLearner(learner);
  }

  // Persist practice completion to Mongo when friend-bridge just finished
  const prevBridge = learner.progress.practice?.phase === 'friend-bridge';
  const nowDone =
    prevBridge &&
    applied.progress.practice === null &&
    applied.progress.lastPractisedLessonId;
  if (nowDone && applied.progress.lastPractisedLessonId) {
    const packId = applied.progress.lastPractisedLessonId;
    const { lessonById } = await import('@/lib/lessons/catalogue');
    const pack = lessonById(packId);
    void markLessonPracticed(sessionId, packId, pack?.version ?? 1);
    if (pack?.cellIds?.length) {
      void markCellsPracticedInChat(sessionId, pack.cellIds);
    }
  }

  return createUIMessageStreamResponse({
    stream: createUIMessageStream({
      execute: async ({ writer }) => {
        const outbound: TypedMessage[] = [...applied.messages];
        const progress = applied.progress;
        const log = { ...applied.log };

        if (applied.streamKind === 'none') {
          writeDataMessages(writer, outbound);
          const plain = outbound.map(typedToPlain).filter(Boolean).join('\n');
          if (plain) writeTextMessage(writer, plain);
          persistTurn(sessionId, learner, progress, outbound, log);
          return;
        }

        if (outbound.length) writeDataMessages(writer, outbound);

        const started = Date.now();
        let finishReason = 'unknown';
        let outputTokens: number | undefined;

        try {
          if (applied.streamKind === 'friend') {
            const known = getKnownCache(sessionId);
            const system = buildFriendInstruction({
              level,
              lastLesson: applied.modelContext?.lesson,
              knownText: formatKnownForPrompt(known),
            });
            const window = lastExchanges(learner.visible, 6);
            const result = streamText({
              model: getChatModel(),
              system,
              messages: window.map((m) => ({ role: m.role, content: m.content })),
              temperature: 0.7,
              maxOutputTokens: 400,
            });
            const modelText = await result.text;
            finishReason = (await result.finishReason) ?? 'stop';
            outputTokens = (await result.usage)?.outputTokens;
            const parsed = parseFriendOutput(modelText).map((message) =>
              message.type === 'character' || message.type === 'coach'
                ? { ...message, type: 'chat' as const, speaker: undefined }
                : message,
            );
            writeDataMessages(writer, parsed);
            writeTextMessage(writer, parsed.map(typedToPlain).join('\n'));
            outbound.push(...parsed);
          } else if (
            applied.streamKind === 'lesson-reaction' &&
            applied.modelContext?.reaction
          ) {
            const reaction = applied.modelContext.reaction;
            const item = applied.modelContext.item;
            const pack = applied.modelContext.lesson;
            if (reaction.source === 'you') {
              learner.progress = progress;
              writeLearner(learner);
            }
            const judging = reaction.source === 'you';
            const system = buildLessonReactionInstruction({
              level,
              reaction,
              userText,
            });
            const result = streamText({
              model: getChatModel(),
              system,
              prompt: userText || '(side remark)',
              temperature: judging ? 0 : 0.5,
              maxOutputTokens: judging ? 120 : 300,
            });
            const modelText = await result.text;
            finishReason = (await result.finishReason) ?? 'stop';
            outputTokens = (await result.usage)?.outputTokens;

            let body = modelText;
            let modelVerdict: 'correct' | 'near-miss' | 'wrong' | null = null;

            if (reaction.source === 'you') {
              const parsedVerdict = parseOpenVerdict(modelText);
              log.modelVerdictRaw = parsedVerdict.rawLine;
              log.gradingSource = 'model';
              body = parsedVerdict.body;
              modelVerdict = parsedVerdict.verdict;
              if (modelVerdict) log.verdict = modelVerdict;
            }

            const parsedBody = parseFriendOutput(body);
            const verdictForVoices = modelVerdict ?? reaction.verdict;
            const voiced =
              reaction.mode === 'practice'
                ? voicesForPracticeVerdict(parsedBody, verdictForVoices)
                : parsedBody;
            const bodyMessages = dropJunkCoach(voiced, userText);

            if (shouldEmitPracticePraise(reaction, verdictForVoices)) {
              const praise = takePracticePraise(progress);
              writeDataMessages(writer, [praise]);
              outbound.push(praise);
              rememberPraise(progress, [praise]);
            }

            rememberPraise(progress, bodyMessages);
            writeDataMessages(writer, bodyMessages);
            outbound.push(...bodyMessages);

            let nextPrompts =
              reaction.nextPrompts ??
              (reaction.nextPrompt ? [reaction.nextPrompt] : []);

            if (reaction.source === 'you' && item && pack && modelVerdict) {
              nextPrompts = commitOpenVerdict(progress, pack, item.id, modelVerdict);
            } else if (reaction.slotPattern && pack && modelVerdict && item) {
              const outcome =
                modelVerdict === 'near-miss'
                  ? 'near-miss'
                  : modelVerdict === 'correct'
                    ? 'correct'
                    : 'learned-with-help';
              if (modelVerdict === 'wrong' && (reaction.attempt ?? 1) < 2) {
                nextPrompts = commitOpenVerdict(progress, pack, item.id, 'wrong');
              } else {
                nextPrompts = commitPersonalSlotAdvance(progress, pack, outcome);
              }
            }

            if (nextPrompts.length) {
              writeDataMessages(writer, nextPrompts);
              outbound.push(...nextPrompts);
            }

            writeTextMessage(writer, outbound.map(typedToPlain).filter(Boolean).join('\n'));
          }
        } catch (err) {
          console.error('[api/chat] model', err);
          finishReason = 'error';
          // Fallback: show next prompt if we have one so the learner is not stuck
          const reaction = applied.modelContext?.reaction;
          const pack = applied.modelContext?.lesson;
          let nextPrompts =
            reaction?.nextPrompts ??
            (reaction?.nextPrompt ? [reaction.nextPrompt] : []);
          if (reaction?.slotPattern && pack) {
            const advanced = commitPersonalSlotAdvance(progress, pack, 'learned-with-help');
            if (advanced.length) nextPrompts = advanced;
          }
          if (!nextPrompts.length && pack && progress.practice?.phase === 'story') {
            const fallback = unresolvedPracticePrompt(progress, pack);
            if (fallback) nextPrompts = [fallback];
          }
          if (nextPrompts.length) {
            writeDataMessages(writer, nextPrompts);
            outbound.push(...nextPrompts);
          }
        }

        log.modelLatencyMs = Date.now() - started;
        log.finishReason = finishReason;
        log.outputTokens = outputTokens ?? 0;

        const authoredCount = applied.messages.length;
        const toSave = outbound.slice(authoredCount);
        persistTurn(sessionId, learner, progress, [...applied.messages, ...toSave], log);
      },
    }),
  });
}
