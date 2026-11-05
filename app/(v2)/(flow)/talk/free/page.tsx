import { redirect } from 'next/navigation';

/** Legacy free catalogue → practice picker (Batch 10). */
export default function FreeTopicsPage() {
  redirect('/talk/practice');
}
