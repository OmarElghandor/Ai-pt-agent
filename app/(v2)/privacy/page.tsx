import Link from 'next/link';
import { BrandLogo } from '@/components/v2/BrandLogo';

export default function PrivacyPage() {
  return (
    <main className="flex flex-col gap-8 px-5 py-10" dir="rtl">
      <div>
        <BrandLogo className="mb-3 h-auto w-36" />
        <h1 className="font-[family-name:var(--font-v2-display-ar)] text-3xl text-v2-ink">
          الخصوصية
        </h1>
        <p className="mt-1 font-[family-name:var(--font-v2-manrope)] text-sm text-v2-ink-muted">
          Privacy
        </p>
      </div>

      <section className="flex flex-col gap-3 font-[family-name:var(--font-v2-arabic)] text-v2-ink leading-relaxed">
        <h2 className="text-lg font-semibold">إيه اللي بنخزّنه؟</h2>
        <ul className="list-disc pr-5 text-v2-ink-muted">
          <li>اسمك وإيميلك وصورتك من حساب Google</li>
          <li>تقدّمك في التعلّم (الدروس، الكروت، الأخطاء، المحادثات)</li>
          <li>تسجيلات الصوت بتتقفل بعد ما نحوّلها لنص (STT)، مش بنحتفظ بيها</li>
        </ul>
      </section>

      <section
        className="flex flex-col gap-3 font-[family-name:var(--font-v2-manrope)] text-v2-ink leading-relaxed"
        dir="ltr"
        lang="en"
      >
        <h2 className="text-lg font-semibold">What we store</h2>
        <ul className="list-disc pl-5 text-v2-ink-muted">
          <li>Your Google name, email, and profile picture</li>
          <li>Learning progress (lessons, cards, errors, conversations)</li>
          <li>Voice recordings only for the length of the speech-to-text call; we do not keep them</li>
        </ul>
      </section>

      <section className="flex flex-col gap-3 font-[family-name:var(--font-v2-arabic)] text-v2-ink leading-relaxed">
        <h2 className="text-lg font-semibold">ازاي تمسح حسابك؟</h2>
        <p className="text-v2-ink-muted">
          من صفحة «أنا» → «امسح حسابي». هنمسح بياناتك في A-Z Talkie. مش بنلمس حسابك على Langify
          القديميم، ولا المحتوى المشترك (الدروس والصور).
        </p>
        <p
          className="font-[family-name:var(--font-v2-manrope)] text-v2-ink-muted"
          dir="ltr"
          lang="en"
        >
          From Me → Delete my account. We delete your A-Z Talkie data. We never write to legacy
          Langify collections, and we never delete shared lessons or images.
        </p>
      </section>

      <Link
        href="/sign-in"
        className="font-[family-name:var(--font-v2-arabic)] text-v2-sage underline underline-offset-2"
      >
        رجوع لتسجيل الدخول
      </Link>
    </main>
  );
}
