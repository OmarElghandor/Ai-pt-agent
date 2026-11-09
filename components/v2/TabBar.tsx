'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from '@/components/v2/Icon';

const TABS = [
  { href: '/path', label: 'المسار', icon: 'route', today: true },
  { href: '/talk', label: 'محادثة', icon: 'chat', today: false },
  { href: '/cards', label: 'الكروت', icon: 'style', today: false },
  { href: '/library', label: 'المكتبة', icon: 'local_library', today: false },
  { href: '/me', label: 'أنا', icon: 'person', today: false },
] as const;

export function TabBar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="التنقل الرئيسي"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-20 pb-[env(safe-area-inset-bottom,0px)]"
    >
      <ul className="pointer-events-auto mx-auto flex h-16 max-w-[480px] items-center justify-around border-t border-v2-line/60 bg-v2-card/85 px-4 shadow-[0_-8px_24px_rgba(32,42,37,0.06)] backdrop-blur-xl">
        {TABS.map((tab) => {
          const active =
            pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                className={[
                  'relative flex h-14 w-14 flex-col items-center justify-center gap-0.5 font-[family-name:var(--font-v2-arabic)] text-[10px]',
                  active
                    ? 'font-medium text-v2-action'
                    : 'text-v2-ink hover:text-v2-ink',
                ].join(' ')}
              >
                <span
                  className={[
                    'flex h-9 w-9 items-center justify-center rounded-full transition-colors',
                    active ? 'bg-v2-action text-white' : 'text-v2-ink',
                  ].join(' ')}
                >
                  <Icon name={tab.icon} size={24} fill={active} />
                </span>
                <span>{tab.label}</span>
                {active ? (
                  <span
                    className="absolute bottom-1 h-1 w-1 rounded-full bg-v2-action"
                    aria-hidden
                  />
                ) : null}
                {tab.today && !active ? (
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
