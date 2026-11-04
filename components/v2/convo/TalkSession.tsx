'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { NoteCard } from '@/components/v2/NoteCard';
import { PrimaryButton } from '@/components/v2/PrimaryButton';
import type { ConvoTurnStreamEvent } from '@/lib/v2/convo/turn';
import { CharacterBubble } from './CharacterBubble';
import { LearnerBubble } from './LearnerBubble';
import { readConvoNdjson } from './readNdjson';
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
  const [bubbles, setBubbles] = useState<TalkBubble[]>([]);
  const [pending, setPending] = useState<TalkPendingQuestion | null>(null);
  const [snapshot, setSnapshot] = useState<TalkSessionSnapshot | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [bootstrapped, setBootstrapped] = useState(false);
  const [metrics, setMetrics] = useState<TalkTurnMetrics | null>(null);
  const [turnCount, setTurnCount] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const streamBubbleId = useRef<string | null>(null);

  const scrollToEnd = useCallback(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(() => {
    scrollToEnd();
  }, [bubbles, pending, scrollToEnd]);

  const applyEvent = useCallback((event: ConvoTurnStreamEvent) => {
    if (event.type === 'coach') {
      setBubbles((prev) => [
        ...prev,
        { id: newId('coach'), role: 'coach', eg: event.eg, moment: event.moment },
      ]);
      return;
    }
    if (event.type === 'group_advance') {
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
        // Dropped reaction — remove streaming bubble content
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
      // Finalize streaming bubble
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
      }
      setPending({
        id: event.id,
        tl: event.tl,
        say: event.say,
        kind: event.kind,
        item_id: event.item_id,
        option_ids: event.option_ids,
        options: event.options,
        audio_key: event.audio_key,
      });
      return;
    }
    if (event.type === 'session') {
      setSnapshot(event.session as TalkSessionSnapshot);
      if (event.session.status === 'done') {
        setPending(null);
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
  }, []);

  const runTurn = useCallback(
    async (learnerText: string) => {
      if (!sessionId || busy) return;
      setBusy(true);
      setError(null);
      streamBubbleId.current = null;
      try {
        const res = await fetch('/api/v2/convo/turn', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: sessionId, text: learnerText }),
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

  // Start session once
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
        const openingBubbles: TalkBubble[] = [
          {
            id: newId('open'),
            role: 'character',
            tl: body.opening.character.tl,
            say: body.opening.character.say,
          },
          ...body.opening.coach_intros
            .filter((c) => c.coach_intro_eg)
            .map((c) => ({
              id: newId('intro'),
              role: 'coach' as const,
              eg: c.coach_intro_eg,
              moment: 'group_intro',
            })),
        ];
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

  // Bootstrap first question after start
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

  const showChips =
    pending &&
    (pending.kind === 'choice' ||
      (pending.kind === 'help' && (pending.options?.length ?? 0) > 0)) &&
    (pending.options?.length ?? 0) > 0;

  const done = snapshot?.status === 'done' || snapshot?.phase === 'closing';

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
          return (
            <NoteCard key={b.id} className="self-stretch">
              {b.eg}
            </NoteCard>
          );
        })}

        {done ? (
          <div className="mt-4 rounded-2xl border border-v2-line bg-v2-card px-4 py-5 text-center shadow-[var(--shadow-v2-soft)]">
            <p className="font-[family-name:var(--font-v2-arabic)] text-base font-semibold text-v2-primary">
              خلّصت المحادثة 👏
            </p>
            <p className="mt-1 font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink-muted">
              كرت النتيجة والنطق جايين في خطوة لاحقة.
            </p>
            {day ? (
              <Link
                href={`/day/${day}`}
                className="mt-3 inline-block font-[family-name:var(--font-v2-arabic)] text-sm font-semibold text-v2-action"
              >
                رجوع لليوم
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>

      <TalkDevPanel metrics={metrics} turnCount={turnCount} />

      {!done && !loading ? (
        <section className="shrink-0 border-t border-v2-line/60 bg-v2-paper px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2">
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
        </section>
      ) : null}
    </main>
  );
}
