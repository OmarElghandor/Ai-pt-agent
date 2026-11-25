'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { BrandLogo } from '@/components/v2/BrandLogo';
import { Icon } from '@/components/v2/Icon';
import { authClient } from '@/lib/v2/auth/client';
import { AuthShell } from './AuthShell';
import { SocialAuthButtons } from './SocialAuthButtons';

type Props = {
  callbackURL: string;
};

export function SignInForm({ callbackURL }: Props) {
  const router = useRouter();
  const [identity, setIdentity] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const value = identity.trim();
    if (!value || !password) {
      setError('اكتب البريد أو اسم المستخدم وكلمة المرور');
      setBusy(false);
      return;
    }
    try {
      const isEmail = value.includes('@');
      const result = isEmail
        ? await authClient.signIn.email({
            email: value,
            password,
            callbackURL,
            rememberMe: remember,
          })
        : await authClient.signIn.username({
            username: value,
            password,
            callbackURL,
            rememberMe: remember,
          });
      if (result.error) {
        setError('بيانات الدخول مش مظبوطة');
        setBusy(false);
        return;
      }
      router.replace(callbackURL);
      router.refresh();
    } catch {
      setError('حصل خطأ، حاول تاني');
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Sign In">
      <div className="flex flex-col items-center gap-2 py-2">
        <BrandLogo
          priority
          className="h-24 w-auto object-contain drop-shadow-sm"
        />
        <span className="inline-flex items-center gap-1 rounded-full bg-v2-success-panel px-3 py-1 font-[family-name:var(--font-v2-arabic)] text-[10px] font-bold text-v2-success-text">
          <Icon name="verified_user" size={20} className="text-v2-success" />
          بوابة الدخول الآمنة
        </span>
      </div>

      <div className="flex flex-col gap-1">
        <h2 className="font-[family-name:var(--font-v2-display-ar)] text-2xl font-semibold text-v2-ink">
          بيانات الحساب
        </h2>
        <p className="font-[family-name:var(--font-v2-arabic)] text-base text-v2-ink-muted">
          اكتب البريد الإلكتروني أو اسم المستخدم وكلمة المرور لتسجيل الدخول
        </p>
      </div>

      <form
        onSubmit={(e) => void onSubmit(e)}
        className="flex flex-col gap-3 rounded-2xl border border-v2-line bg-white p-4 shadow-sm"
      >
        <input
          className="h-12 w-full rounded-lg bg-v2-input px-4 font-[family-name:var(--font-v2-arabic)] text-base text-v2-ink outline-none transition focus:bg-white focus:ring-2 focus:ring-v2-focus-ring"
          placeholder="name@example.com أو اسمك"
          value={identity}
          onChange={(e) => setIdentity(e.target.value)}
          autoComplete="username"
          dir="ltr"
        />
        <div className="relative">
          <input
            className="h-12 w-full rounded-lg bg-v2-input px-4 pe-11 font-[family-name:var(--font-v2-ui)] text-base text-v2-ink outline-none transition focus:bg-white focus:ring-2 focus:ring-v2-focus-ring"
            type={showPassword ? 'text' : 'password'}
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            dir="ltr"
          />
          <button
            type="button"
            aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
            className="absolute end-0 top-0 flex h-12 w-11 items-center justify-center text-v2-meta hover:text-v2-ink"
            onClick={() => setShowPassword((v) => !v)}
          >
            <Icon name={showPassword ? 'visibility_off' : 'visibility'} size={20} />
          </button>
        </div>

        <div className="flex items-center justify-between gap-2">
          <label className="flex items-center gap-2 font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="size-4 accent-v2-primary"
            />
            تذكرني على هذا الجهاز
          </label>
          <span className="rounded-full bg-v2-primary-tint px-2.5 py-0.5 font-[family-name:var(--font-v2-arabic)] text-[10px] font-bold text-v2-primary-strong">
            30 يوم
          </span>
        </div>

        <button
          type="submit"
          disabled={busy}
          className="mt-1 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-v2-primary font-[family-name:var(--font-v2-display-ar)] text-xl font-semibold text-white shadow-sm transition active:scale-[0.99] hover:bg-v2-primary-strong disabled:opacity-50"
        >
          <span>تسجيل الدخول</span>
          <Icon name="arrow_forward" size={20} className="text-white rtl:rotate-180" />
        </button>

        {error ? (
          <p className="font-[family-name:var(--font-v2-arabic)] text-sm text-amber-800">
            {error}
          </p>
        ) : null}
      </form>

      <SocialAuthButtons callbackURL={callbackURL} />

      <p className="text-center font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink">
        لسه معندكش حساب؟{' '}
        <Link
          href={`/sign-up?next=${encodeURIComponent(callbackURL)}`}
          className="font-semibold text-v2-primary"
        >
          إنشاء حساب جديد +
        </Link>
      </p>

      <p className="text-center font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink-muted">
        <Link href="/privacy" className="underline underline-offset-2">
          الخصوصية
        </Link>
      </p>
    </AuthShell>
  );
}
