'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/path', label: 'المسار' },
  { href: '/cards', label: 'الكروت' },
  { href: '/library', label: 'المكتبة' },
  { href: '/me', label: 'أنا' },
] as const;

export function TabBar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="التنقل الرئيسي"
      className="sticky bottom-0 z-20 border-t border-v2-rule bg-v2-card"
    >
      <ul className="mx-auto grid max-w-[480px] grid-cols-4">
        {TABS.map((tab) => {
          const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                className={[
                  'flex flex-col items-center justify-center gap-0.5 px-1 py-2.5 font-[family-name:var(--font-v2-arabic)] text-xs',
                  active ? 'text-v2-ink font-semibold' : 'text-v2-ink-muted',
                ].join(' ')}
              >
                <span
                  className={[
                    'h-1 w-6 rounded-full',
                    active ? 'bg-v2-ink' : 'bg-transparent',
                  ].join(' ')}
                  aria-hidden
                />
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
