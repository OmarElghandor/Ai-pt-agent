'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Icon } from '@/components/v2/Icon';
import { authClient } from '@/lib/v2/auth/client';
import { AuthShell } from './AuthShell';
import { SocialAuthButtons } from './SocialAuthButtons';

type Props = {
  callbackURL: string;
};

export function SignUpForm({ callbackURL }: Props) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!accepted) {
      setError('وافق على الشروط والخصوصية أولاً');
      return;
    }
    if (!name.trim() || !email.trim() || password.length < 8) {
      setError('كمّل الاسم والإيميل وكلمة مرور من ٨ خانات');
      return;
    }
    const cleanUsername = username.trim().toLowerCase();
    if (cleanUsername && !/^[a-z0-9_]{3,30}$/.test(cleanUsername)) {
      setError('اسم المستخدم: حروف إنجليزي وأرقام و _ فقط (٣–٣٠)');
      return;
    }
    setBusy(true);
    try {
      const result = await authClient.signUp.email({
        name: name.trim().slice(0, 80),
        email: email.trim(),
        password,
        ...(cleanUsername ? { username: cleanUsername } : {}),
        callbackURL,
      });
      if (result.error) {
        setError(result.error.message || 'ما قدرناش نعمل الحساب');
        setBusy(false);
        return;
      }
      router.replace('/onboarding');
      router.refresh();
    } catch {
      setError('حصل خطأ، حاول تاني');
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Sign Up">
      <p className="font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink-muted">
        خطوتك الأولى لتعلم البرتغالية بنطق متقن
      </p>
      <h2 className="font-[family-name:var(--font-v2-display-ar)] text-2xl font-bold tracking-tight text-v2-ink">
        إنشاء حساب جديد
      </h2>
      <p className="font-[family-name:var(--font-v2-arabic)] text-base text-v2-ink-muted">
        اكتب بياناتك لتبدأ رحلتك في ممارسة البرتغالية بثقة وهدوء وتفاعل صوتي دقيق
        من أول يوم.
      </p>

      <form
        onSubmit={(e) => void onSubmit(e)}
        className="flex flex-col gap-4"
      >
        <Field
          label="الاسم الكامل أو اسم الشهرة"
          hint="اسمك المفضل"
          htmlFor="reg-name"
        >
          <input
            id="reg-name"
            className={inputClass}
            placeholder="مثلاً: عمر الشريف"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            dir="auto"
          />
        </Field>

        <Field
          label="اسم المستخدم (Username)"
          hint="اختياري"
          htmlFor="reg-username"
        >
          <div className="relative">
            <span className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 font-[family-name:var(--font-v2-ui)] text-v2-meta">
              @
            </span>
            <input
              id="reg-username"
              className={`${inputClass} ps-8 text-left`}
              placeholder="omar_caderno"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              dir="ltr"
            />
          </div>
        </Field>

        <Field label="البريد الإلكتروني" htmlFor="reg-email">
          <input
            id="reg-email"
            type="email"
            className={`${inputClass} text-left`}
            placeholder="name@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            dir="ltr"
          />
        </Field>

        <Field label="كلمة المرور" hint="٨ خانات فأكثر" htmlFor="reg-password">
          <div className="relative">
            <input
              id="reg-password"
              type={showPassword ? 'text' : 'password'}
              className={`${inputClass} pe-11 text-left`}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              dir="ltr"
            />
            <button
              type="button"
              aria-label={
                showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'
              }
              className="absolute end-0 top-0 flex h-12 w-11 items-center justify-center text-v2-meta"
              onClick={() => setShowPassword((v) => !v)}
            >
              <Icon
                name={showPassword ? 'visibility_off' : 'visibility'}
                size={20}
              />
            </button>
          </div>
        </Field>

        <label className="flex items-start gap-2 font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink">
          <input
            type="checkbox"
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
            className="mt-1 size-4 accent-v2-primary"
          />
          <span>
            أوافق على{' '}
            <Link href="/privacy" className="font-medium text-v2-primary underline">
              شروط الاستخدام
            </Link>{' '}
            و
            <Link href="/privacy" className="font-medium text-v2-primary underline">
              سياسة الخصوصية
            </Link>{' '}
            لممارسة هادئة وموثوقة.
          </span>
        </label>

        <button
          type="submit"
          disabled={busy}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-v2-primary font-[family-name:var(--font-v2-display-ar)] text-xl font-semibold text-white shadow-sm transition active:scale-[0.99] hover:bg-v2-primary-strong disabled:opacity-50"
        >
          إنشاء الحساب والبدء
          <Icon name="arrow_forward" size={20} className="text-white rtl:rotate-180" />
        </button>

        {error ? (
          <p className="font-[family-name:var(--font-v2-arabic)] text-sm text-amber-800">
            {error}
          </p>
        ) : null}
      </form>

      <SocialAuthButtons
        callbackURL={callbackURL}
        label="أو التسجيل السريع بنقرة واحدة"
      />

      <p className="text-center font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink">
        عندك حساب بالفعل؟{' '}
        <Link
          href={`/sign-in?next=${encodeURIComponent(callbackURL)}`}
          className="font-semibold text-v2-primary"
        >
          تسجيل الدخول
        </Link>
      </p>
    </AuthShell>
  );
}

const inputClass =
  'mt-1.5 h-12 w-full rounded-xl bg-v2-input px-4 font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink outline-none transition placeholder:text-v2-meta focus:bg-white focus:ring-2 focus:ring-v2-focus-ring';

function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="flex items-center justify-between font-[family-name:var(--font-v2-arabic)] text-xs font-semibold text-v2-ink"
      >
        <span>{label}</span>
        {hint ? (
          <span className="text-[10px] font-bold tracking-wide text-v2-ink-muted">
            {hint}
          </span>
        ) : null}
      </label>
      {children}
    </div>
  );
}
