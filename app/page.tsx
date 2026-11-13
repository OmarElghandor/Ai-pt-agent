import { redirect } from 'next/navigation';

/** Canonical home is the v2 path tab. Auth is enforced by proxy + /path layout. */
export default function Home() {
  redirect('/path');
}
