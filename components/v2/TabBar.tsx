'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Icon } from '@/components/v2/Icon';

/** Tab order (16 §8): المسار · مراجعة · الكروت · اتكلّم · المكتبة */
const TABS = [
  { href: '/path', label: 'المسار', icon: 'signpost', reviewDot: false },
  { href: '/review', label: 'مراجعة', icon: 'autorenew', reviewDot: true },
  { href: '/cards', label: 'الكروت', icon: 'layers', reviewDot: false },
  { href: '/talk', label: 'اتكلّم', icon: 'chat', reviewDot: false },
  { href: '/library', label: 'المكتبة', icon: 'local_library', reviewDot: false },
] as const;

export function TabBar() {
  const pathname = usePathname();
  const [reviewPending, setReviewPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetch('/api/v2/review/today?peek=1', {
      headers: {
        'x-timezone':
          typeof Intl !== 'undefined'
            ? Intl.DateTimeFormat().resolvedOptions().timeZone
            : 'UTC',
      },
    })
      .then(async (res) => {
        if (!res.ok) return null;
        return res.json() as Promise<{
          empty?: boolean;
          status?: string;
        }>;
      })
      .then((json) => {
        if (cancelled || !json) return;
        // Dot while today's review isn't finished; none on empty window / day 1
        setReviewPending(
          Boolean(!json.empty && json.status !== 'done' && json.status !== 'none'),
        );
      })
      .catch(() => {
        if (!cancelled) setReviewPending(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  return (
    <nav
      aria-label="التنقل الرئيسي"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-30 pb-[env(safe-area-inset-bottom,0px)]"
    >
      <ul className="pointer-events-auto mx-auto flex max-w-[480px] gap-1 border-t border-v2-tab-border bg-v2-tab-bar px-2 pb-3 pt-2 shadow-[0_-4px_16px_rgba(0,0,0,0.04)]">
        {TABS.map((tab) => {
          const active =
            pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          const showDot = tab.reviewDot && reviewPending && !active;
          return (
            <li key={tab.href} className="relative flex flex-1">
              <Link
                href={tab.href}
                className={[
                  'relative flex w-full flex-col items-center justify-end gap-1 rounded-full font-[family-name:var(--font-v2-arabic)] text-xs font-medium leading-normal tracking-[0.015em]',
                  active ? 'text-v2-ink' : 'text-v2-chrome-muted',
                ].join(' ')}
              >
                <span className="flex h-8 items-center justify-center">
                  <Icon
                    name={tab.icon}
                    size={24}
                    variant="outlined"
                    fill={active}
                    className={active ? 'text-v2-ink' : 'text-v2-chrome-muted'}
                  />
                </span>
                <span>{tab.label}</span>
                {showDot ? (
                  <span
                    className="absolute end-[calc(50%-18px)] top-1 h-1.5 w-1.5 rounded-full bg-v2-primary"
                    aria-hidden
                  />
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
