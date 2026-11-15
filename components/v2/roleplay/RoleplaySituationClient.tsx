'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Icon } from '@/components/v2/Icon';
import {
  RoleplayIntroSheet,
  type RoleplayIntroSituation,
} from '@/components/v2/roleplay/RoleplayIntroSheet';
import type { RoleplayIndexTier, RoleplayTier } from '@/lib/v2/roleplay/types';
import type { RoleplayTurnEvent } from '@/lib/v2/roleplay/events';

type Props = {
  situation: RoleplayIntroSituation;
  tiers: RoleplayIndexTier[];
  /** R6 injects the play screen once a session starts. */
  renderPlay?: (opts: {
    sessionId: string;
    tier: RoleplayTier;
    startEvents: RoleplayTurnEvent[];
  }) => React.ReactNode;
};

export function RoleplaySituationClient({
  situation,
  tiers,
  renderPlay,
}: Props) {
  const router = useRouter();
  const [phase, setPhase] = useState<'intro' | 'play'>('intro');
  const [starting, setStarting] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [tier, setTier] = useState<RoleplayTier>(1);
  const [startEvents, setStartEvents] = useState<RoleplayTurnEvent[]>([]);

  const onStart = async (chosen: RoleplayTier) => {
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

  if (phase === 'play' && sessionId && renderPlay) {
    return <>{renderPlay({ sessionId, tier, startEvents })}</>;
  }

  if (phase === 'play' && sessionId) {
    return (
      <div className="flex flex-col gap-4 px-4 py-6">
        <Link
          href="/roleplay"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-v2-card text-v2-primary shadow-[var(--shadow-v2-soft)]"
          aria-label="رجوع"
        >
          <Icon name="arrow_forward" size={24} />
        </Link>
        <p className="font-[family-name:var(--font-v2-arabic)] text-v2-ink">
          الجلسة جاهزة (درجة {tier}). شاشة اللعب في الخطوة الجاية.
        </p>
        <button
          type="button"
          className="min-h-11 rounded-v2-row bg-v2-primary font-[family-name:var(--font-v2-arabic)] text-white"
          onClick={() => router.push('/roleplay')}
        >
          رجوع للقائمة
        </button>
      </div>
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
        onStart={onStart}
        starting={starting}
      />
    </div>
  );
}
