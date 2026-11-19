import { redirect } from 'next/navigation';

/** Legacy topics list → role-play v1 catalog. */
export default function TopicsPage() {
  redirect('/roleplay');
}
