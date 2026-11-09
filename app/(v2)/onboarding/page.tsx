import { redirect } from 'next/navigation';
import { OnboardingForm } from '@/components/v2/auth/OnboardingForm';
import { getCurrentV2User } from '@/lib/v2/auth/session';

export default async function OnboardingPage() {
  const user = await getCurrentV2User();
  if (!user) redirect('/sign-in?next=/onboarding');
  if (user.onboarded_at) redirect('/path');

  return <OnboardingForm initialName={user.name} />;
}
