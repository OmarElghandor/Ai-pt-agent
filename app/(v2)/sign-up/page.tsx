import { redirect } from 'next/navigation';
import { SignUpForm } from '@/components/v2/auth/SignUpForm';
import { getCurrentV2User } from '@/lib/v2/auth/session';

type Props = {
  searchParams: Promise<{ next?: string }>;
};

export default async function SignUpPage({ searchParams }: Props) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  const user = await getCurrentV2User();
  if (user) {
    if (!user.onboarded_at) redirect('/onboarding');
    redirect(next);
  }

  return <SignUpForm callbackURL={next} />;
}

function safeNext(raw: string | undefined): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/onboarding';
  if (raw.startsWith('/sign-in') || raw.startsWith('/sign-up')) {
    return '/onboarding';
  }
  return raw;
}
