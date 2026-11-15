'use client';

import Link from 'next/link';
import { use } from 'react';
import LibraryBriefEditor from '@/components/v2/admin/LibraryBriefEditor';

export default function LibraryEpisodePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  return (
    <main
      dir="rtl"
      className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 overflow-y-auto px-4 py-6 pb-28 font-[family-name:var(--font-v2-arabic)]"
    >
      <p className="text-sm text-v2-ink-muted">
        <Link href="/v2-admin/library" className="underline">
          المكتبة
        </Link>
        {' · '}
        <span dir="ltr">{slug}</span>
      </p>
      <LibraryBriefEditor slug={slug} />
    </main>
  );
}
