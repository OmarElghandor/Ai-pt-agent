import { redirect } from 'next/navigation';
import { SettingsPanel } from '@/components/v2/auth/SettingsPanel';
import { getCurrentV2User } from '@/lib/v2/auth/session';

export default async function MePage() {
  const user = await getCurrentV2User();
  if (!user) redirect('/sign-in?next=/me');
  if (!user.onboarded_at) redirect('/onboarding');

  return (
    <main className="flex flex-1 flex-col gap-4">
      <h1 className="font-[family-name:var(--font-v2-display-ar)] text-3xl text-v2-ink">
        أنا
      </h1>
      <p className="font-[family-name:var(--font-v2-arabic)] text-v2-ink-muted">
        {user.email}
      </p>
      <SettingsPanel user={user} />
    </main>
  );
}
