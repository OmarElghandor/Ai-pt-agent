import { redirect } from 'next/navigation';
import { SignInForm } from '@/components/v2/auth/SignInForm';
import { getCurrentV2User } from '@/lib/v2/auth/session';

type Props = {
  searchParams: Promise<{ next?: string }>;
};

export default async function SignInPage({ searchParams }: Props) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  const user = await getCurrentV2User();
  if (user) {
    if (!user.onboarded_at) redirect('/onboarding');
    redirect(next);
  }

  return <SignInForm callbackURL={next} />;
}

function safeNext(raw: string | undefined): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/path';
  if (raw.startsWith('/sign-in') || raw.startsWith('/sign-up')) return '/path';
  return raw;
}
