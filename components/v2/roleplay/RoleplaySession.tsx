'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/v2/Icon';
import { CharacterBubble } from '@/components/v2/convo/CharacterBubble';
import { CoachCard } from '@/components/v2/convo/CoachCard';
import {
  ConvoDevMenu,
  readConvoModelChoice,
  type ConvoModelChoice,
} from '@/components/v2/convo/ConvoDevMenu';
import { ConvoVoiceBar } from '@/components/v2/convo/ConvoVoiceBar';
import { LearnerBubble } from '@/components/v2/convo/LearnerBubble';
import { usePacedBubbles } from '@/components/v2/convo/usePacedBubbles';
import type { TalkBubble } from '@/components/v2/convo/types';
import type { RoleplayTurnEvent } from '@/lib/v2/roleplay/events';
import { RoleplayResultCard } from './RoleplayResultCard';
import {
  applyRoleplayEvents,
  emptyRoleplayUiState,
  reduceRoleplayEvent,
  type RoleplayUiState,
} from './roleplayStreamReduce';

function newId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

async function* readRoleplayNdjson(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<RoleplayTurnEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      yield JSON.parse(line) as RoleplayTurnEvent;
    }
  }
  const tail = buffer.trim();
  if (tail) yield JSON.parse(tail) as RoleplayTurnEvent;
}

type Props = {
  situationId: string;
  titleTl: string;
  titleAr: string;
  sessionId: string;
  startEvents: RoleplayTurnEvent[];
  nextSituationId?: string | null;
  /** Unused placeholder kept for callers that still pass summary. */
  summaryEg?: string;
  /** First character TTS already played inside the start click handler. */
  firstLineAlreadyPlayed?: boolean;
};

