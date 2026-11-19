'use client';

import { FreeTalkSession } from '@/components/v2/convo/FreeTalkSession';

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
  /** Cast from scene.character_id (header). */
  characterId?: string | null;
};

/**
 * Opens the scene call directly (FINAL SPEC §2.1 — no intro sheet).
 */
export function RoleplaySituationClient({
  situation,
  nextSituationId = null,
  characterId = null,
}: Props) {
  return (
    <FreeTalkSession
      topicId={situation.id}
      sceneMode
      initialCharacterId={characterId}
      nextSceneId={nextSituationId}
      backHref="/roleplay"
    />
  );
}
