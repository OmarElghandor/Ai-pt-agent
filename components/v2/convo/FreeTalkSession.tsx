'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ConvoTurnStreamEvent } from '@/lib/v2/convo/turn';
import type { ConvoSessionSummary } from '@/lib/v2/convo/result';
import { CharacterBubble } from './CharacterBubble';
import { CoachCard } from './CoachCard';
import {
  ConvoDevMenu,
  readConvoModelChoice,
  type ConvoModelChoice,
} from './ConvoDevMenu';
import { ConvoSummaryCard } from './ConvoSummaryCard';
import { ConvoVoiceBar } from './ConvoVoiceBar';
import { LearnerBubble } from './LearnerBubble';
import { readConvoNdjson } from './readNdjson';
import { TalkDevPanel, type TalkTurnMetrics } from './TalkDevPanel';
import { reduceFreeTalkStream } from './freeTalkStreamReduce';
import { freeTalkTopicHeaderLine } from '@/lib/v2/convo/ui/topicHeader';
import type { TalkBubble } from './types';

const PARTNERS = [
  { id: 'ines', label: 'Inês' },
  { id: 'tiago', label: 'Tiago' },
  { id: 'nour', label: 'Nour' },
] as const;

function newId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function partnerLabel(id: string): string {
  return PARTNERS.find((p) => p.id === id)?.label ?? 'Inês';
}

type Props = {
  topicId: string;
  /** Seed open-mode suggested words from this day's core items (P4). */
  day?: number | null;
  /** Dev-only curriculum level override (`?level=N`). */
  level?: number | null;
};

