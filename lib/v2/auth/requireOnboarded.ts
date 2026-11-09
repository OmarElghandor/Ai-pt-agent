import { redirect } from 'next/navigation';
import { getCurrentV2User } from './session';

/** Redirect unsigned users to sign-in, and signed-in users without onboarding to /onboarding. */
export async function requireOnboardedUser(nextPath: string) {
  const user = await getCurrentV2User();
  if (!user) {
    redirect(`/sign-in?next=${encodeURIComponent(nextPath)}`);
  }
  if (!user.onboarded_at) {
    redirect('/onboarding');
  }
  return user;
}
