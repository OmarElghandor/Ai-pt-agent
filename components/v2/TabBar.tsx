'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/path', label: 'المسار', today: true },
  { href: '/cards', label: 'الكروت', today: false },
  { href: '/library', label: 'المكتبة', today: false },
  { href: '/me', label: 'أنا', today: false },
] as const;

export function TabBar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="التنقل الرئيسي"
      className="sticky bottom-0 z-20 border-t border-v2-line bg-v2-card shadow-[var(--shadow-v2-soft)]"
    >
      <ul className="mx-auto grid max-w-[480px] grid-cols-4">
        {TABS.map((tab) => {
          const active =
            pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                className={[
                  'relative flex flex-col items-center justify-center gap-0.5 px-1 py-2.5 font-[family-name:var(--font-v2-arabic)] text-xs',
                  active
                    ? 'font-semibold text-v2-primary'
                    : 'text-v2-ink-muted',
                ].join(' ')}
              >
                <span
                  className={[
                    'h-1 w-6 rounded-full',
                    active ? 'bg-v2-primary' : 'bg-transparent',
                  ].join(' ')}
                  aria-hidden
                />
                {tab.label}
                {tab.today ? (
                  <span
                    className="absolute end-3 top-2 h-1.5 w-1.5 rounded-full bg-v2-action"
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