export function RoleplaySession({
  situationId,
  titleTl,
  titleAr,
  sessionId,
  startEvents,
  nextSituationId = null,
  firstLineAlreadyPlayed = false,
}: Props) {
  const [ui, setUi] = useState<RoleplayUiState>(() =>
    applyRoleplayEvents(emptyRoleplayUiState(), startEvents),
  );
  const [busy, setBusy] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [convoModel, setConvoModel] = useState<ConvoModelChoice>('qwen');
  const scrollRef = useRef<HTMLDivElement>(null);
  const bubblesRef = useRef<TalkBubble[]>(ui.bubbles);
  const {
    visible: pacedVisible,
    syncAuthoritative,
    commitImmediate,
  } = usePacedBubbles();

  useEffect(() => {
    setConvoModel(readConvoModelChoice());
  }, []);

  useEffect(() => {
    bubblesRef.current = ui.bubbles;
    syncAuthoritative(ui.bubbles);
  }, [ui.bubbles, syncAuthoritative]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [pacedVisible, ui.help, ui.result, busy]);

  const send = useCallback(
    async (text: string, opts?: { help?: boolean; assisted?: boolean }) => {
      if (busy || ui.result) return;
      const trimmed = text.trim();
      if (!trimmed && !opts?.help) return;

      const learnerId = newId('learner');
      if (trimmed) {
        const withLearner: TalkBubble[] = [
          ...bubblesRef.current.filter((b) => !b.typing),
          { id: learnerId, role: 'learner', tl: trimmed },
        ];
        bubblesRef.current = withLearner;
        commitImmediate(withLearner);
        setUi((s) => ({ ...s, bubbles: withLearner, help: null }));
      }

      // Typing indicator while the server buffers the actor (no token stream).
      if (!opts?.help) {
        const typingId = newId('typing');
        const withTyping: TalkBubble[] = [
          ...bubblesRef.current.filter((b) => !b.typing),
          {
            id: typingId,
            role: 'character',
            tl: '',
            typing: true,
            partnerName: ui.partnerName ?? undefined,
          },
        ];
        bubblesRef.current = withTyping;
        commitImmediate(withTyping);
        setUi((s) => ({ ...s, bubbles: withTyping }));
      }

      setBusy(true);
      setHelpOpen(false);
      try {
        const res = await fetch('/api/v2/roleplay/turn', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: sessionId,
            text: trimmed,
            help: Boolean(opts?.help),
            assisted: Boolean(opts?.assisted),
            learner_turn_id: learnerId,
            convo_model: convoModel,
          }),
        });
        if (!res.ok || !res.body) throw new Error(`turn ${res.status}`);

        let next: RoleplayUiState = {
          ...ui,
          bubbles: bubblesRef.current.filter((b) => !b.typing),
          help: null,
        };
        bubblesRef.current = next.bubbles;
        for await (const event of readRoleplayNdjson(res.body)) {
          next = reduceRoleplayEvent(next, event);
          bubblesRef.current = next.bubbles;
          setUi({ ...next });
          syncAuthoritative(next.bubbles);
        }
      } catch {
        const cleared = bubblesRef.current.filter((b) => !b.typing);
        bubblesRef.current = cleared;
        setUi((s) => ({ ...s, bubbles: cleared }));
        syncAuthoritative(cleared);
      } finally {
        setBusy(false);
      }
    },
    [
      busy,
      ui,
      sessionId,
      convoModel,
      commitImmediate,
      syncAuthoritative,
    ],
  );

  const progressPct =
    ui.progress.total > 0
      ? Math.min(100, Math.round((ui.progress.current / ui.progress.total) * 100))
      : 0;

  const helpFrame =
    ui.help != null
      ? {
          tl: ui.help.frame_tl,
          eg: ui.help.eg,
          chips: ui.help.chips,
        }
      : null;

  const partnerName = ui.partnerName;
  const headerTitle = partnerName || titleTl;

  return (
    <div className="flex h-[100dvh] max-h-[100dvh] flex-col bg-v2-paper">
      <header className="flex items-center gap-3 border-b border-v2-line/60 bg-v2-card px-3 py-2">
        <Link
          href="/roleplay"
          className="flex h-9 w-9 items-center justify-center rounded-full text-v2-primary"
          aria-label="رجوع"
          onClick={() => {
            void fetch('/api/v2/roleplay/end', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ session_id: sessionId }),
            });
          }}
        >
          <Icon name="arrow_forward" size={22} />
        </Link>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {partnerName ? (
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-v2-primary-tint font-[family-name:var(--font-v2-target)] text-sm font-semibold text-v2-primary"
              aria-hidden
            >
              {partnerName.slice(0, 1).toUpperCase()}
            </span>
          ) : null}
          <div className="min-w-0 flex-1">
            <p
              className="truncate font-[family-name:var(--font-v2-target)] text-sm font-semibold text-v2-primary"
              dir="ltr"
            >
              {headerTitle}
            </p>
            <p className="truncate font-[family-name:var(--font-v2-arabic)] text-xs text-v2-ink-muted">
              {partnerName ? titleTl : titleAr}
            </p>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-v2-paper-deep">
              <div
                className="h-full rounded-full bg-v2-primary transition-[width]"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        </div>
        <ConvoDevMenu
          onConvoModelChange={(choice) => setConvoModel(choice)}
        />
        <button
          type="button"
          onClick={() => void send('', { help: true })}
          className="shrink-0 rounded-full bg-v2-primary-tint px-3 py-1.5 font-[family-name:var(--font-v2-arabic)] text-xs font-semibold text-v2-primary"
        >
          ساعدني
        </button>
      </header>

      <div ref={scrollRef} className="flex flex-1 flex-col space-y-3 overflow-y-auto px-3 py-3">
        {pacedVisible.map((b, i) => {
          if (b.role === 'character') {
            const skipAuto =
              firstLineAlreadyPlayed &&
              pacedVisible.findIndex(
                (x) => x.role === 'character' && !x.typing,
              ) === i;
            return (
              <CharacterBubble
                key={b.id}
                tl={b.tl}
                meaningEg={b.ar}
                typing={b.typing}
                autoPlay={!b.typing && !skipAuto}
                partnerName={b.partnerName || partnerName || undefined}
                voice={b.voice || ui.partnerVoice || undefined}
              />
            );
          }
          if (b.role === 'learner') {
            return (
              <LearnerBubble
                key={b.id}
                tl={b.tl}
                correction={b.correction ?? null}
              />
            );
          }
          if (b.role === 'coach') {
            return (
              <CoachCard key={b.id} label="المساعد">
                <span className="whitespace-pre-line">{b.eg}</span>
              </CoachCard>
            );
          }
          return null;
        })}

        {ui.help ? (
          <div className="rounded-v2-card bg-v2-note px-3 py-3 ring-1 ring-v2-note-border/50">
            <p
              className="font-[family-name:var(--font-v2-target)] text-sm text-v2-primary"
              dir="ltr"
            >
              {ui.help.frame_tl}
            </p>
            <p className="mt-1 font-[family-name:var(--font-v2-arabic)] text-xs text-v2-ink-muted">
              {ui.help.eg}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {ui.help.chips.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  disabled={busy}
                  onClick={() => void send(chip, { assisted: true })}
                  className="rounded-full bg-v2-card px-3 py-1.5 font-[family-name:var(--font-v2-target)] text-sm text-v2-primary ring-1 ring-v2-line"
                  dir="ltr"
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {ui.result ? (
          <RoleplayResultCard
            result={ui.result}
            situationId={situationId}
            nextSituationId={nextSituationId}
          />
        ) : null}
      </div>

      {!ui.result ? (
        <ConvoVoiceBar
          busy={busy}
          disabled={busy}
          frame={helpFrame}
          helpOpen={helpOpen}
          onToggleHelp={() => {
            setHelpOpen((v) => !v);
            if (!helpOpen) void send('', { help: true });
          }}
          onSend={(t, opts) => void send(t, { assisted: opts?.assisted })}
          onArabicSend={(t) => void send(t)}
        />
      ) : null}
    </div>
  );
}
