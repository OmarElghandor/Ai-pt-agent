'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { NoteCard } from '@/components/v2/NoteCard';
import type { ConvoTurnStreamEvent } from '@/lib/v2/convo/turn';
import type { ConvoSessionSummary } from '@/lib/v2/convo/result';
import { CharacterBubble } from './CharacterBubble';
import { ConvoSummaryCard } from './ConvoSummaryCard';
import { ConvoVoiceBar } from './ConvoVoiceBar';
import { LearnerBubble } from './LearnerBubble';
import { readConvoNdjson } from './readNdjson';
import { TalkDevPanel, type TalkTurnMetrics } from './TalkDevPanel';
import type { TalkBubble } from './types';

const PARTNERS = [
  { id: 'ines', label: 'Inês' },
  { id: 'tiago', label: 'Tiago' },
  { id: 'nour', label: 'Nour' },
] as const;

function newId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

type Props = { topicId: string };

export function FreeTalkSession({ topicId }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [titleTl, setTitleTl] = useState('');
  const [titleAr, setTitleAr] = useState('');
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
  const [summary, setSummary] = useState<ConvoSessionSummary | null>(null);
  const [ending, setEnding] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const streamBubbleId = useRef<string | null>(null);

  const scrollToEnd = useCallback(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(() => {
    scrollToEnd();
  }, [bubbles, scrollToEnd]);

  const applyEvent = useCallback((event: ConvoTurnStreamEvent) => {
    if (event.type === 'coach') {
      if (event.id === 'threads_done_open') {
        setOpenMode(true);
      }
      if (event.id.startsWith('open_pack:')) {
        const packId = event.id.slice('open_pack:'.length);
        const hrefLine = event.eg.split('\n').find((l) => l.startsWith('/'));
        setLessonHref(hrefLine ?? `/talk/${encodeURIComponent(packId)}`);
      }
      setBubbles((prev) => [
        ...prev,
        {
          id: newId('coach'),
          role: 'coach',
          eg: event.eg.split('\n')[0] ?? event.eg,
          moment: event.moment,
        },
      ]);
      return;
    }
    if (event.type === 'reaction_delta') {
      const id = streamBubbleId.current;
      if (!id) {
        const nid = newId('char');
        streamBubbleId.current = nid;
        setBubbles((prev) => [
          ...prev,
          { id: nid, role: 'character', tl: event.text, streaming: true },
        ]);
      } else {
        setBubbles((prev) =>
          prev.map((b) =>
            b.id === id && b.role === 'character'
              ? { ...b, tl: b.tl + event.text, streaming: true }
              : b,
          ),
        );
      }
      return;
    }
    if (event.type === 'authored_append') {
      const sid = streamBubbleId.current;
      if (sid) {
        setBubbles((prev) =>
          prev.map((b) =>
            b.id === sid && b.role === 'character'
              ? {
                  ...b,
                  tl: `${b.tl}${b.tl.trim() ? ' ' : ''}${event.tl}`.trim(),
                  streaming: false,
                }
              : b,
          ),
        );
      } else {
        const nid = newId('char');
        streamBubbleId.current = nid;
        setBubbles((prev) => [
          ...prev,
          { id: nid, role: 'character', tl: event.tl, streaming: false },
        ]);
      }
      return;
    }
    if (event.type === 'bubble_ar') {
      const sid = streamBubbleId.current;
      if (sid) {
        setBubbles((prev) =>
          prev.map((b) =>
            b.id === sid && b.role === 'character'
              ? { ...b, ar: event.ar, streaming: false }
              : b,
          ),
        );
      }
      streamBubbleId.current = null;
      return;
    }
    if (event.type === 'question') {
      // Batch 9: authored line already in the same bubble via authored_append.
      if (streamBubbleId.current) {
        const sid = streamBubbleId.current;
        setBubbles((prev) =>
          prev.map((b) =>
            b.id === sid && b.role === 'character'
              ? { ...b, streaming: false }
              : b,
          ),
        );
        streamBubbleId.current = null;
      }
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
  }, []);

  const runTurn = useCallback(
    async (learnerText: string, opts?: { assisted?: boolean }) => {
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
            ...(useAssisted ? { assisted: true } : {}),
            ...(openMode ? { character_id: characterId } : {}),
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
    [sessionId, busy, applyEvent, assisted, openMode, characterId],
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
          body: JSON.stringify({ module: 'free', topic_id: topicId }),
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
        setOpenMode(Boolean(data.open_mode) || topicId === 'open');
        if (data.character_id) setCharacterId(data.character_id);
        if (data.current_frame) setFrame(data.current_frame);
        // Warm a few authored lines only — avoid flooding Network on start.
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
          next.push({
            id: newId('open'),
            role: 'character',
            tl: data.opening.character.tl,
            ar: data.opening.character.ar,
          });
        }
        setBubbles(next);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'start failed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [topicId]);

  const sendPt = (t: string, opts?: { assisted?: boolean }) => {
    if (!t.trim() || busy) return;
    if (opts?.assisted) setAssisted(true);
    setBubbles((prev) => [
      ...prev,
      { id: newId('learner'), role: 'learner', tl: t.trim() },
    ]);
    void runTurn(t.trim(), { assisted: opts?.assisted });
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

  if (summary) {
    return (
      <div className="mx-auto flex h-[100dvh] w-full max-w-[390px] flex-col overflow-y-auto bg-v2-paper">
        <ConvoSummaryCard
          summary={summary}
          practiceHref="/talk/practice"
          backHref="/talk/practice"
          showPracticeCta={false}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-[100dvh] w-full max-w-[390px] flex-col bg-v2-paper">
      <header className="flex items-center gap-2 border-b border-v2-line/40 px-3 py-3">
        <Link
          href="/talk/practice"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-v2-card text-v2-primary"
          aria-label="رجوع"
        >
          ←
        </Link>
        <div className="min-w-0 flex-1">
          <h1
            className="truncate font-[family-name:var(--font-v2-target)] text-lg font-semibold text-v2-primary"
            dir="ltr"
          >
            {titleTl || '…'}
          </h1>
          {titleAr ? (
            <p className="font-[family-name:var(--font-v2-arabic)] text-xs text-v2-ink-muted">
              {titleAr}
            </p>
          ) : null}
        </div>
        {openMode || topicId === 'open' ? (
          <label className="shrink-0">
            <span className="sr-only">الشريك</span>
            <select
              className="rounded-v2-chip border border-v2-line/50 bg-v2-card px-2 py-1 font-[family-name:var(--font-v2-target)] text-sm text-v2-primary"
              value={characterId}
              onChange={(e) => setCharacterId(e.target.value)}
              dir="ltr"
            >
              {PARTNERS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <button
          type="button"
          onClick={() => void endSession()}
          disabled={!sessionId || ending || loading}
          className="shrink-0 rounded-v2-chip bg-v2-primary/10 px-3 py-1.5 font-[family-name:var(--font-v2-arabic)] text-sm font-semibold text-v2-primary disabled:opacity-40"
        >
          خلّص
        </button>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-4">
        <div className="flex flex-col gap-3">
          {bubbles.map((b) => {
            if (b.role === 'character') {
              return (
                <CharacterBubble
                  key={b.id}
                  tl={b.tl}
                  say={b.say}
                  streaming={b.streaming}
                  meaningEg={b.ar}
                  autoPlay={!b.streaming && Boolean(b.tl)}
                />
              );
            }
            if (b.role === 'learner') {
              return <LearnerBubble key={b.id} tl={b.tl} />;
            }
            if (b.role === 'coach') {
              return (
                <NoteCard key={b.id} className="self-stretch">
                  {b.eg}
                </NoteCard>
              );
            }
            return null;
          })}
        </div>
      </div>

      {lessonHref ? (
        <div className="px-3 pb-2">
          <Link
            href={lessonHref}
            className="inline-flex min-h-11 items-center justify-center rounded-v2-chip bg-v2-action px-5 py-2.5 font-[family-name:var(--font-v2-arabic)] text-base font-semibold text-white"
          >
            افتح محادثة الدرس
          </Link>
        </div>
      ) : null}

      {error ? (
        <p className="px-3 pb-2 font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink-muted">
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
            setBubbles((prev) => [
              ...prev,
              { id: newId('learner'), role: 'learner', tl: t },
            ]);
            void runTurn(t);
          }}
          onUnclearStt={() => {
            setBubbles((prev) => [
              ...prev,
              {
                id: newId('coach'),
                role: 'coach',
                eg: 'ما سمعتكش كويس 🎧 قولها تاني؟',
                moment: 'stt_unclear',
              },
            ]);
          }}
          onSurvival={(action) => {
            const last = [...bubbles]
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
