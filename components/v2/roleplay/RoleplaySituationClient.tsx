'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Icon } from '@/components/v2/Icon';
import {
  RoleplayIntroSheet,
  type RoleplayIntroSituation,
} from '@/components/v2/roleplay/RoleplayIntroSheet';
import { RoleplaySession } from '@/components/v2/roleplay/RoleplaySession';
import type { RoleplayTurnEvent } from '@/lib/v2/roleplay/events';
import type { RoleplayIndexTier, RoleplayTier } from '@/lib/v2/roleplay/types';

type Props = {
  situation: RoleplayIntroSituation;
  tiers: RoleplayIndexTier[];
};

export function RoleplaySituationClient({ situation, tiers }: Props) {
  const [phase, setPhase] = useState<'intro' | 'play'>('intro');
  const [starting, setStarting] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [tier, setTier] = useState<RoleplayTier>(situation.recommended_tier);
  const [startEvents, setStartEvents] = useState<RoleplayTurnEvent[]>([]);

  const startTier = async (chosen: RoleplayTier) => {
    if (starting) return;
    setStarting(true);
    try {
      const res = await fetch('/api/v2/roleplay/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          situation_id: situation.id,
          tier: chosen,
        }),
      });
      if (!res.ok) throw new Error(`start ${res.status}`);
      const data = (await res.json()) as {
        session_id: string;
        events: RoleplayTurnEvent[];
      };
      setSessionId(data.session_id);
      setTier(chosen);
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
        tier={tier}
        startEvents={startEvents}
        onPlayNextTier={(next) => {
          setPhase('intro');
          setSessionId(null);
          void startTier(next);
        }}
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
        situation={situation}
        tiers={tiers}
        onStart={startTier}
        starting={starting}
      />
    </div>
  );
}
