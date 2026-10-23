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
  filterReactionMessages,
  parseFriendOutput,
  parseOpenVerdict,
} from '@/lib/friendParse';
import { normalizeAnswer, passesCodeGuard } from '@/lib/grade';
import { lastExchanges } from '@/lib/history';
import { warmKnownCache, getKnownCache } from '@/lib/knownCache';
import { refreshMongoCatalogue } from '@/lib/lessons/catalogue';
import { makeCharacterLine, makeCoachNote, typedToPlain } from '@/lib/messages';
import type { StoryBeat } from '@/lib/lessons/types';
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

/** Keep the voices this reaction case allows. Empty filter → show nothing. */
function voicesForPracticeVerdict(
  messages: TypedMessage[],
  verdict: string,
  reactionKind?: string,
): TypedMessage[] {
  if (reactionKind === 'r3') {
    return messages.filter((m) => m.type === 'coach');
  }
  if (reactionKind === 'r1') {
    return messages.filter((m) => m.type === 'character');
  }
  const want =
    verdict === 'correct'
      ? new Set(['character', 'praise'])
      : verdict === 'near-miss' || verdict === 'near_miss'
        ? new Set(['character', 'coach'])
        : verdict === 'wrong'
          ? new Set(['coach', 'help', 'correction'])
          : null;
  if (!want) return messages;
  return messages.filter((m) => want.has(m.type));
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
    log.openFailReason ? `openFail=${log.openFailReason}` : null,
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

function reactionTemperature(kind: string | undefined, judging: boolean): number {
  if (kind === 'r1') return 0.6;
  if (kind === 'r3') return 0.3;
  if (kind === 'r2' || judging) return 0;
  return 0.5;
}

function reactionMaxTokens(kind: string | undefined, judging: boolean): number {
  if (kind === 'r1') return 80;
  if (kind === 'r3') return 180;
  if (kind === 'r2' || judging) return 120;
  return 300;
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

  // Persist practice completion to Mongo when friend-bridge just finished.
  // Gate with PRACTICE_WRITE_PROGRESS=false when Langify owns progress (v2).
  const writeProgress = process.env.PRACTICE_WRITE_PROGRESS !== 'false';
  const prevBridge = learner.progress.practice?.phase === 'friend-bridge';
  const nowDone =
    writeProgress &&
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
            const reactionKind = reaction.reactionKind ?? (reaction.mode === 'side' ? 'r3' : judging ? 'r2' : 'r1');
            log.reactionModel =
              reactionKind === 'r1' || reactionKind === 'r2' || reactionKind === 'r3'
                ? reactionKind
                : null;
            if (progress.practice) {
              progress.practice = {
                ...progress.practice,
                reactionCalls: (progress.practice.reactionCalls ?? 0) + 1,
              };
            }
            const system = buildLessonReactionInstruction({
              level,
              reaction,
              userText,
            });
            const result = streamText({
              model: getChatModel(),
              system,
              prompt: userText || '(side remark)',
              temperature: reactionTemperature(reactionKind, judging),
              maxOutputTokens: reactionMaxTokens(reactionKind, judging),
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

              // Open beat: code guard can demote correct → wrong.
              if (
                modelVerdict &&
                modelVerdict !== 'wrong' &&
                reaction.codeGuard &&
                item &&
                'kind' in item &&
                item.kind === 'open' &&
                !passesCodeGuard(userText, reaction.codeGuard)
              ) {
                modelVerdict = 'wrong';
                log.verdict = 'wrong';
                log.openFailReason = 'guard';
              } else if (
                modelVerdict === 'wrong' &&
                item &&
                'kind' in item &&
                item.kind === 'open'
              ) {
                log.openFailReason = 'model';
              }

              // Fix identical to his answer (ignoring case) counts as correct.
              if (modelVerdict === 'near-miss') {
                const fixMatch = body.match(/<\s*fix\b[^>]*>[\s\S]*?<\s*pt\s*>([\s\S]*?)<\s*\/\s*pt\s*>/i);
                const fixPt = fixMatch?.[1]?.trim() ?? '';
                if (fixPt && normalizeAnswer(fixPt) === normalizeAnswer(userText)) {
                  modelVerdict = 'correct';
                  log.verdict = 'correct';
                  log.openFailReason = null;
                }
              }
            }

            const parsedBody = parseFriendOutput(body, { strict: true });
            let verdictForVoices = modelVerdict ?? reaction.verdict;
            const voiced =
              reaction.mode === 'practice' || reaction.mode === 'assessment' || reaction.mode === 'side'
                ? voicesForPracticeVerdict(parsedBody, verdictForVoices, reactionKind)
                : parsedBody;
            const filtered = filterReactionMessages(
              voiced,
              reaction,
              modelText,
              reaction.answerForReaction || userText,
            );
            let bodyMessages = filtered
              ? dropJunkCoach(filtered, userText)
              : [];

            const isNearMiss =
              verdictForVoices === 'near-miss' || verdictForVoices === 'near_miss';
            const passed =
              verdictForVoices === 'correct' || isNearMiss;

            // Open beat (R2): prefer the authored reply over the model's character line.
            const beatItem = item && 'reply' in item ? (item as StoryBeat) : null;
            const authoredReply = beatItem?.reply;
            if (
              passed &&
              reaction.source === 'you' &&
              authoredReply &&
              authoredReply.pt?.trim()
            ) {
              const replyBubble = makeCharacterLine(beatItem!.speaker, {
                pt: authoredReply.pt,
                ar: authoredReply.ar || '',
                arz: authoredReply.arz || authoredReply.ar || '',
              });
              bodyMessages = [
                ...bodyMessages.filter((m) => m.type !== 'character'),
                replyBubble,
              ];
            }

            // App praise only for model-graded passes. Code-graded already praised in storyReaction.
            // Dropped R1 on a code pass → next story line only (no second praise).
            if (
              !filtered &&
              passed &&
              reaction.mode === 'practice' &&
              !isNearMiss &&
              reaction.source === 'you'
            ) {
              const praise = takePracticePraise(progress);
              writeDataMessages(writer, [praise]);
              outbound.push(praise);
              rememberPraise(progress, [praise]);
            } else if (shouldEmitPracticePraise(reaction, verdictForVoices) && filtered) {
              const praise = takePracticePraise(progress);
              writeDataMessages(writer, [praise]);
              outbound.push(praise);
              rememberPraise(progress, [praise]);
            }

            if (bodyMessages.length) {
              rememberPraise(progress, bodyMessages);
              writeDataMessages(writer, bodyMessages);
              outbound.push(...bodyMessages);
            }

            // Assessment wrong attempt 1: show nudge_note from the pack (no model coach).
            if (
              reaction.mode === 'assessment' &&
              modelVerdict === 'wrong' &&
              (reaction.attempt ?? 1) < 2 &&
              reaction.nudgeNote
            ) {
              const nudge = makeCoachNote(reaction.nudgeNote);
              writeDataMessages(writer, [nudge]);
              outbound.push(nudge);
            }

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
            } else if (!filtered && passed && reaction.mode === 'practice') {
              // Keep advancing when the character reaction was dropped.
              nextPrompts =
                reaction.nextPrompts ??
                (reaction.nextPrompt ? [reaction.nextPrompt] : nextPrompts);
            }

            if (nextPrompts.length) {
              writeDataMessages(writer, nextPrompts);
              outbound.push(...nextPrompts);
            }

            // Never a silent turn: every learner message gets a visible reply.
            const added = outbound.slice(applied.messages.length);
            if (userText.trim() && added.length === 0) {
              if (reaction.mode === 'side' && reaction.nextPrompt) {
                writeDataMessages(writer, [reaction.nextPrompt]);
                outbound.push(reaction.nextPrompt);
              } else if (
                passed &&
                reaction.mode === 'practice' &&
                !isNearMiss &&
                reaction.source === 'you'
              ) {
                const praise = takePracticePraise(progress);
                writeDataMessages(writer, [praise]);
                outbound.push(praise);
                if (pack) {
                  const fallback = unresolvedPracticePrompt(progress, pack);
                  if (fallback) {
                    writeDataMessages(writer, [fallback]);
                    outbound.push(fallback);
                  }
                }
              } else if (passed && reaction.mode === 'practice' && !isNearMiss && pack) {
                // Code-graded: praise already in the turn; keep the story moving.
                const fallback = unresolvedPracticePrompt(progress, pack);
                if (fallback) {
                  writeDataMessages(writer, [fallback]);
                  outbound.push(fallback);
                }
              } else if (passed && reaction.mode === 'practice' && isNearMiss && pack) {
                const fallback = unresolvedPracticePrompt(progress, pack);
                if (fallback) {
                  writeDataMessages(writer, [fallback]);
                  outbound.push(fallback);
                }
              } else if (reaction.hintNote || reaction.nudgeNote || reaction.whyNote) {
                // Prefer why on attempt 2+; otherwise hint / nudge. commitOpenVerdict usually already pushed coach.
                const attempt = progress.practice?.attemptsOnCurrent ?? 0;
                const noteText =
                  attempt >= 2
                    ? reaction.whyNote || reaction.hintNote || reaction.nudgeNote
                    : reaction.hintNote || reaction.nudgeNote || reaction.whyNote;
                const note = makeCoachNote(noteText || 'جرّب تاني');
                writeDataMessages(writer, [note]);
                outbound.push(note);
              } else if (pack && progress.practice?.phase === 'story') {
                const fallback = unresolvedPracticePrompt(progress, pack);
                if (fallback) {
                  writeDataMessages(writer, [fallback]);
                  outbound.push(fallback);
                }
              }
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
