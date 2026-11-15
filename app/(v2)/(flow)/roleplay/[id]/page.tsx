import { RoleplaySituationClient } from '@/components/v2/roleplay/RoleplaySituationClient';
import { loadRoleplayIndex, loadRoleplaySituation } from '@/lib/v2/roleplay/load';
import { notFound } from 'next/navigation';

type Props = {
  params: Promise<{ id: string }>;
};

export default async function RoleplaySituationPage({ params }: Props) {
  const { id: raw } = await params;
  const id = decodeURIComponent(raw);
  let situation;
  try {
    situation = loadRoleplaySituation(id);
  } catch {
    notFound();
  }
  const index = loadRoleplayIndex();

  return (
    <main className="mx-auto flex w-full max-w-[390px] flex-1 flex-col">
      <RoleplaySituationClient
        situation={{
          id: situation.id,
          emoji: situation.emoji,
          title_tl: situation.title_tl,
          title_ar: situation.title_ar,
          place_eg: situation.place_eg,
          task_eg: situation.task_eg,
          learner_role_eg: situation.learner_role_eg,
          key_phrases: situation.key_phrases,
          recommended_tier: 1,
        }}
        tiers={index.tiers}
      />
    </main>
  );
}
