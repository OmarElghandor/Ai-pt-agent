'use client';

import { useEffect, useState } from 'react';
import { authClient } from '@/lib/v2/auth/client';

type ProviderId = 'google' | 'apple' | 'facebook';

type Props = {
  callbackURL: string;
  /** Optional label above the row */
  label?: string;
};

function toAbsoluteCallbackURL(callbackURL: string): string {
  if (callbackURL.startsWith('http://') || callbackURL.startsWith('https://')) {
    return callbackURL;
  }
  const path = callbackURL.startsWith('/') ? callbackURL : `/${callbackURL}`;
  return `${window.location.origin}${path}`;
}

export function SocialAuthButtons({
  callbackURL,
  label = 'تفضل الدخول السريع؟ المتابعة بحسابات التواصل',
}: Props) {
  const [configured, setConfigured] = useState({
    google: true,
    apple: false,
    facebook: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<ProviderId | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch('/api/v2/auth/providers')
      .then((r) => r.json())
      .then((data: { providers?: typeof configured }) => {
        if (cancelled || !data.providers) return;
        setConfigured({
          google: true,
          apple: Boolean(data.providers.apple),
          facebook: Boolean(data.providers.facebook),
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  async function signInSocial(provider: ProviderId) {
    setError(null);
    if (provider !== 'google' && !configured[provider]) {
      setError(
        provider === 'apple'
          ? 'تسجيل Apple مش متاح دلوقتي'
          : 'تسجيل Facebook مش متاح دلوقتي',
      );
      return;
    }
    setBusy(provider);
    try {
      await authClient.signIn.social({
        provider,
        callbackURL: toAbsoluteCallbackURL(callbackURL),
        errorCallbackURL: `${window.location.origin}/sign-in`,
        disableRedirect: false,
      });
    } catch {
      setError('حصل خطأ في الدخول');
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-center font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink-muted">
        {label}
      </p>
      <div className="flex items-center justify-center gap-3">
        <SocialIconButton
          ariaLabel="تسجيل الدخول بواسطة Facebook"
          disabled={busy !== null}
          onClick={() => void signInSocial('facebook')}
        >
          <FacebookGlyph />
        </SocialIconButton>
        <SocialIconButton
          ariaLabel="تسجيل الدخول بواسطة Apple"
          disabled={busy !== null}
          onClick={() => void signInSocial('apple')}
        >
          <AppleGlyph />
        </SocialIconButton>
        <SocialIconButton
          ariaLabel="تسجيل الدخول بواسطة Google"
          disabled={busy !== null}
          onClick={() => void signInSocial('google')}
        >
          <GoogleGlyph />
        </SocialIconButton>
      </div>
      {error ? (
        <p className="text-center font-[family-name:var(--font-v2-arabic)] text-sm text-amber-800">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function SocialIconButton({
  children,
  ariaLabel,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  ariaLabel: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onClick}
      className="flex h-11 w-[88px] max-w-[88px] flex-1 items-center justify-center rounded-lg bg-white text-v2-ink shadow-sm transition hover:bg-v2-nested disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function GoogleGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 18 18" aria-hidden>
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z"
      />
    </svg>
  );
}

function AppleGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden fill="currentColor">
      <path d="M16.365 1.43c0 1.14-.46 2.22-1.2 3.03-.78.86-2.06 1.52-3.15 1.43-.14-1.1.4-2.26 1.16-3.05.8-.86 2.17-1.5 3.19-1.41zM20.9 17.34c-.55 1.27-.82 1.84-1.53 2.96-1 1.55-2.4 3.48-4.15 3.5-1.55.02-1.95-1.01-4.06-1-2.1.01-2.55 1.02-4.1 1.04-1.75.03-3.09-1.76-4.1-3.3C1.1 17.4-.4 12.5 1.5 9.2c1.05-1.8 2.72-2.94 4.6-2.97 1.8-.04 3.5 1.21 4.06 1.21.55 0 2.55-1.5 4.3-1.28.73.03 2.79.3 4.11 2.24-3.55 1.95-2.98 7.02.33 8.94z" />
    </svg>
  );
}

function FacebookGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden fill="#1877F2">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}
