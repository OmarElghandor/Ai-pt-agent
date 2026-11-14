import { redirect } from 'next/navigation';

/** Old list URL — hub lives at /v2-admin/flashcards. Promote sub-routes stay. */
export default function AdminCustomDecksRedirect() {
  redirect('/v2-admin/flashcards?tab=custom');
}
