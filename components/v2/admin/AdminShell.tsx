'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import {
  AdminShellProvider,
  arDigits,
  useAdminShell,
} from '@/components/v2/admin/adminShellContext';

type NavItem = {
  href: string;
  label: string;
  short: string;
  match: (p: string) => boolean;
  primary?: boolean;
};

const RAIL: NavItem[] = [
  {
    href: '/v2-admin',
    label: 'الرئيسية',
    short: 'ر',
    match: (p) => p === '/v2-admin',
    primary: true,
  },
  {
    href: '/v2-admin/lessons',
    label: 'الدروس',
    short: 'د',
    match: (p) => p === '/v2-admin/lessons' || p.startsWith('/v2-admin/lessons/'),
    primary: true,
  },
  {
    href: '/v2-admin/cards',
    label: 'الكروت',
    short: 'ك',
    match: (p) =>
      p.startsWith('/v2-admin/cards') ||
      p.startsWith('/v2-admin/flashcards') ||
      p.startsWith('/v2-admin/custom-decks'),
    primary: true,
  },
  {
    href: '/v2-admin/images',
    label: 'الصور',
    short: 'ص',
    match: (p) => p.startsWith('/v2-admin/images'),
    primary: true,
  },
  {
    href: '/v2-admin/jobs',
    label: 'الشغل',
    short: 'ش',
    match: (p) => p.startsWith('/v2-admin/jobs'),
    primary: true,
  },
  {
    href: '/v2-admin/cost',
    label: 'التكلفة',
    short: 'ت',
    match: (p) => p.startsWith('/v2-admin/cost') || p.startsWith('/v2-admin/library/cost'),
  },
  {
    href: '/v2-admin/library',
    label: 'المكتبة',
    short: 'م',
    match: (p) => p.startsWith('/v2-admin/library') && !p.startsWith('/v2-admin/library/cost'),
  },
  {
    href: '/v2-admin/characters',
    label: 'الشخصيات',
    short: 'شخ',
    match: (p) => p.startsWith('/v2-admin/characters'),
  },
];

const MORE: NavItem[] = [
  {
    href: '/v2-admin/review',
    label: 'المراجعة',
    short: 'مر',
    match: (p) => p.startsWith('/v2-admin/review'),
  },
  {
    href: '/v2-admin/quality',
    label: 'الجودة',
    short: 'ج',
    match: (p) => p.startsWith('/v2-admin/quality'),
  },
  {
    href: '/v2-admin/reports',
    label: 'البلاغات',
    short: 'ب',
    match: (p) => p.startsWith('/v2-admin/reports'),
  },
  ...RAIL.filter((i) => !i.primary),
];

const MOBILE_TABS = RAIL.filter((i) => i.primary);

function NavLink({
  item,
  pathname,
  mode,
}: {
  item: NavItem;
  pathname: string;
  mode: 'full' | 'icon' | 'bottom';
}) {
  const active = item.match(pathname);
  const base =
    mode === 'bottom'
      ? 'flex flex-1 flex-col items-center gap-0.5 px-1 py-2 text-[11px]'
      : mode === 'icon'
        ? 'flex h-10 w-10 items-center justify-center rounded-v2-row text-sm'
        : 'flex items-center gap-2 rounded-v2-row px-3 py-2 text-sm';
  const activeCls = active
    ? 'bg-v2-action text-white'
    : 'text-v2-ink-muted hover:bg-v2-rule/40 hover:text-v2-ink';

  return (
    <Link
      href={item.href}
      className={[base, activeCls].join(' ')}
      aria-current={active ? 'page' : undefined}
      title={item.label}
    >
      {mode === 'full' ? (
        <span>{item.label}</span>
      ) : mode === 'icon' ? (
        <span aria-hidden>{item.short}</span>
      ) : (
        <>
          <span className="text-sm font-medium" aria-hidden>
            {item.short}
          </span>
          <span>{item.label}</span>
        </>
      )}
      {mode !== 'full' ? <span className="sr-only">{item.label}</span> : null}
    </Link>
  );
}

function ShellChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? '/v2-admin';
  const {
    search,
    setSearch,
    jobsOpen,
    setJobsOpen,
    runningCount,
    recentJobs,
    imageCap,
    drawer,
    closeDrawer,
  } = useAdminShell();
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        document.getElementById('v2-admin-search')?.focus();
      }
      if (e.key === 'Escape') {
        setJobsOpen(false);
        closeDrawer();
        setMoreOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [closeDrawer, setJobsOpen]);

  const capLabel =
    imageCap.limit == null
      ? 'حد الصور: —'
      : `حد الصور: ${arDigits(imageCap.used)} / ${arDigits(imageCap.limit)}`;

  const jobsLabel =
    runningCount <= 0
      ? 'مفيش شغل شغال'
      : runningCount === 1
        ? '١ شغال'
        : `${arDigits(runningCount)} شغالين`;

  return (
    <div
      data-v2-admin
      className="v2-admin-root flex min-h-dvh bg-v2-paper text-v2-ink"
      dir="rtl"
    >
      {/* Desktop / tablet side rail (visual right in RTL) */}
      <aside
        className="v2-admin-rail sticky top-0 z-30 hidden h-dvh shrink-0 border-s border-v2-rule bg-v2-tab-bar md:flex md:flex-col"
        aria-label="قائمة الأدمن"
      >
        <div className="border-b border-v2-rule px-3 py-4">
          <Link
            href="/v2-admin"
            className="font-[family-name:var(--font-v2-display-ar)] text-lg text-v2-ink xl:text-xl"
          >
            <span className="v2-admin-rail-label">A-Z Talkie</span>
            <span className="v2-admin-rail-icon hidden text-sm">أ</span>
          </Link>
          <p className="v2-admin-rail-label mt-0.5 text-[11px] text-v2-ink-muted">
            أدمن
          </p>
        </div>
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-2">
          {RAIL.map((item) => (
            <div key={item.href} className="contents">
              <span className="v2-admin-rail-label">
                <NavLink item={item} pathname={pathname} mode="full" />
              </span>
              <span className="v2-admin-rail-icon hidden justify-center">
                <NavLink item={item} pathname={pathname} mode="icon" />
              </span>
            </div>
          ))}
          <div className="my-2 border-t border-v2-rule" />
          {MORE.filter((m) => !RAIL.some((r) => r.href === m.href)).map((item) => (
            <div key={item.href} className="contents">
              <span className="v2-admin-rail-label">
                <NavLink item={item} pathname={pathname} mode="full" />
              </span>
              <span className="v2-admin-rail-icon hidden justify-center">
                <NavLink item={item} pathname={pathname} mode="icon" />
              </span>
            </div>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col pb-20 md:pb-0">
        <header className="sticky top-0 z-20 border-b border-v2-rule bg-v2-paper/95 backdrop-blur-sm">
          <div className="flex flex-col gap-2 px-3 py-3 sm:px-4 lg:px-6">
            <div className="flex flex-wrap items-center gap-2">
              <label className="sr-only" htmlFor="v2-admin-search">
                بحث
              </label>
              <input
                id="v2-admin-search"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="يوم، عنوان، آيتم، ديك…  (/)"
                className="min-w-0 flex-1 rounded-v2-row border border-v2-rule bg-v2-card px-3 py-2 text-sm text-v2-ink placeholder:text-v2-ink-muted"
              />
              <select
                aria-label="اللغة"
                className="rounded-v2-row border border-v2-rule bg-v2-card px-2 py-2 text-sm"
                defaultValue="pt-PT"
              >
                <option value="pt-PT">pt-PT</option>
              </select>
              <button
                type="button"
                onClick={() => setJobsOpen(true)}
                className="rounded-v2-chip bg-v2-primary-tint px-3 py-2 text-sm text-v2-primary"
              >
                {jobsLabel}
              </button>
              <div
                className="rounded-v2-chip border border-v2-rule px-3 py-2 text-xs text-v2-ink-muted"
                title="حد توليد الصور النهارده"
              >
                {capLabel}
              </div>
            </div>
          </div>
        </header>

        <div className="relative flex min-h-0 flex-1">
          <main
            className={[
              'min-w-0 flex-1 px-3 py-4 sm:px-4 lg:px-6',
              drawer ? 'md:opacity-60 xl:opacity-100' : '',
            ].join(' ')}
          >
            {children}
          </main>

          {drawer ? (
            <aside
              className="v2-admin-drawer fixed inset-0 z-40 flex flex-col bg-v2-card shadow-lg md:inset-y-0 md:start-0 md:end-auto md:w-[70%] md:border-e md:border-v2-rule xl:sticky xl:top-[4.5rem] xl:z-10 xl:h-[calc(100dvh-4.5rem)] xl:w-[40%] xl:shrink-0"
              aria-label="تفاصيل"
            >
              <div className="flex items-center justify-between gap-2 border-b border-v2-rule px-4 py-3">
                <button
                  type="button"
                  className="text-sm text-v2-ink-muted md:hidden"
                  onClick={closeDrawer}
                >
                  ← رجوع
                </button>
                <h2 className="font-[family-name:var(--font-v2-display-ar)] text-base">
                  {drawer.title}
                </h2>
                <button
                  type="button"
                  className="hidden text-sm text-v2-ink-muted md:inline"
                  onClick={closeDrawer}
                >
                  قفل
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-4 py-3">{drawer.body}</div>
              <div className="border-t border-v2-rule px-4 py-3">
                <Link
                  href={drawer.href}
                  className="text-sm text-v2-action underline-offset-2 hover:underline"
                >
                  افتحها في صفحة
                </Link>
              </div>
            </aside>
          ) : null}
        </div>
      </div>

      {/* Mobile bottom tabs */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 flex border-t border-v2-tab-border bg-v2-tab-bar md:hidden"
        aria-label="تبويبات الأدمن"
      >
        {MOBILE_TABS.map((item) => (
          <NavLink key={item.href} item={item} pathname={pathname} mode="bottom" />
        ))}
        <button
          type="button"
          className="flex flex-1 flex-col items-center gap-0.5 px-1 py-2 text-[11px] text-v2-ink-muted"
          onClick={() => setMoreOpen((v) => !v)}
        >
          <span className="text-sm font-medium">+</span>
          المزيد
        </button>
      </nav>

      {moreOpen ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-v2-ink/30"
            aria-label="اقفل"
            onClick={() => setMoreOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-16 rounded-t-v2-card bg-v2-card p-4 shadow-lg">
            <p className="mb-2 text-sm text-v2-ink-muted">المزيد</p>
            <div className="grid grid-cols-2 gap-2">
              {MORE.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMoreOpen(false)}
                  className="rounded-v2-row bg-v2-paper px-3 py-2 text-sm"
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {jobsOpen ? (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            className="absolute inset-0 bg-v2-ink/30"
            aria-label="اقفل الشغل"
            onClick={() => setJobsOpen(false)}
          />
          <div className="absolute inset-y-0 start-0 flex w-full max-w-md flex-col bg-v2-card shadow-lg sm:w-[24rem]">
            <div className="flex items-center justify-between border-b border-v2-rule px-4 py-3">
              <h2 className="font-[family-name:var(--font-v2-display-ar)] text-lg">
                الشغل
              </h2>
              <button
                type="button"
                className="text-sm text-v2-ink-muted"
                onClick={() => setJobsOpen(false)}
              >
                قفل
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <p className="mb-3 text-sm text-v2-ink-muted">{jobsLabel}</p>
              {recentJobs.length === 0 ? (
                <p className="text-sm text-v2-ink-muted">لسه مفيش شغل خلص.</p>
              ) : (
                <ul className="space-y-2">
                  {recentJobs.map((j) => (
                    <li
                      key={j.id}
                      className="rounded-v2-row border border-v2-rule px-3 py-2 text-sm"
                    >
                      <div className="font-medium">{j.label}</div>
                      <div className="text-xs text-v2-ink-muted">
                        {j.status}
                        {j.cost_usd ? ` · $${j.cost_usd.toFixed(2)}` : ''}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <Link
                href="/v2-admin/jobs"
                className="mt-4 inline-block text-sm text-v2-action"
                onClick={() => setJobsOpen(false)}
              >
                صفحة الشغل
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function AdminShell({ children }: { children: ReactNode }) {
  return (
    <AdminShellProvider>
      <ShellChrome>{children}</ShellChrome>
    </AdminShellProvider>
  );
}
