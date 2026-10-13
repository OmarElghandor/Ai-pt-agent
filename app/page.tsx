'use client';

import Link from 'next/link';

const AGENTS = [
  {
    id: 'friend',
    href: '/chat?agent=friend',
    title: 'صديق',
    subtitle: 'كلام حر بالبرتغالي',
    icon: (
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Z"
          stroke="currentColor"
          strokeWidth="1.8"
        />
        <path
          d="M4 20a8 8 0 0 1 16 0"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    id: 'practice',
    href: '/lessons',
    title: 'تمرين',
    subtitle: 'خطة دروس من اللي اتعلّمته',
    icon: (
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M4 19.5V6.5A2.5 2.5 0 0 1 6.5 4H20v15.5H6.5A2.5 2.5 0 0 0 4 19.5Z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path d="M8 8h8M8 12h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'assessment',
    href: '/chat?agent=assessment',
    title: 'اختبار',
    subtitle: 'شوف إنت قادر لوحدك',
    icon: (
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M9 11.5 11 13.5 15.5 9"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M12 3 4.5 6v6.2c0 4.2 2.9 7.4 7.5 8.8 4.6-1.4 7.5-4.6 7.5-8.8V6L12 3Z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
] as const;

export default function Home() {
  return (
    <div className="app-shell flex justify-center">
      <main className="flex h-dvh w-full max-w-[430px] flex-col px-6 pb-10 pt-16">
        <header className="mb-12 text-center">
          <p className="text-sm text-muted">شريك البرتغالي</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">مين تحب تكلم؟</h1>
          <p className="mt-2 text-sm text-muted">اختار نوع المحادثة</p>
        </header>

        <div className="flex flex-1 flex-col justify-center gap-4">
          {AGENTS.map((agent) => (
            <Link
              key={agent.id}
              href={agent.href}
              className="group flex items-center gap-4 rounded-[1.5rem] border border-border bg-surface/80 px-5 py-5 backdrop-blur transition hover:border-accent-mint/40 hover:bg-surface-elevated"
            >
              <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl avatar-gradient text-[#04100e] shadow-lg shadow-teal-900/30 transition group-hover:scale-[1.03]">
                {agent.icon}
              </span>
              <span className="min-w-0 flex-1 text-start">
                <span className="block text-lg font-semibold text-white">{agent.title}</span>
                <span className="mt-0.5 block text-sm text-muted">{agent.subtitle}</span>
              </span>
              <span className="text-muted transition group-hover:text-accent-mint" aria-hidden>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="scale-x-[-1]">
                  <path
                    d="M9 18l6-6-6-6"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
