'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from '@/components/v2/Icon';

const TABS = [
  { href: '/path', label: 'المسار', icon: 'signpost', today: true },
  { href: '/talk', label: 'المحادثات', icon: 'chat', today: false },
  { href: '/cards', label: 'الكروت', icon: 'layers', today: false },
  { href: '/library', label: 'المكتبة', icon: 'local_library', today: false },
  { href: '/me', label: 'أنا', icon: 'person', today: false },
] as const;

export function TabBar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="التنقل الرئيسي"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-30 pb-[env(safe-area-inset-bottom,0px)]"
    >
      <ul className="pointer-events-auto mx-auto flex max-w-[480px] gap-1 border-t border-v2-tab-border bg-v2-tab-bar px-2 pb-3 pt-2 shadow-[0_-4px_16px_rgba(0,0,0,0.04)]">
        {TABS.map((tab) => {
          const active =
            pathname === tab.href || pathname.startsWith(`${tab.href}/`);
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
                {tab.today && !active ? (
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
