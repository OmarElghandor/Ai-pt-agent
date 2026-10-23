export function V2Unavailable() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-v2-paper px-4 text-center">
      <div className="max-w-sm">
        <h1 className="font-[family-name:var(--font-v2-display-ar)] text-2xl text-v2-ink">
          Langify v2
        </h1>
        <p className="mt-2 font-[family-name:var(--font-v2-arabic)] text-v2-ink-muted">
          الواجهة الجديدة مقفولة. فعّل{' '}
          <code className="font-[family-name:var(--font-v2-ui)] text-sm">V2_ENABLED=true</code>.
        </p>
      </div>
    </main>
  );
}
