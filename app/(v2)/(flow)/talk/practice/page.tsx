import { redirect } from 'next/navigation';

/**
 * v4: «اتكلّم» opens one chat directly (no topic picker / دروسك).
 * Optional `?level=N` (dev only) is forwarded to the free session.
 */
export default async function TalkPracticePage({
  searchParams,
}: {
  searchParams: Promise<{ level?: string }>;
}) {
  const sp = await searchParams;
  const level = sp.level?.trim();
  const q =
    level && /^\d+$/.test(level) ? `?level=${encodeURIComponent(level)}` : '';
  redirect(`/talk/free/open${q}`);
}
