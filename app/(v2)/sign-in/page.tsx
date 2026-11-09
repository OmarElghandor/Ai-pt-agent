import Link from 'next/link';
import { redirect } from 'next/navigation';
import { GoogleSignInButton } from '@/components/v2/auth/GoogleSignInButton';
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

  return (
    <main className="flex min-h-[100dvh] flex-col justify-center gap-8 px-5 py-10">
      <div className="flex flex-col gap-2 text-center">
        <p className="font-[family-name:var(--font-v2-manrope)] text-sm font-medium tracking-wide text-v2-sage">
          Langify
        </p>
        <h1 className="font-[family-name:var(--font-v2-display-ar)] text-3xl text-v2-ink">
          أهلاً بيك
        </h1>
        <p className="font-[family-name:var(--font-v2-arabic)] text-base text-v2-ink-muted">
          ادخل عشان نحفظ تقدّمك ونكمّل من يومك.
        </p>
      </div>

      <GoogleSignInButton callbackURL={next} />

      <p className="text-center font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink-muted">
        <Link href="/privacy" className="underline underline-offset-2">
          الخصوصية
        </Link>
      </p>
    </main>
  );
}

function safeNext(raw: string | undefined): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/path';
  if (raw.startsWith('/sign-in')) return '/path';
  return raw;
}
