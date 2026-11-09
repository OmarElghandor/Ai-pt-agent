import { redirect } from 'next/navigation';

/** Legacy free catalogue → one-chat open session (v4). */
export default function FreeTopicsPage() {
  redirect('/talk/free/open');
}
