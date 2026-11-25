import Link from 'next/link';

export default function V2AdminImagesPage() {
  return (
    <div className="mx-auto max-w-2xl" dir="rtl">
      <h1 className="font-[family-name:var(--font-v2-display-ar)] text-2xl">
        الصور
      </h1>
      <p className="mt-2 text-sm text-v2-ink-muted">
        شاشة التوليد بالجملة هتيجي في المهمة D7. دلوقتي تقدر تدير صور الدرس من
        صفحة اليوم، وصور المجموعات من الكروت.
      </p>
      <ul className="mt-4 list-disc space-y-2 pe-5 text-sm">
        <li>
          <Link href="/v2-admin/lessons" className="text-v2-action">
            الدروس
          </Link>
        </li>
        <li>
          <Link href="/v2-admin/flashcards" className="text-v2-action">
            الكروت
          </Link>
        </li>
        <li>
          <Link href="/v2-admin/characters" className="text-v2-action">
            الشخصيات
          </Link>
        </li>
      </ul>
    </div>
  );
}
