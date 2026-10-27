import { ReportErrorButton } from '@/components/v2';

export default function CardsPage() {
  return (
    <main className="flex flex-1 flex-col gap-3">
      <h1 className="font-[family-name:var(--font-v2-display-ar)] text-3xl text-v2-ink">
        الكروت
      </h1>
      <p className="font-[family-name:var(--font-v2-arabic)] text-v2-ink-muted">
        مراجعة النهارده. Phase 5.
      </p>
      <div className="mt-4 rounded-v2-row border border-v2-rule bg-v2-card px-3 py-3">
        <p className="font-[family-name:var(--font-v2-display)] text-lg text-v2-ink">
          Queria um café, por favor.
        </p>
        <p className="font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink-muted">
          أريد قهوة، من فضلك.
        </p>
        <div className="mt-2">
          <ReportErrorButton day={1} itemId="phrase.order_coffee" />
        </div>
      </div>
    </main>
  );
}
