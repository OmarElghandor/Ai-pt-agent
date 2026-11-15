'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Icon } from '@/components/v2/Icon';
import { ScreenLoading } from '@/components/v2/ScreenLoading';
import type { RoleplayCatalog, RoleplayCatalogSituation } from '@/lib/v2/roleplay/catalog';
import type { RoleplayTier } from '@/lib/v2/roleplay/types';

function StarSlots({ stars }: { stars: RoleplayTier[] }) {
  const set = new Set(stars);
  return (
    <span className="flex gap-0.5" aria-label={`${stars.length} من 3 نجوم`}>
      {([1, 2, 3] as const).map((t) => (
        <span
          key={t}
          className={
            set.has(t) ? 'text-v2-attention' : 'text-v2-sand'
          }
          aria-hidden
        >
          ★
        </span>
      ))}
    </span>
  );
}

function SituationCard({ s }: { s: RoleplayCatalogSituation }) {
  return (
    <li>
      <Link
        href={`/roleplay/${encodeURIComponent(s.id)}`}
        className="flex min-h-14 items-center gap-3 rounded-v2-row bg-v2-card px-4 py-3 shadow-[var(--shadow-v2-soft)]"
      >
        <span className="text-2xl" aria-hidden>
          {s.emoji}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span
              className="font-[family-name:var(--font-v2-target)] text-base font-semibold text-v2-primary"
              dir="ltr"
            >
              {s.title_tl}
            </span>
            {s.hard_for_you ? (
              <span className="shrink-0 rounded-full bg-v2-paper px-2 py-0.5 font-[family-name:var(--font-v2-arabic)] text-[10px] font-semibold text-v2-ink-muted ring-1 ring-v2-line/40">
                صعب عليك دلوقتي
              </span>
            ) : null}
          </span>
          <span className="mt-0.5 flex items-center justify-between gap-2">
            <span className="font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink-muted">
              {s.title_ar}
            </span>
            <StarSlots stars={s.stars} />
          </span>
        </span>
        <Icon name="arrow_back" size={20} className="text-v2-action" />
      </Link>
    </li>
  );
}

export function RoleplayListScreen() {
  const [catalog, setCatalog] = useState<RoleplayCatalog | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/v2/roleplay/catalog');
        if (!res.ok) throw new Error(`catalog ${res.status}`);
        const data = (await res.json()) as RoleplayCatalog;
        if (!cancelled) setCatalog(data);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'failed');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className="px-4 py-8 font-[family-name:var(--font-v2-arabic)] text-v2-ink">
        حصل خطأ في تحميل الرول بلاي.
      </div>
    );
  }

  if (!catalog) {
    return <ScreenLoading label="بنجهّز الرول بلاي…" />;
  }

  return (
    <div className="flex flex-col gap-6 px-4 pb-10 pt-4">
      <header className="flex items-center gap-3">
        <Link
          href="/talk"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-v2-card text-v2-primary shadow-[var(--shadow-v2-soft)]"
          aria-label="رجوع"
        >
          <Icon name="arrow_forward" size={24} />
        </Link>
        <div>
          <h1 className="font-[family-name:var(--font-v2-display-ar)] text-2xl font-bold text-v2-primary">
            رول بلاي
          </h1>
          <p className="font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink-muted">
            مواقف حقيقية — رتّبها على ٥ مستويات
          </p>
        </div>
      </header>

      {catalog.levels.map((lvl) => (
        <section key={lvl.level} className="flex flex-col gap-3">
          <h2 className="font-[family-name:var(--font-v2-arabic)] text-sm font-semibold text-v2-ink-muted">
            المستوى {lvl.level} · {lvl.name_eg}
          </h2>
          <ul className="flex flex-col gap-2">
            {lvl.situations.map((s) => (
              <SituationCard key={s.id} s={s} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
