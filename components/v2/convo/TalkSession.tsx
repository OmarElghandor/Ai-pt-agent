'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PrimaryButton } from '@/components/v2/PrimaryButton';
import { useMicRecorder } from '@/hooks/useMicRecorder';
import type { ConvoItemSurface, ConvoVisual } from '@/lib/v2/convo/pack';
import {
  buildConvoResultStats,
  type ConvoSessionSummary,
} from '@/lib/v2/convo/result';
import type { ConvoRung } from '@/lib/v2/convo/session';
import type {
  ConvoSurvivalAction,
  ConvoTurnStreamEvent,
} from '@/lib/v2/convo/turn';
import {
  mapCharacterNode,
  mapHiddenForPhase,
} from '@/lib/v2/convo/visual';
import { CharacterBubble } from './CharacterBubble';
import { CoachCard } from './CoachCard';
import { ConvoMap } from './ConvoMap';
import { ConvoResultCard } from './ConvoResultCard';
import { ConvoSummaryCard } from './ConvoSummaryCard';
import { GroupCoachCard } from './GroupCoachCard';
import { LearnerBubble } from './LearnerBubble';
import { readConvoNdjson } from './readNdjson';
import { SceneCardVisual } from './SceneCardVisual';
import { TalkDevPanel, type TalkTurnMetrics } from './TalkDevPanel';
import type {
  TalkBubble,
  TalkPendingQuestion,
  TalkSessionSnapshot,
  TalkStartResponse,
} from './types';

const ACCENTS = ['ã', 'õ', 'ç', 'á', 'é', 'í', 'ó', 'ú', 'â', 'ê', 'ô', 'à'];

function newId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

type Props = { packId: string };

