import { BrandLogo } from '@/components/v2/BrandLogo';

export function V2Unavailable() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-v2-paper px-4 text-center">
      <div className="flex max-w-sm flex-col items-center">
        <BrandLogo className="mb-4 h-auto w-40" />
        <p className="font-[family-name:var(--font-v2-arabic)] text-v2-ink-muted">
          الواجهة الجديدة مقفولة. فعّل{' '}
          <code className="font-[family-name:var(--font-v2-ui)] text-sm">V2_ENABLED=true</code>.
        </p>
      </div>
    </main>
  );
}
