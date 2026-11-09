import { redirect } from 'next/navigation';

/** Legacy topics list → Learn picker (Batch 10). */
export default function TopicsPage() {
  redirect('/talk/learn');
}