export function TalkSession({ packId }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [day, setDay] = useState<number | null>(null);
  const [titleTl, setTitleTl] = useState('');
  const [titleAr, setTitleAr] = useState('');
  const [groupCount, setGroupCount] = useState(3);
  const [partnerName, setPartnerName] = useState('Inês');
  const [visual, setVisual] = useState<ConvoVisual | null>(null);
  const [surfaces, setSurfaces] = useState<ConvoItemSurface[]>([]);
  const [bridgeTl, setBridgeTl] = useState('');
  const [freeTopicId, setFreeTopicId] = useState<string | null>(null);
  const [bubbles, setBubbles] = useState<TalkBubble[]>([]);
  const [pending, setPending] = useState<TalkPendingQuestion | null>(null);
  const [snapshot, setSnapshot] = useState<TalkSessionSnapshot | null>(null);
  const [activeMapStep, setActiveMapStep] = useState<string | null>(null);
  const [pulseNodeId, setPulseNodeId] = useState<string | null>(null);
  const [highlightNodeId, setHighlightNodeId] = useState<string | null>(null);
  const [highlightItemId, setHighlightItemId] = useState<string | null>(null);
  const [mapCollapsed, setMapCollapsed] = useState(false);
  const [wrongWay, setWrongWay] = useState<{
    from: string;
    toward: string;
  } | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [bootstrapped, setBootstrapped] = useState(false);
  /** When true, skip empty bootstrap turn (resumed mid-conversation). */
  const [skipBootstrap, setSkipBootstrap] = useState(false);
  const [metrics, setMetrics] = useState<TalkTurnMetrics | null>(null);
  const [turnCount, setTurnCount] = useState(0);
  const [voiceMode, setVoiceMode] = useState(true);
  const [sttMs, setSttMs] = useState<number | null>(null);
  const [firstAudioMs, setFirstAudioMs] = useState<number | null>(null);
  const [ttsMs, setTtsMs] = useState<number | null>(null);
  const sendAtRef = useRef<number | null>(null);
  const [summary, setSummary] = useState<ConvoSessionSummary | null>(null);
  const [practiceHref, setPracticeHref] = useState('/talk/practice');
  const [ending, setEnding] = useState(false);
  const mic = useMicRecorder({ language: 'pt-PT' });
  const scrollRef = useRef<HTMLDivElement>(null);
  const streamBubbleId = useRef<string | null>(null);
  const wrongWayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPlayRef = useRef<{ tl: string; slow: boolean } | null>(null);

  const scrollToEnd = useCallback(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(() => {
    scrollToEnd();
  }, [bubbles, pending, scrollToEnd]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => setMapCollapsed(el.scrollTop > 24);
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [loading]);

  useEffect(() => {
    try {
      const v = localStorage.getItem('v2.talk.inputMode');
      if (v === 'text') setVoiceMode(false);
      if (v === 'voice') setVoiceMode(true);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    return () => {
      if (wrongWayTimer.current) clearTimeout(wrongWayTimer.current);
    };
  }, []);

  const flashWrongWay = useCallback((ww: { from: string; toward: string }) => {
    setWrongWay(ww);
    if (wrongWayTimer.current) clearTimeout(wrongWayTimer.current);
    wrongWayTimer.current = setTimeout(() => setWrongWay(null), 1600);
  }, []);

  const applyEvent = useCallback(
    (event: ConvoTurnStreamEvent) => {
      if (event.type === 'coach') {
        setBubbles((prev) => [
          ...prev,
          {
            id: newId('coach'),
            role: 'coach',
            eg: event.eg,
            moment: event.moment,
          },
        ]);
        return;
      }
      if (event.type === 'group_advance') {
        if (event.card_ids.length > 0 || event.intro_eg) {
          setBubbles((prev) => [
            ...prev,
            {
              id: newId('group'),
              role: 'group_coach',
              intro_eg: event.intro_eg,
              card_ids: event.card_ids,
              coach_intros: event.coach_intros,
            },
          ]);
        }
        return;
      }
      if (event.type === 'help') {
        const help = event.help;
        if (help.hint_eg) {
          setBubbles((prev) => [
            ...prev,
            {
              id: newId('help'),
              role: 'coach',
              eg: help.hint_eg!,
              moment: 'miss_2',
            },
          ]);
        }
        return;
      }
      if (event.type === 'visual') {
        if (event.map_step) setActiveMapStep(event.map_step);
        if (event.map_node) setPulseNodeId(event.map_node);
        if (event.wrong_way) flashWrongWay(event.wrong_way);
        if (event.highlight_node_id) {
          setHighlightNodeId(event.highlight_node_id);
        }
        if (event.highlight_item_id) {
          setHighlightItemId(event.highlight_item_id);
        }
        return;
      }
      if (event.type === 'reaction_delta') {
        const id = streamBubbleId.current;
        if (!id) {
          const nid = newId('char');
          streamBubbleId.current = nid;
          setBubbles((prev) => [
            ...prev,
            {
              id: nid,
              role: 'character',
              tl: event.text,
              streaming: true,
            },
          ]);
        } else if (event.text === '') {
          setBubbles((prev) =>
            prev.map((b) =>
              b.id === id && b.role === 'character'
                ? { ...b, tl: '', streaming: false }
                : b,
            ),
          );
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
      if (event.type === 'question') {
        if (event.tl) {
          setBubbles((prev) => {
            const sid = streamBubbleId.current;
            const idx = sid
              ? prev.findIndex((b) => b.id === sid)
              : prev.length - 1;
            const target =
              idx >= 0 && prev[idx]?.role === 'character' ? prev[idx] : null;
            if (target && target.role === 'character') {
              const merged = `${target.tl} ${event.tl}`.trim();
              return prev.map((b, i) =>
                i === idx && b.role === 'character'
                  ? {
                      ...b,
                      tl: merged,
                      say: event.say ?? b.say,
                      ar: event.ar ?? b.ar,
                      streaming: false,
                    }
                  : b,
              );
            }
            return [
              ...prev,
              {
                id: newId('q'),
                role: 'character' as const,
                tl: event.tl,
                say: event.say,
                ar: event.ar,
              },
            ];
          });
          streamBubbleId.current = null;
          if (event.playback === 'slow') {
            pendingPlayRef.current = { tl: event.tl, slow: true };
          }
        } else if (streamBubbleId.current) {
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
        if (event.map_step) setActiveMapStep(event.map_step);
        if (event.map_node) setPulseNodeId(event.map_node);
        setPending({
          id: event.id,
          tl: event.tl,
          say: event.say,
          ar: event.ar,
          kind: event.kind,
          item_id: event.item_id,
          option_ids: event.option_ids,
          options: event.options,
          map_step: event.map_step,
          map_node: event.map_node,
          audio_key: event.audio_key,
        });
        return;
      }
      if (event.type === 'session') {
        setSnapshot(event.session as TalkSessionSnapshot);
        if (event.session.status === 'done') {
          setPending(null);
          setActiveMapStep(null);
        }
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
    [flashWrongWay],
  );

  const runTurn = useCallback(
    async (
      learnerText: string,
      opts?: { survival?: ConvoSurvivalAction },
    ) => {
      if (!sessionId || busy) return;
      setBusy(true);
      setError(null);
      streamBubbleId.current = null;
      try {
        const res = await fetch('/api/v2/convo/turn', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: sessionId,
            text: learnerText,
            ...(opts?.survival ? { survival: opts.survival } : {}),
          }),
        });
        if (!res.ok || !res.body) {
          const body = (await res.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(body?.error ?? `turn ${res.status}`);
        }
        for await (const event of readConvoNdjson(res.body)) {
          applyEvent(event);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'turn failed');
      } finally {
        setBusy(false);
      }
    },
    [sessionId, busy, applyEvent],
  );

  // Auto-play slow survival lines via TTS playbackRate
  useEffect(() => {
    const pendingPlay = pendingPlayRef.current;
    if (!pendingPlay) return;
    pendingPlayRef.current = null;
    void (async () => {
      try {
        const res = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: pendingPlay.tl, lang: 'pt' }),
        });
        if (!res.ok) return;
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.preservesPitch = true;
        audio.playbackRate = pendingPlay.slow ? 0.75 : 1;
        audio.onended = () => URL.revokeObjectURL(url);
        await audio.play();
      } catch {
        // ignore TTS errors
      }
    })();
  }, [pending, bubbles]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/v2/convo/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pack_id: packId }),
        });
        const body = (await res.json()) as TalkStartResponse & {
          error?: string;
          error_eg?: string;
          code?: string;
        };
        if (!res.ok) {
          throw new Error(
            body.error_eg || body.error || `start ${res.status}`,
          );
        }
        if (cancelled) return;
        setSessionId(body.session_id);
        setDay(body.day);
        setTitleTl(body.title_tl ?? '');
        setTitleAr(body.title_ar ?? '');
        setGroupCount(body.group_count ?? 3);
        if (body.character_id === 'ines') setPartnerName('Inês');
        else if (body.character_id === 'manuel') setPartnerName('Manuel');
        else if (body.character_id) setPartnerName(body.character_id);
        setVisual(body.visual);
        setSurfaces(body.item_surfaces ?? []);
        setBridgeTl(
          typeof body.bridge_tl === 'string' ? body.bridge_tl : '',
        );
        setFreeTopicId(
          typeof body.free_topic_id === 'string' ? body.free_topic_id : null,
        );
        setSnapshot({
          id: body.session.id,
          rungs: body.session.rungs,
          phase: body.session.phase,
          status: body.session.status,
          help_ladder: body.session.help_ladder ?? {
            question_id: null,
            step: 0,
            attempts: 0,
          },
          current_group: body.session.current_group,
          pending_question: body.session.pending_question,
          correct_streak: 0,
          struggled: body.session.struggled ?? {},
          said_once: body.session.said_once ?? {},
          survival_used: body.session.survival_used ?? 0,
        });

        const resumedMid =
          Boolean(body.resumed && body.reopening?.pending_question);

        if (resumedMid && body.reopening) {
          // T4.1: template reopening + same pending question; no bootstrap turn.
          const reopenBubbles: TalkBubble[] = [
            {
              id: newId('reopen'),
              role: 'character',
              tl: body.reopening.character_tl,
            },
          ];
          if (body.reopening.coach?.eg) {
            reopenBubbles.push({
              id: newId('reopen-coach'),
              role: 'coach',
              eg: body.reopening.coach.eg,
              moment: 'returned_after_break',
            });
          }
          setBubbles(reopenBubbles);
          const pq = body.reopening.pending_question!;
          const ptl = body.reopening.pending_tl ?? '';
          if (ptl) {
            setPending({
              id: pq.id,
              tl: ptl,
              kind: pq.kind as TalkPendingQuestion['kind'],
              item_id: pq.item_id,
              audio_key:
                body.reopening.pending_audio_key ??
                `convo:${body.pack_id}:${pq.id}`,
            });
          }
          setSkipBootstrap(true);
          setBootstrapped(true);
        } else {
          const openingBubbles: TalkBubble[] = [];
          if (
            body.opening.card_ids.length > 0 ||
            body.opening.intro_eg
          ) {
            openingBubbles.push({
              id: newId('group'),
              role: 'group_coach',
              intro_eg: body.opening.intro_eg,
              card_ids: body.opening.card_ids,
              coach_intros: body.opening.coach_intros,
            });
          }
          openingBubbles.push({
            id: newId('open'),
            role: 'character',
            tl: body.opening.character.tl,
            say: body.opening.character.say,
            ar: body.opening.character.ar,
          });
          setBubbles(openingBubbles);
          setSkipBootstrap(false);
        }
        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'start failed');
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [packId]);

  useEffect(() => {
    if (!sessionId || bootstrapped || loading || busy || skipBootstrap) return;
    setBootstrapped(true);
    void runTurn('');
  }, [sessionId, bootstrapped, loading, busy, skipBootstrap, runTurn]);

  const submitText = () => {
    const t = text.trim();
    if (!t || busy || !pending) return;
    setBubbles((prev) => [
      ...prev,
      { id: newId('you'), role: 'learner', tl: t },
    ]);
    setText('');
    void runTurn(t);
  };

  const submitChoice = (optionTl: string) => {
    if (busy || !pending) return;
    setBubbles((prev) => [
      ...prev,
      { id: newId('you'), role: 'learner', tl: optionTl },
    ]);
    void runTurn(optionTl);
  };

  const runSurvival = (action: ConvoSurvivalAction) => {
    if (busy || !pending) return;
    void runTurn('', { survival: action });
  };

  const toggleMic = async () => {
    if (busy || !pending || !voiceMode) return;
    if (mic.recording) {
      const t0 = performance.now();
      const spoken = await mic.stopAndTranscribe();
      setSttMs(Math.round(performance.now() - t0));
      if (!spoken) {
        if (mic.error) setError(mic.error);
        setBubbles((prev) => [
          ...prev,
          {
            id: newId('coach'),
            role: 'coach',
            eg: 'ما سمعتكش كويس 🎧 قولها تاني؟',
            moment: 'stt_unclear',
          },
        ]);
        return;
      }
      setBubbles((prev) => [
        ...prev,
        { id: newId('you'), role: 'learner', tl: spoken },
      ]);
      sendAtRef.current = performance.now();
      setFirstAudioMs(null);
      void runTurn(spoken);
      return;
    }
    await mic.start();
  };

  const surfaceById = useMemo(() => {
    const m = new Map<string, ConvoItemSurface>();
    for (const s of surfaces) m.set(s.id, s);
    return m;
  }, [surfaces]);

  const mapCharNode = useMemo(() => {
    if (!visual || visual.type !== 'map' || !snapshot) return null;
    return mapCharacterNode(
      {
        visual,
        groups: [],
        items: {},
        pack_id: packId,
        day: day ?? 0,
        target_lang: 'pt-PT',
        scene: { character_id: '', place: '', information_gap: '' },
        recap: { questions: [] },
        opening: { tl: '' },
        closing: { tl: '' },
        bridge: { tl: '' },
      },
      snapshot.rungs as Record<string, ConvoRung>,
    );
  }, [visual, snapshot, packId, day]);

  const showChips =
    pending &&
    (pending.kind === 'choice' ||
      (pending.kind === 'help' && (pending.options?.length ?? 0) > 0)) &&
    (pending.options?.length ?? 0) > 0;

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
      const data = (await res.json()) as {
        summary: ConvoSessionSummary;
        practice_href?: string;
      };
      setSummary(data.summary);
      if (data.practice_href) setPracticeHref(data.practice_href);
      setSnapshot((s) => (s ? { ...s, status: 'done' } : s));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'end failed');
    } finally {
      setEnding(false);
    }
  };

  const done = snapshot?.status === 'done' || snapshot?.phase === 'closing';
  const hideVisual = mapHiddenForPhase(snapshot?.phase ?? 'teaching');

  const resultStats = useMemo(() => {
    if (!done || !snapshot) return null;
    const itemIds = Object.keys(snapshot.rungs);
    return buildConvoResultStats({
      session: {
        rungs: snapshot.rungs as Record<string, ConvoRung>,
        struggled: snapshot.struggled ?? {},
        said_once: snapshot.said_once ?? {},
        survival_used: snapshot.survival_used ?? 0,
      },
      pack: {
        visual: visual ?? { type: 'map', nodes: [], route: [] },
        groups: [{ id: 'all', item_ids: itemIds }],
        items: {},
        pack_id: packId,
        day: day ?? 0,
        target_lang: 'pt-PT',
        scene: { character_id: '', place: '', information_gap: '' },
        recap: { questions: [] },
        opening: { tl: '' },
        closing: { tl: '' },
        bridge: { tl: '' },
      },
      surfaceTl: (id) => surfaceById.get(id)?.tl ?? id,
    });
  }, [done, snapshot, visual, packId, day, surfaceById]);

  if (summary) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-[390px] flex-col overflow-y-auto bg-v2-paper">
        <ConvoSummaryCard
          summary={summary}
          lessonStats={resultStats}
          lessonDay={day}
          practiceHref={practiceHref}
          backHref="/talk/learn"
          showPracticeCta
        />
      </main>
    );
  }

  const topicLabel =
    titleTl && titleAr
      ? `${titleTl} · ${titleAr}`
      : titleTl || titleAr || 'محادثة';
  const currentGroup = snapshot?.current_group ?? 1;

  return (
    <main className="v2-free-talk mx-auto flex min-h-dvh w-full max-w-[390px] flex-col bg-[color:var(--ft-ivory,#F4EFE8)]">
      <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-[color:var(--ft-border,#E5DED5)] bg-[color:var(--ft-surface,#FBF8F3)]/95 px-3 py-3 backdrop-blur-md">
        <button
          type="button"
          onClick={() => void endSession()}
          disabled={!sessionId || ending || loading}
          className="shrink-0 rounded-full bg-white px-3 py-1.5 font-[family-name:var(--font-ft-ar,var(--font-v2-arabic))] text-sm font-semibold text-[color:var(--ft-ink,#202A25)] shadow-sm disabled:opacity-40"
        >
          خلّص
        </button>
        <div className="min-w-0 flex-1 text-center">
          <div className="mx-auto mb-1 flex h-9 w-9 items-center justify-center rounded-full bg-[color:var(--ft-sage,#6B7F6E)] text-sm font-semibold text-white">
            {partnerName.slice(0, 1)}
          </div>
          <p className="font-[family-name:var(--font-ft-pt,var(--font-v2-target))] text-[13px] font-semibold text-[color:var(--ft-ink,#202A25)]">
            {partnerName}
          </p>
          <h1 className="truncate font-[family-name:var(--font-ft-ar,var(--font-v2-arabic))] text-[12px] text-[color:var(--ft-text-secondary,#666963)]">
            {topicLabel}
          </h1>
          <div className="mt-1.5 flex justify-center gap-1.5" aria-hidden>
            {Array.from({ length: groupCount }, (_, i) => (
              <span
                key={i}
                className={[
                  'h-1.5 w-1.5 rounded-full',
                  i + 1 <= currentGroup
                    ? 'bg-[color:var(--ft-sage,#6B7F6E)]'
                    : 'bg-[color:var(--ft-mist,#D9E1D9)]',
                ].join(' ')}
              />
            ))}
          </div>
        </div>
        <Link
          href={day ? `/day/${day}` : '/talk/learn'}
          className="flex h-10 w-10 items-center justify-center rounded-full text-[color:var(--ft-sage,#6B7F6E)] hover:bg-[color:var(--ft-mist,#D9E1D9)]/50"
          aria-label="رجوع"
        >
          <span className="material-symbols-rounded text-[22px]">
            arrow_forward
          </span>
        </Link>
      </header>

      {visual?.type === 'map' ? (
        <ConvoMap
          visual={visual}
          characterNode={mapCharNode}
          activeStepId={activeMapStep ?? pending?.map_step ?? null}
          pulseNodeId={pulseNodeId ?? pending?.map_node ?? null}
          wrongWay={wrongWay}
          highlightNodeId={highlightNodeId}
          collapsed={mapCollapsed}
          hidden={hideVisual || done}
        />
      ) : null}
      {visual?.type === 'scene_card' ? (
        <SceneCardVisual
          visual={visual}
          activeHotspotIds={pending?.item_id ? [pending.item_id] : []}
          hidden={hideVisual || done}
        />
      ) : null}

      <div
        ref={scrollRef}
        className="flex flex-1 flex-col gap-3 overflow-y-auto px-3 py-4"
      >
        {loading ? (
          <p className="text-center font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink-muted">
            بنحضّر المحادثة… لو أول مرة، ممكن ناخد دقيقة نجهّزها
          </p>
        ) : null}
        {error ? (
          <p className="rounded-v2-row border border-v2-action/30 bg-v2-action/10 px-3 py-2 font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink">
            {error}
          </p>
        ) : null}

        {bubbles.map((b) => {
          if (b.role === 'character') {
            return (
              <CharacterBubble
                key={b.id}
                tl={b.tl}
                say={b.say}
                meaningEg={b.ar}
                streaming={b.streaming}
                tone="calm"
                partnerName={partnerName}
                autoPlay={!b.streaming && Boolean(b.tl)}
                onPlayStart={() => {
                  if (sendAtRef.current != null) {
                    const ms = Math.round(performance.now() - sendAtRef.current);
                    setFirstAudioMs((prev) => prev ?? ms);
                    setTtsMs(ms);
                  }
                }}
              />
            );
          }
          if (b.role === 'learner') {
            return <LearnerBubble key={b.id} tone="calm" tl={b.tl} />;
          }
          if (b.role === 'group_coach') {
            return (
              <GroupCoachCard
                key={b.id}
                introEg={b.intro_eg}
                cardIds={b.card_ids}
                coachIntros={b.coach_intros}
                surfaceById={surfaceById}
              />
            );
          }
          if (b.role === 'cards') {
            return (
              <GroupCoachCard
                key={b.id}
                cardIds={b.card_ids}
                coachIntros={[]}
                surfaceById={surfaceById}
              />
            );
          }
          return <CoachCard key={b.id}>{b.eg}</CoachCard>;
        })}

        {done && resultStats ? (
          <ConvoResultCard
            day={day}
            stats={resultStats}
            bridgeTl={bridgeTl}
            freeTopicId={freeTopicId}
          />
        ) : null}
      </div>

      <TalkDevPanel
        metrics={metrics}
        turnCount={turnCount}
        sttMs={sttMs}
        firstAudioMs={firstAudioMs}
        ttsMs={ttsMs}
      />

      {!done && !loading ? (
        <section className="shrink-0 border-t border-[color:var(--ft-border,#E5DED5)] bg-[color:var(--ft-surface,#FBF8F3)] px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">
          <div className="mb-2 flex flex-wrap justify-center gap-1.5">
            {(
              [
                ['repeat', 'Pode repetir?'],
                ['slow', 'Mais devagar'],
                ['nao_percebi', 'Não percebi'],
              ] as const
            ).map(([action, label]) => (
              <button
                key={action}
                type="button"
                disabled={busy || !pending}
                onClick={() => runSurvival(action)}
                dir="ltr"
                className="rounded-full border border-[color:var(--ft-border,#E5DED5)] bg-white px-2.5 py-1.5 font-[family-name:var(--font-ft-pt,var(--font-v2-target))] text-[11px] font-semibold text-[color:var(--ft-ink,#202A25)] disabled:opacity-50"
              >
                {label}
              </button>
            ))}
          </div>

          {showChips ? (
            <div className="mb-3 grid grid-cols-2 gap-2">
              {pending!.options!.map((opt) => {
                const s = surfaceById.get(opt.id);
                return (
                  <button
                    key={opt.id}
                    type="button"
                    disabled={busy}
                    onClick={() => submitChoice(opt.tl)}
                    className="rounded-2xl border border-[color:var(--ft-border,#E5DED5)] bg-white px-3 py-3 text-center shadow-sm active:scale-[0.98] disabled:opacity-50"
                  >
                    <span
                      className="block font-[family-name:var(--font-ft-ar,var(--font-v2-arabic))] text-[11px] text-[color:var(--ft-text-secondary,#666963)]"
                      dir="rtl"
                    >
                      {s?.say ? s.say : 'اختيار'}
                    </span>
                    <span
                      className="mt-0.5 block font-[family-name:var(--font-ft-pt,var(--font-v2-target))] text-[15px] font-semibold text-[color:var(--ft-ink,#202A25)]"
                      dir="ltr"
                    >
                      {opt.tl}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null}

          {voiceMode ? (
            <div className="flex flex-col items-stretch gap-2">
              <button
                type="button"
                disabled={busy || !pending || mic.transcribing}
                onClick={() => void toggleMic()}
                className={[
                  'ft-mic-halo mx-auto flex h-16 w-16 items-center justify-center rounded-full font-[family-name:var(--font-ft-ar,var(--font-v2-arabic))] text-sm font-semibold text-white shadow-[var(--ft-shadow-mic)] transition',
                  mic.recording
                    ? 'bg-[color:var(--ft-sage-dark,#4d6151)]'
                    : 'bg-[color:var(--ft-sage,#6B7F6E)]',
                  'disabled:opacity-50',
                ].join(' ')}
              >
                <span className="material-symbols-rounded text-[28px]">
                  {mic.recording ? 'stop' : 'mic'}
                </span>
              </button>
              <p className="text-center font-[family-name:var(--font-ft-ar,var(--font-v2-arabic))] text-[12px] text-[color:var(--ft-text-secondary,#666963)]">
                {mic.transcribing
                  ? 'بنحوّل الصوت…'
                  : mic.recording
                    ? 'وقّف التسجيل'
                    : 'دوس مطولاً على المايك واتكلم برتغالي 🇵🇹'}
              </p>
              <button
                type="button"
                onClick={() => {
                  mic.cancel();
                  setVoiceMode(false);
                  try {
                    localStorage.setItem('v2.talk.inputMode', 'text');
                  } catch {
                    /* ignore */
                  }
                }}
                className="flex items-center justify-center gap-1 font-[family-name:var(--font-v2-arabic)] text-[12px] text-v2-ink-muted"
                aria-label="لوحة المفاتيح"
              >
                <span className="material-symbols-rounded text-[18px]">
                  keyboard
                </span>
                اكتب
              </button>
              {mic.error ? (
                <p className="font-[family-name:var(--font-v2-arabic)] text-[12px] text-v2-ink">
                  {mic.error}
                </p>
              ) : null}
            </div>
          ) : (
            <div className="flex items-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setVoiceMode(true);
                  try {
                    localStorage.setItem('v2.talk.inputMode', 'voice');
                  } catch {
                    /* ignore */
                  }
                }}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-v2-card text-v2-primary"
                aria-label="مايك"
              >
                <span className="material-symbols-rounded text-[22px]">mic</span>
              </button>
              <div className="flex flex-1 flex-col gap-1">
                <div className="flex flex-wrap justify-end gap-1">
                  {ACCENTS.map((a) => (
                    <button
                      key={a}
                      type="button"
                      disabled={busy}
                      onClick={() => setText((t) => t + a)}
                      className="h-7 min-w-7 rounded-md bg-v2-paper-deep px-1.5 font-[family-name:var(--font-v2-target)] text-xs text-v2-primary"
                    >
                      {a}
                    </button>
                  ))}
                </div>
                <input
                  dir="ltr"
                  value={text}
                  disabled={busy || !pending}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      submitText();
                    }
                  }}
                  placeholder={busy ? '…' : 'اكتب بالبرتغالي…'}
                  className="w-full rounded-2xl border border-v2-line bg-white px-3 py-2.5 text-start font-[family-name:var(--font-v2-target)] text-sm text-v2-ink outline-none focus:border-v2-primary disabled:opacity-50"
                />
              </div>
              <PrimaryButton
                type="button"
                disabled={busy || !text.trim() || !pending}
                onClick={submitText}
                className="shrink-0"
              >
                إرسال
              </PrimaryButton>
            </div>
          )}
        </section>
      ) : null}
    </main>
  );
}
