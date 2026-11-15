'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

export default function LibraryCostPage() {
  const [data, setData] = useState<{
    claude_usd: number;
    elevenlabs_chars: number;
    image_usd: number;
    jobs_total_usd: number;
    per_episode: Record<string, number>;
    monthly_cap: unknown;
  } | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch('/api/v2/admin/library/cost');
      if (res.ok) setData(await res.json());
    })();
  }, []);

  return (
    <main
      dir="rtl"
      className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 py-6 font-[family-name:var(--font-v2-arabic)]"
    >
      <p className="text-sm text-v2-ink-muted">
        <Link href="/v2-admin/library" className="underline">
          المكتبة
        </Link>
        {' · التكلفة'}
      </p>
      <h1 className="text-2xl text-v2-ink">تكلفة المكتبة</h1>
      {!data ? (
        <p className="text-sm text-v2-ink-muted">بيحمّل…</p>
      ) : (
        <div className="space-y-3 text-sm">
          <p>Claude: ${data.claude_usd}</p>
          <p>ElevenLabs: {data.elevenlabs_chars} حرف</p>
          <p>الصور: ${data.image_usd}</p>
          <p>الإجمالي من الـ jobs: ${data.jobs_total_usd}</p>
          <p>الحد الشهري: {String(data.monthly_cap ?? '—')}</p>
          <ul className="space-y-1">
            {Object.entries(data.per_episode).map(([slug, usd]) => (
              <li key={slug} dir="ltr" className="text-start">
                {slug}: ${usd}
              </li>
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}
