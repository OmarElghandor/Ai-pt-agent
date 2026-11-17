'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Icon } from '@/components/v2/Icon';
import { FreeTalkSession } from '@/components/v2/convo/FreeTalkSession';
import { RoleplayIntroSheet } from '@/components/v2/roleplay/RoleplayIntroSheet';

export type RoleplayIntroSituation = {
  id: string;
  emoji: string;
  title_tl: string;
  title_ar: string;
  place_eg: string;
  task_eg: string;
  learner_role_eg?: string;
};

type Props = {
  situation: RoleplayIntroSituation;
  nextSituationId?: string | null;
  /** When true, the CTA says كمّل المكالمة. */
  resume?: boolean;
};

/**
 * One-button intro → free-talk session on the scene bank (batch-rp-2).
 */
export function RoleplaySituationClient({
  situation,
  nextSituationId = null,
  resume = false,
}: Props) {
  const [phase, setPhase] = useState<'intro' | 'play'>('intro');

  if (phase === 'play') {
    return (
      <FreeTalkSession
        topicId={situation.id}
        sceneMode
        nextSceneId={nextSituationId}
        backHref="/roleplay"
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
        onStart={() => setPhase('play')}
        resume={resume}
      />
    </div>
  );
}
