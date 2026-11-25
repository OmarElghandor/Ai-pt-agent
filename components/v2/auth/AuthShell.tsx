import type { ReactNode } from 'react';
import Link from 'next/link';
import { BrandLogo } from '@/components/v2/BrandLogo';
import { Icon } from '@/components/v2/Icon';

type Props = {
  title: string;
  eyebrow?: string;
  children: ReactNode;
  backHref?: string;
};

/** Shared RTL chrome for sign-in / sign-up (Stitch layout, Lumina tokens). */
export function AuthShell({
  title,
  eyebrow = 'az-talkie',
  children,
  backHref = '/',
}: Props) {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-v2-panel text-v2-ink">
      <header className="sticky top-0 z-20 border-b border-v2-divider/60 bg-v2-panel/90 backdrop-blur-xl">
        <div className="flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <Link
              href={backHref}
              aria-label="رجوع"
              className="flex size-11 items-center justify-center rounded-full text-v2-ink transition hover:bg-v2-nested"
            >
              <Icon name="arrow_back" size={24} className="rtl:rotate-180" />
            </Link>
            <div className="flex flex-col">
              <h1 className="font-[family-name:var(--font-v2-display-ar)] text-xl font-semibold leading-tight text-v2-ink">
                {title}
              </h1>
              <span className="font-[family-name:var(--font-v2-ui)] text-[10px] font-bold tracking-wide text-v2-primary uppercase">
                {eyebrow}
              </span>
            </div>
          </div>
          <div className="flex size-9 items-center justify-center overflow-hidden rounded-full bg-white p-1 shadow-sm">
            <BrandLogo variant="mark" className="size-full object-contain" />
          </div>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-6 pb-10 pt-4">
        {children}
      </main>
      <p className="pb-6 text-center font-[family-name:var(--font-v2-ui)] text-xs text-v2-meta">
        az-talkie · Aprendizagem de Português
      </p>
    </div>
  );
}
