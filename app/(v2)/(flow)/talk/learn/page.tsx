import { redirect } from 'next/navigation';

/** Legacy learn list → role-play v1 catalog. */
export default function TalkLearnPage() {
  redirect('/roleplay');
}
