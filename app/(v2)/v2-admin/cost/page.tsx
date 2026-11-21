import Link from 'next/link';

export default function V2AdminCostPage() {
  return (
    <div className="mx-auto max-w-2xl" dir="rtl">
      <h1 className="font-[family-name:var(--font-v2-display-ar)] text-2xl">
        التكلفة
      </h1>
      <p className="mt-2 text-sm text-v2-ink-muted">
        صفحة التكلفة الموحدة هتيجي في D8. دلوقتي تكلفة المكتبة موجودة هنا:
      </p>
      <p className="mt-4">
        <Link
          href="/v2-admin/library/cost"
          className="rounded-v2-chip bg-v2-action px-4 py-2 text-sm text-white"
        >
          تكلفة المكتبة
        </Link>
      </p>
    </div>
  );
}
