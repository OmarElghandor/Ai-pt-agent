'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NoteCard } from '@/components/v2/NoteCard';
import { PrimaryButton } from '@/components/v2/PrimaryButton';
import { useMicRecorder } from '@/hooks/useMicRecorder';
import type { ConvoItemSurface, ConvoVisual } from '@/lib/v2/convo/pack';
import { buildConvoResultStats } from '@/lib/v2/convo/result';
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
import { ConvoMap } from './ConvoMap';
import { ConvoResultCard } from './ConvoResultCard';
import { ItemCard } from './ItemCard';
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
  const [visual, setVisual] = useState<ConvoVisual | null>(null);
  const [surfaces, setSurfaces] = useState<ConvoItemSurface[]>([]);
  const [bubbles, setBubbles] = useState<TalkBubble[]>([]);
  const [pending, setPending] = useState<TalkPendingQuestion | null>(null);
  const [snapshot, setSnapshot] = useState<TalkSessionSnapshot | null>(null);
  const [activeMapStep, setActiveMapStep] = useState<string | null>(null);
  const [wrongWay, setWrongWay] = useState<{
    from: string;
    toward: string;
  } | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [bootstrapped, setBootstrapped] = useState(false);
  const [metrics, setMetrics] = useState<TalkTurnMetrics | null>(null);
  const [turnCount, setTurnCount] = useState(0);
  const [voiceMode, setVoiceMode] = useState(true);
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
        if (event.card_ids.length > 0) {
          setBubbles((prev) => [
            ...prev,
            {
              id: newId('cards'),
              role: 'cards',
              card_ids: event.card_ids,
            },
          ]);
        }
        for (const intro of event.coach_intros) {
          if (!intro.coach_intro_eg) continue;
          setBubbles((prev) => [
            ...prev,
            {
              id: newId('intro'),
              role: 'coach',
              eg: intro.coach_intro_eg,
              moment: 'group_intro',
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
        if (event.wrong_way) flashWrongWay(event.wrong_way);
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
        if (event.tl) {
          setBubbles((prev) => [
            ...prev,
            {
              id: newId('q'),
              role: 'character',
              tl: event.tl,
              say: event.say,
            },
          ]);
          if (event.playback === 'slow') {
            pendingPlayRef.current = { tl: event.tl, slow: true };
          }
        }
        if (event.map_step) setActiveMapStep(event.map_step);
        setPending({
          id: event.id,
          tl: event.tl,
          say: event.say,
          kind: event.kind,
          item_id: event.item_id,
          option_ids: event.option_ids,
          options: event.options,
          map_step: event.map_step,
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
        };
        if (!res.ok) throw new Error(body.error ?? `start ${res.status}`);
        if (cancelled) return;
        setSessionId(body.session_id);
        setDay(body.day);
        setVisual(body.visual);
        setSurfaces(body.item_surfaces ?? []);
        setSnapshot({
          id: body.session.id,
          rungs: body.session.rungs,
          phase: body.session.phase,
          status: body.session.status,
          help_ladder: {
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
        const openingBubbles: TalkBubble[] = [
          {
            id: newId('open'),
            role: 'character',
            tl: body.opening.character.tl,
            say: body.opening.character.say,
          },
        ];
        if (body.opening.card_ids.length > 0) {
          openingBubbles.push({
            id: newId('cards'),
            role: 'cards',
            card_ids: body.opening.card_ids,
          });
        }
        openingBubbles.push(
          ...body.opening.coach_intros
            .filter((c) => c.coach_intro_eg)
            .map((c) => ({
              id: newId('intro'),
              role: 'coach' as const,
              eg: c.coach_intro_eg,
              moment: 'group_intro',
            })),
        );
        setBubbles(openingBubbles);
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
    if (!sessionId || bootstrapped || loading || busy) return;
    setBootstrapped(true);
    void runTurn('');
  }, [sessionId, bootstrapped, loading, busy, runTurn]);

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
      const spoken = await mic.stopAndTranscribe();
      if (!spoken) {
        if (mic.error) setError(mic.error);
        return;
      }
      setBubbles((prev) => [
        ...prev,
        { id: newId('you'), role: 'learner', tl: spoken },
      ]);
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

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[390px] flex-col bg-v2-paper">
      <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-v2-line/50 bg-v2-paper/95 px-3 py-3 backdrop-blur-md">
        <Link
          href={day ? `/day/${day}` : '/'}
          className="flex h-10 w-10 items-center justify-center rounded-full text-v2-primary hover:bg-v2-primary/10"
          aria-label="رجوع"
        >
          <span className="material-symbols-rounded text-[22px] rotate-180">
            arrow_back
          </span>
        </Link>
        <div className="min-w-0 flex-1 text-end">
          <p className="font-[family-name:var(--font-v2-ui)] text-[10px] font-semibold uppercase tracking-wide text-v2-action">
            محادثة · يوم {day ?? '—'}
          </p>
          <h1 className="truncate font-[family-name:var(--font-v2-arabic)] text-[15px] font-bold text-v2-primary">
            {packId}
          </h1>
        </div>
      </header>

      {visual?.type === 'map' ? (
        <ConvoMap
          visual={visual}
          characterNode={mapCharNode}
          activeStepId={activeMapStep ?? pending?.map_step ?? null}
          wrongWay={wrongWay}
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
            بنحضّر المحادثة…
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
                streaming={b.streaming}
              />
            );
          }
          if (b.role === 'learner') {
            return <LearnerBubble key={b.id} tl={b.tl} />;
          }
          if (b.role === 'cards') {
            return (
              <div key={b.id} className="flex flex-col gap-2 self-stretch">
                {b.card_ids.map((id) => {
                  const s = surfaceById.get(id);
                  return (
                    <ItemCard
                      key={id}
                      tl={s?.tl ?? id}
                      say={s?.say}
                      glyph={s?.glyph}
                    />
                  );
                })}
              </div>
            );
          }
          return (
            <NoteCard key={b.id} className="self-stretch">
              {b.eg}
            </NoteCard>
          );
        })}

        {done && resultStats ? (
          <ConvoResultCard day={day} stats={resultStats} />
        ) : null}
      </div>

      <TalkDevPanel metrics={metrics} turnCount={turnCount} />

      {!done && !loading ? (
        <section className="shrink-0 border-t border-v2-line/60 bg-v2-paper px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">
          <div className="mb-2 flex flex-wrap justify-end gap-1.5">
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
                className="rounded-v2-pill border border-v2-line bg-white px-2.5 py-1.5 font-[family-name:var(--font-v2-target)] text-[11px] font-semibold text-v2-primary disabled:opacity-50"
              >
                {label}
              </button>
            ))}
          </div>

          {showChips ? (
            <div className="mb-2 flex flex-wrap justify-end gap-2">
              {pending!.options!.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  disabled={busy}
                  onClick={() => submitChoice(opt.tl)}
                  dir="ltr"
                  className="rounded-v2-pill border border-v2-primary/20 bg-white px-3 py-2 font-[family-name:var(--font-v2-target)] text-sm font-semibold text-v2-primary shadow-sm active:scale-95 disabled:opacity-50"
                >
                  {opt.tl}
                </button>
              ))}
            </div>
          ) : null}

          {voiceMode ? (
            <div className="flex flex-col items-stretch gap-2">
              <button
                type="button"
                disabled={busy || !pending || mic.transcribing}
                onClick={() => void toggleMic()}
                className={[
                  'flex h-12 items-center justify-center gap-2 rounded-2xl font-[family-name:var(--font-v2-arabic)] text-sm font-semibold transition',
                  mic.recording
                    ? 'bg-v2-action text-white'
                    : 'bg-v2-primary text-white',
                  'disabled:opacity-50',
                ].join(' ')}
              >
                <span className="material-symbols-rounded text-[22px]">
                  {mic.recording ? 'stop' : 'mic'}
                </span>
                {mic.transcribing
                  ? 'بنحوّل الصوت…'
                  : mic.recording
                    ? 'وقّف التسجيل'
                    : 'اتكلم'}
              </button>
              <button
                type="button"
                onClick={() => {
                  mic.cancel();
                  setVoiceMode(false);
                }}
                className="font-[family-name:var(--font-v2-arabic)] text-[12px] text-v2-ink-muted underline-offset-2 hover:underline"
              >
                مش قادر أتكلم دلوقتي
              </button>
              {mic.error ? (
                <p className="font-[family-name:var(--font-v2-arabic)] text-[12px] text-v2-ink">
                  {mic.error}
                </p>
              ) : null}
            </div>
          ) : (
            <div className="flex items-end gap-2">
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
