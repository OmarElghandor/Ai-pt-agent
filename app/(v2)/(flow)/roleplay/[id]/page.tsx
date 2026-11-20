import { RoleplaySituationClient } from '@/components/v2/roleplay/RoleplaySituationClient';
import {
  nextSceneIdOnPath,
  nextUnfinishedSceneIdOnPath,
} from '@/lib/v2/convo/scenes/catalog';
import { loadSceneBank, loadSceneIndex } from '@/lib/v2/convo/scenes/load';
import { notFound } from 'next/navigation';

type Props = {
  params: Promise<{ id: string }>;
};

export default async function RoleplaySituationPage({ params }: Props) {
  const { id: raw } = await params;
  const id = decodeURIComponent(raw);
  let bank;
  try {
    bank = loadSceneBank(id);
  } catch {
    notFound();
  }
  const index = loadSceneIndex();
  // Prefer next in path; client end card can still open the next unfinished.
  const nextId =
    nextUnfinishedSceneIdOnPath(id, [id], index) ??
    nextSceneIdOnPath(id, index);

  return (
    <main className="mx-auto flex w-full max-w-[390px] flex-1 flex-col">
      <RoleplaySituationClient
        situation={{
          id: bank.topic_id ?? id,
          emoji: bank.emoji ?? '📞',
          title_tl: bank.title_tl ?? id,
          title_ar: bank.title_ar ?? id,
          place_eg: bank.scene_eg ?? '',
          task_eg: bank.intro_eg ?? '',
        }}
        characterId={bank.scene?.character_id ?? null}
        nextSituationId={nextId}
      />
    </main>
  );
}
