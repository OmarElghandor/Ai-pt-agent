'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Icon } from '@/components/v2/Icon';
import { ScreenLoading } from '@/components/v2/ScreenLoading';
import type {
  RoleplayCatalog,
  RoleplayCatalogScene,
} from '@/lib/v2/roleplay/catalog';

function situationHref(s: RoleplayCatalogScene): string {
  const base = `/roleplay/${encodeURIComponent(s.id)}`;
  return s.resume ? `${base}?resume=1` : base;
}

function NextCard({ s }: { s: RoleplayCatalogScene }) {
  return (
    <Link
      href={situationHref(s)}
      className="flex flex-col gap-4 rounded-v2-card bg-v2-card px-5 py-6 shadow-[var(--shadow-v2-soft)]"
    >
      <span className="text-4xl" aria-hidden>
        {s.emoji}
      </span>
      <div>
        <p
          className="font-[family-name:var(--font-v2-target)] text-xl font-semibold text-v2-primary"
          dir="ltr"
        >
          {s.title_tl}
        </p>
        <p className="mt-1 font-[family-name:var(--font-v2-arabic)] text-base text-v2-ink">
          {s.title_ar}
        </p>
        {s.place_eg ? (
          <p className="mt-2 font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink-muted">
            {s.place_eg}
          </p>
        ) : null}
      </div>
      <span className="flex min-h-12 items-center justify-center rounded-v2-row bg-v2-primary font-[family-name:var(--font-v2-arabic)] text-base font-semibold text-white">
        {s.resume ? 'كمّل المكالمة' : 'ابدأ المكالمة'}
      </span>
    </Link>
  );
}

function PathRow({ s }: { s: RoleplayCatalogScene }) {
  const finished = s.finished;
  return (
    <li>
      <Link
        href={situationHref(s)}
        className={[
          'flex min-h-12 items-center gap-3 rounded-v2-row px-3 py-2 ring-1',
          finished
            ? 'bg-v2-paper/70 text-v2-ink-muted ring-v2-line/30'
            : 'bg-v2-paper ring-v2-line/40',
        ].join(' ')}
      >
        <span className={['text-xl', finished ? 'opacity-60' : ''].join(' ')} aria-hidden>
          {s.emoji}
        </span>
        <span className="min-w-0 flex-1">
          <span
            className={[
              'block truncate font-[family-name:var(--font-v2-target)] text-sm font-semibold',
              finished ? 'text-v2-ink-muted' : 'text-v2-primary',
            ].join(' ')}
            dir="ltr"
          >
            {s.title_tl}
          </span>
          <span className="block truncate font-[family-name:var(--font-v2-arabic)] text-xs text-v2-ink-muted">
            {s.title_ar}
          </span>
        </span>
        {finished ? (
          <span
            className="shrink-0 font-[family-name:var(--font-v2-arabic)] text-xs font-semibold text-v2-action"
            aria-label="خلصت"
          >
            ✓
          </span>
        ) : (
          <Icon name="arrow_back" size={18} className="text-v2-action" />
        )}
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

  const rest = catalog.path.filter((s) => s.id !== catalog.next?.id);

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
            مكالمة واحدة بعد التانية
          </p>
        </div>
      </header>

      {catalog.next ? (
        <NextCard s={catalog.next} />
      ) : (
        <div className="rounded-v2-card bg-v2-card px-5 py-6 text-center shadow-[var(--shadow-v2-soft)]">
          <p className="font-[family-name:var(--font-v2-arabic)] text-base text-v2-ink">
            خلّصت كل المكالمات ✓
          </p>
        </div>
      )}

      {rest.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="font-[family-name:var(--font-v2-arabic)] text-sm font-semibold text-v2-ink-muted">
            كل المكالمات
          </h2>
          <ul className="flex flex-col gap-2">
            {rest.map((s) => (
              <PathRow key={s.id} s={s} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