export function FreeTalkSession({
  topicId,
  day = null,
  level = null,
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [titleTl, setTitleTl] = useState('');
  const [titleAr, setTitleAr] = useState('');
  const [lessonDay, setLessonDay] = useState<number | null>(
    day != null && day > 0 ? day : null,
  );
  const [bubbles, setBubbles] = useState<TalkBubble[]>([]);
  const [busy, setBusy] = useState(false);
  const [metrics, setMetrics] = useState<TalkTurnMetrics | null>(null);
  const [turnCount, setTurnCount] = useState(0);
  const [lessonHref, setLessonHref] = useState<string | null>(null);
  const [frame, setFrame] = useState<{
    tl: string;
    eg: string;
    chips: string[];
  } | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [assisted, setAssisted] = useState(false);
  const [openMode, setOpenMode] = useState(topicId === 'open');
  const [characterId, setCharacterId] = useState('ines');
  const [convoModel, setConvoModel] = useState<ConvoModelChoice>('qwen');
  const [summary, setSummary] = useState<ConvoSessionSummary | null>(null);
  const [ending, setEnding] = useState(false);

  useEffect(() => {
    setConvoModel(readConvoModelChoice());
  }, []);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bubblesRef = useRef<TalkBubble[]>([]);
  const streamBubbleId = useRef<string | null>(null);
  const correctionCountRef = useRef(0);

  const commitBubbles = useCallback((next: TalkBubble[]) => {
    bubblesRef.current = next;
    setBubbles(next);
  }, []);

  const scrollToEnd = useCallback(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(() => {
    scrollToEnd();
  }, [bubbles, scrollToEnd]);

  const applyEvent = useCallback(
    (event: ConvoTurnStreamEvent) => {
      if (event.type === 'cta') {
        setLessonHref(event.href);
        return;
      }
      if (event.type === 'cta_navigate') {
        setLessonHref(null);
        router.push(event.href);
        return;
      }
      if (event.type === 'cta_dismissed') {
        setLessonHref(null);
        return;
      }
      if (event.type === 'coach') {
        if (event.id === 'threads_done_open') {
          setOpenMode(true);
        }
        commitBubbles([
          ...bubblesRef.current,
          {
            id: newId('coach'),
            role: 'coach',
            eg: event.eg,
            moment: event.moment,
            ...(event.segments ? { segments: event.segments } : {}),
          },
        ]);
        return;
      }
      if (
        event.type === 'reaction_reset' ||
        event.type === 'reaction_delta' ||
        event.type === 'authored_append' ||
        event.type === 'bubble_ar' ||
        event.type === 'question' ||
        event.type === 'correction'
      ) {
        // Reduce synchronously so streamBubbleId is current before the next
        // NDJSON event in the same read() chunk (TalkSession pattern).
        const next = reduceFreeTalkStream(
          {
            bubbles: bubblesRef.current,
            streamBubbleId: streamBubbleId.current,
            correctionIndex: correctionCountRef.current,
          },
          event,
          { newId },
        );
        streamBubbleId.current = next.streamBubbleId;
        correctionCountRef.current = next.correctionIndex;
        commitBubbles(next.bubbles);
        return;
      }
      if (event.type === 'free_frame') {
        setFrame({
          tl: event.tl,
          eg: event.eg,
          chips: event.chips,
        });
        return;
      }
      if (event.type === 'metrics') {
        setMetrics({
          input_tokens: event.input_tokens,
          cached_input_tokens: event.cached_input_tokens,
          output_tokens: event.output_tokens,
          ttft_ms: event.ttft_ms,
          total_ms: event.total_ms,
        });
        setTurnCount((n) => n + 1);
        return;
      }
      if (event.type === 'done' && !event.ok) {
        setError(event.error ?? 'turn failed');
      }
    },
    [router, commitBubbles],
  );
  const runTurn = useCallback(
    async (
      learnerText: string,
      opts?: {
        assisted?: boolean;
        dismissCta?: boolean;
        learnerTurnId?: string;
      },
    ) => {
      if (!sessionId || busy) return;
      setBusy(true);
      setError(null);
      streamBubbleId.current = null;
      const useAssisted = opts?.assisted ?? assisted;
      try {
        const res = await fetch('/api/v2/convo/turn', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: sessionId,
            text: learnerText,
            convo_model: convoModel,
            ...(useAssisted ? { assisted: true } : {}),
            ...(openMode ? { character_id: characterId } : {}),
            ...(opts?.dismissCta ? { dismiss_cta: true } : {}),
            ...(opts?.learnerTurnId
              ? { learner_turn_id: opts.learnerTurnId }
              : {}),
          }),
        });
        if (!res.ok || !res.body) {
          throw new Error(`turn ${res.status}`);
        }
        for await (const event of readConvoNdjson(res.body)) {
          applyEvent(event);
        }
        setAssisted(false);
        setHelpOpen(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'turn failed');
      } finally {
        setBusy(false);
      }
    },
    [sessionId, busy, applyEvent, assisted, openMode, characterId, convoModel],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/v2/convo/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            module: 'free',
            topic_id: topicId,
            ...(day != null ? { day } : {}),
            ...(level != null ? { level } : {}),
          }),
        });
        if (!res.ok) throw new Error(`start ${res.status}`);
        const data = (await res.json()) as {
          session_id: string;
          resumed: boolean;
          opening: {
            character: { tl: string; ar?: string };
            coach_intros?: Array<{ item_id: string; coach_intro_eg: string }>;
          };
          reopening?: { character_tl: string; pending_tl: string | null };
          title_tl?: string;
          title_ar?: string;
          lesson_day?: number | null;
          current_frame?: {
            tl: string;
            eg: string;
            chips: string[];
          } | null;
          warm_lines?: string[];
          open_mode?: boolean;
          character_id?: string;
        };
        if (cancelled) return;
        setSessionId(data.session_id);
        setTitleTl(data.title_tl ?? '');
        setTitleAr(data.title_ar ?? '');
        const resolvedDay =
          typeof data.lesson_day === 'number' && data.lesson_day > 0
            ? data.lesson_day
            : day != null && day > 0
              ? day
              : null;
        setLessonDay(resolvedDay);
        // Trust API open_mode (false whenever goals.length > 0). Do not force
        // open just because topicId === 'open' — that hid locked topic titles.
        setOpenMode(resolvedDay ? false : Boolean(data.open_mode));
        if (data.character_id) setCharacterId(data.character_id);
        if (data.current_frame) setFrame(data.current_frame);
        const warm = (data.warm_lines ?? []).slice(0, 3);
        for (const line of warm) {
          void fetch('/api/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: line, lang: 'pt' }),
          }).catch(() => {});
        }
        const next: TalkBubble[] = [];
        if (data.resumed && data.reopening) {
          next.push({
            id: newId('reopen'),
            role: 'character',
            tl: data.reopening.character_tl,
          });
        } else {
          for (const intro of data.opening.coach_intros ?? []) {
            next.push({
              id: newId('coach'),
              role: 'coach',
              eg: intro.coach_intro_eg,
              moment: 'intro',
            });
          }
          const openTl = data.opening.character.tl?.trim() ?? '';
          if (openTl) {
            next.push({
              id: newId('open'),
              role: 'character',
              tl: openTl,
              ar: data.opening.character.ar,
            });
          }
        }
        commitBubbles(next);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'start failed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [topicId, day, level, commitBubbles]);

  const sendPt = (t: string, opts?: { assisted?: boolean }) => {
    if (!t.trim() || busy) return;
    if (opts?.assisted) setAssisted(true);
    const learnerTurnId = newId('learner');
    commitBubbles([
      ...bubblesRef.current,
      { id: learnerTurnId, role: 'learner', tl: t.trim() },
    ]);
    void runTurn(t.trim(), {
      assisted: opts?.assisted,
      learnerTurnId,
    });
  };

  const endSession = async () => {
    if (!sessionId || ending) return;
    setEnding(true);
    try {
      const res = await fetch('/api/v2/convo/end', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId }),
      });
      if (!res.ok) throw new Error(`end ${res.status}`);
      const data = (await res.json()) as { summary: ConvoSessionSummary };
      setSummary(data.summary);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'end failed');
    } finally {
      setEnding(false);
    }
  };

  const isLessonDay = lessonDay != null && lessonDay > 0;
  const titlesLine =
    titleTl && titleAr
      ? `${titleTl} · ${titleAr}`
      : titleTl || titleAr || '';
  const topicLine = freeTalkTopicHeaderLine({
    lessonDay,
    openMode,
    topicId,
    titleTl,
    titleAr,
  });
  const headerTitle = isLessonDay
    ? [partnerLabel(characterId), titlesLine].filter(Boolean).join(' · ')
    : partnerLabel(characterId);
  const headerSub = isLessonDay
    ? `يوم ${lessonDay}${titleAr ? ` · ${titleAr}` : ''}`
    : topicLine;
  const chipLabel = isLessonDay
    ? `يوم ${lessonDay}${titleAr ? ` · ${titleAr}` : ''}`
    : topicLine;
  const partner = partnerLabel(characterId);
  const partnerInitial = partner.slice(0, 1).toUpperCase();

  if (summary) {
    return (
      <div className="v2-free-talk mx-auto flex h-[100dvh] w-full max-w-[390px] flex-col overflow-y-auto">
        <ConvoSummaryCard
          summary={summary}
          practiceHref="/talk/free/open"
          backHref="/talk"
          showPracticeCta={false}
        />
      </div>
    );
  }

  return (
    <div className="v2-free-talk mx-auto flex h-[100dvh] w-full max-w-[390px] flex-col">
      <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-2 border-b border-[var(--ft-border)]/60 bg-[color-mix(in_srgb,var(--ft-ivory)_80%,transparent)] px-3 shadow-[0_1px_8px_rgba(0,0,0,0.03)] backdrop-blur-xl">
        <Link
          href="/talk"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[var(--ft-ink)]"
          aria-label="رجوع"
        >
          <span className="material-symbols-rounded text-[22px]">
            arrow_forward
          </span>
        </Link>

        {isOpenTopic ? (
          <label className="relative shrink-0">
            <span className="sr-only">الشريك</span>
            <span
              aria-hidden
              className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--ft-moss)] font-[family-name:var(--font-ft-ui)] text-[14px] font-semibold text-white"
            >
              {partnerInitial}
            </span>
            <span
              aria-hidden
              className="absolute -bottom-0.5 -left-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--ft-surface)] text-[var(--ft-ink)] ring-1 ring-[var(--ft-border)]"
            >
              <span className="material-symbols-rounded text-[12px]">
                expand_more
              </span>
            </span>
            <select
              className="absolute inset-0 cursor-pointer opacity-0"
              value={characterId}
              onChange={(e) => setCharacterId(e.target.value)}
              dir="ltr"
              aria-label="اختيار الشريك"
            >
              {PARTNERS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <span
            aria-hidden
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--ft-moss)] font-[family-name:var(--font-ft-ui)] text-[14px] font-semibold text-white"
          >
            {partnerInitial}
          </span>
        )}

        <div className="min-w-0 flex-1">
          <h1 className="truncate font-[family-name:var(--font-ft-ui)] text-[15px] font-semibold text-[var(--ft-ink)]">
            {headerTitle}
          </h1>
          <p className="truncate font-[family-name:var(--font-ft-ar)] text-[11px] text-[var(--ft-text-secondary)]">
            {headerSub}
          </p>
        </div>

        <ConvoDevMenu
          topicId={topicId}
          day={day}
          onConvoModelChange={setConvoModel}
          onReloadStart={() => {
            commitBubbles([]);
            setSessionId(null);
            setLoading(true);
            setSummary(null);
            // Remount start via topicId effect dependency bounce
            setCharacterId((c) => c);
            window.location.reload();
          }}
        />
        <button
          type="button"
          onClick={() => void endSession()}
          disabled={!sessionId || ending || loading}
          className="shrink-0 rounded-[var(--ft-radius-control)] bg-[var(--ft-sage)] px-3.5 py-1.5 font-[family-name:var(--font-ft-ar)] text-[13px] font-semibold text-[var(--ft-on-sage)] disabled:opacity-40"
        >
          خلّص
        </button>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
        <div className="flex flex-col gap-3.5">
          {isLessonDay || titleTl || titleAr ? (
            <div className="flex justify-center">
              <span className="rounded-[var(--ft-radius-control)] bg-[var(--ft-mist)]/50 px-3 py-1 font-[family-name:var(--font-ft-ar)] text-[11px] text-[var(--ft-text-secondary)]">
                {isLessonDay ? chipLabel : `الموضوع: ${topicLine}`}
              </span>
            </div>
          ) : null}

          {bubbles.map((b) => {
            if (b.role === 'character') {
              if (!b.tl.trim() && !b.streaming) return null;
              return (
                <CharacterBubble
                  key={b.id}
                  tone="calm"
                  partnerName={partnerLabel(characterId)}
                  tl={b.tl}
                  streaming={b.streaming}
                  meaningEg={b.ar}
                  ttsEpoch={b.ttsEpoch}
                  autoPlay={
                    !b.streaming && Boolean(b.final) && Boolean(b.tl.trim())
                  }
                />
              );
            }
            if (b.role === 'learner') {
              return (
                <LearnerBubble
                  key={b.id}
                  tone="calm"
                  tl={b.tl}
                  correction={b.correction ?? null}
                  onAddCard={(data) => {
                    void fetch('/api/v2/cards/custom', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        tl: data.corrected_tl,
                        ar: data.ar,
                      }),
                    });
                  }}
                />
              );
            }
            if (b.role === 'coach') {
              const moment = b.moment ?? '';
              const isSide =
                moment.startsWith('language_question') ||
                moment === 'arabic_answer' ||
                moment === 'non_learning';
              const isCorrection =
                moment === 'recast' || moment === 'correction';
              return (
                <CoachCard
                  key={b.id}
                  label={
                    isCorrection
                      ? 'تصحيح لطيف'
                      : isSide
                        ? 'المساعد اللغوي'
                        : moment === 'intro'
                          ? 'نصيحة المحادثة'
                          : undefined
                  }
                  correction={isCorrection}
                  segments={b.segments}
                >
                  {b.eg}
                </CoachCard>
              );
            }
            return null;
          })}
        </div>
      </div>

      {lessonHref ? (
        <div className="flex gap-2 px-4 pb-2">
          <Link
            href={lessonHref}
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-1 rounded-[var(--ft-radius-control)] bg-[var(--ft-sage)] px-4 py-2.5 font-[family-name:var(--font-ft-ar)] text-base font-semibold text-[var(--ft-on-sage)]"
          >
            يلا نتعلّم
          </Link>
          <button
            type="button"
            className="inline-flex min-h-11 flex-1 items-center justify-center rounded-[var(--ft-radius-control)] border border-[var(--ft-line)] px-4 py-2.5 font-[family-name:var(--font-ft-ar)] text-base text-[var(--ft-text)]"
            onClick={() => {
              setLessonHref(null);
              void runTurn('', { dismissCta: true });
            }}
          >
            لأ، نكمّل
          </button>
        </div>
      ) : null}

      {error ? (
        <p className="px-4 pb-2 font-[family-name:var(--font-ft-ar)] text-sm text-[var(--ft-text-secondary)]">
          {error}
        </p>
      ) : null}

      <TalkDevPanel metrics={metrics} turnCount={turnCount} />

      {!loading ? (
        <ConvoVoiceBar
          busy={busy}
          disabled={loading}
          frame={frame}
          helpOpen={helpOpen}
          onToggleHelp={() => setHelpOpen((v) => !v)}
          onSend={(t, opts) => sendPt(t, { assisted: opts?.assisted })}
          onArabicSend={(t) => {
            const learnerTurnId = newId('learner');
            commitBubbles([
              ...bubblesRef.current,
              { id: learnerTurnId, role: 'learner', tl: t },
            ]);
            void runTurn(t, { learnerTurnId });
          }}
          onUnclearStt={() => {
            commitBubbles([
              ...bubblesRef.current,
              {
                id: newId('coach'),
                role: 'coach',
                eg: 'ما سمعتكش كويس 🎧 قولها تاني؟',
                moment: 'stt_unclear',
              },
            ]);
          }}
          onSurvival={(action) => {
            const last = [...bubblesRef.current]
              .reverse()
              .find((b) => b.role === 'character' && b.tl);
            if (!last || last.role !== 'character') return;
            void fetch('/api/tts', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                text: last.tl,
                lang: 'pt',
                ...(action === 'slow' ? { slow: true } : {}),
              }),
            }).catch(() => {});
          }}
        />
      ) : null}
    </div>
  );
}
