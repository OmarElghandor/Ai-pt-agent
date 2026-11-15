'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Icon } from '@/components/v2/Icon';
import { RoleplayIntroSheet } from '@/components/v2/roleplay/RoleplayIntroSheet';
import { RoleplaySession } from '@/components/v2/roleplay/RoleplaySession';
import type { RoleplayTurnEvent } from '@/lib/v2/roleplay/events';

export type RoleplayIntroSituation = {
  id: string;
  emoji: string;
  title_tl: string;
  title_ar: string;
  place_eg: string;
  task_eg: string;
  learner_role_eg: string;
};

type Props = {
  situation: RoleplayIntroSituation;
  nextSituationId?: string | null;
  /** When true, the CTA says كمّل المكالمة. */
  resume?: boolean;
};

async function playFirstCharacterLine(events: RoleplayTurnEvent[]): Promise<void> {
  const first = events.find((e) => e.type === 'character');
  if (!first || first.type !== 'character' || !first.tl.trim()) return;
  try {
    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: first.tl, lang: 'pt' }),
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.onended = () => URL.revokeObjectURL(url);
    await audio.play();
  } catch {
    /* ignore */
  }
}

export function RoleplaySituationClient({
  situation,
  nextSituationId = null,
  resume = false,
}: Props) {
  const [phase, setPhase] = useState<'intro' | 'play'>('intro');
  const [starting, setStarting] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [startEvents, setStartEvents] = useState<RoleplayTurnEvent[]>([]);
  const [firstLineAlreadyPlayed, setFirstLineAlreadyPlayed] = useState(false);

  const start = async () => {
    if (starting) return;
    setStarting(true);
    try {
      const res = await fetch('/api/v2/roleplay/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          situation_id: situation.id,
        }),
      });
      if (!res.ok) throw new Error(`start ${res.status}`);
      const data = (await res.json()) as {
        session_id: string;
        events: RoleplayTurnEvent[];
        resumed?: boolean;
      };
      await playFirstCharacterLine(data.events ?? []);
      setFirstLineAlreadyPlayed(true);
      setSessionId(data.session_id);
      setStartEvents(data.events ?? []);
      setPhase('play');
    } catch {
      /* keep intro */
    } finally {
      setStarting(false);
    }
  };

  if (phase === 'play' && sessionId) {
    return (
      <RoleplaySession
        situationId={situation.id}
        titleTl={situation.title_tl}
        titleAr={situation.title_ar}
        sessionId={sessionId}
        startEvents={startEvents}
        nextSituationId={nextSituationId}
        summaryEg={situation.learner_role_eg}
        firstLineAlreadyPlayed={firstLineAlreadyPlayed}
      />
    );
  }

  return (
    <div className="flex flex-col">
      <div className="px-4 pt-4">
        <Link
          href="/roleplay"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-v2-card text-v2-primary shadow-[var(--shadow-v2-soft)]"
          aria-label="رجوع"
        >
          <Icon name="arrow_forward" size={24} />
        </Link>
      </div>
      <RoleplayIntroSheet
        emoji={situation.emoji}
        titleTl={situation.title_tl}
        titleAr={situation.title_ar}
        placeEg={situation.place_eg}
        taskEg={situation.task_eg}
        onStart={() => void start()}
        starting={starting}
        resume={resume}
      />
    </div>
  );
}
