'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { authClient } from '@/lib/v2/auth/client';
import { PrimaryButton } from '@/components/v2/PrimaryButton';
import type { V2User } from '@/lib/v2/auth/types';
import {
  ALLOWED_NATIVE_LANGS,
  ALLOWED_TARGET_LANGS,
  PROFILE_LANG_OPTIONS,
  type ProfileLangCode,
} from '@/lib/v2/auth/languages';

type Props = {
  user: V2User;
};

export function SettingsPanel({ user }: Props) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(user.name);
  const [gender, setGender] = useState<'m' | 'f' | ''>(user.gender ?? '');
  const [nativeLang, setNativeLang] = useState<ProfileLangCode>(
    user.native_lang,
  );
  const [targetLang, setTargetLang] = useState<ProfileLangCode>(
    user.target_lang,
  );
  const [image, setImage] = useState<string | null>(user.image);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const initial =
    (name.trim() || user.email || '?').slice(0, 1).toUpperCase() || '?';

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch('/api/v2/me', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          gender: gender === '' ? null : gender,
          native_lang: nativeLang,
          target_lang: targetLang,
        }),
      });
      if (!res.ok) throw new Error('failed');
      setMessage('اتحفظ');
      router.refresh();
    } catch {
      setMessage('حصل خطأ');
    } finally {
      setBusy(false);
    }
  }

  async function onAvatarPicked(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setMessage(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/v2/me/avatar', {
        method: 'POST',
        body: form,
      });
      if (!res.ok) throw new Error('failed');
      const data = (await res.json()) as { user?: { image?: string | null } };
      if (data.user?.image) setImage(data.user.image);
      setMessage('اتحفظت الصورة');
      router.refresh();
    } catch {
      setMessage('رفع الصورة فشل');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function signOut() {
    await authClient.signOut();
    router.replace('/sign-in');
  }

  async function deleteAccount() {
    setBusy(true);
    try {
      const res = await fetch('/api/v2/me/delete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ confirm: true }),
      });
      if (!res.ok) throw new Error('failed');
      router.replace('/sign-in');
    } catch {
      setMessage('مسح الحساب فشل');
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-start gap-3">
        <div className="relative size-20 overflow-hidden rounded-full border border-v2-mist bg-v2-paper-deep">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={image}
              alt=""
              className="size-full object-cover"
            />
          ) : (
            <span className="flex size-full items-center justify-center font-[family-name:var(--font-v2-display-ar)] text-2xl text-v2-ink">
              {initial}
            </span>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => void onAvatarPicked(e.target.files?.[0])}
        />
        <button
          type="button"
          disabled={busy}
          className="font-[family-name:var(--font-v2-arabic)] text-v2-primary underline disabled:opacity-50"
          onClick={() => fileRef.current?.click()}
        >
          غيّر الصورة
        </button>
      </div>

      <label className="font-[family-name:var(--font-v2-arabic)] text-v2-ink">
        الاسم
        <input
          className="mt-2 w-full rounded-xl border border-v2-mist bg-white px-3 py-3 outline-none focus:border-v2-sage"
          value={name}
          onChange={(e) => setName(e.target.value)}
          dir="auto"
        />
      </label>

      <label className="font-[family-name:var(--font-v2-arabic)] text-v2-ink">
        اللغة الأم
        <select
          className="mt-2 w-full rounded-xl border border-v2-mist bg-white px-3 py-3 outline-none focus:border-v2-sage"
          value={nativeLang}
          onChange={(e) => setNativeLang(e.target.value as ProfileLangCode)}
        >
          {PROFILE_LANG_OPTIONS.map((opt) => (
            <option
              key={opt.value}
              value={opt.value}
              disabled={
                !(ALLOWED_NATIVE_LANGS as readonly string[]).includes(opt.value)
              }
            >
              {opt.label}
            </option>
          ))}
        </select>
      </label>

      <label className="font-[family-name:var(--font-v2-arabic)] text-v2-ink">
        اللغة المستهدفة
        <select
          className="mt-2 w-full rounded-xl border border-v2-mist bg-white px-3 py-3 outline-none focus:border-v2-sage"
          value={targetLang}
          onChange={(e) => setTargetLang(e.target.value as ProfileLangCode)}
        >
          {PROFILE_LANG_OPTIONS.map((opt) => (
            <option
              key={opt.value}
              value={opt.value}
              disabled={
                !(ALLOWED_TARGET_LANGS as readonly string[]).includes(opt.value)
              }
            >
              {opt.label}
            </option>
          ))}
        </select>
      </label>

      <fieldset className="font-[family-name:var(--font-v2-arabic)] text-v2-ink">
        <legend className="mb-2">الجنس (عشان obrigado / obrigada)</legend>
        <div className="flex gap-3">
          {(
            [
              ['m', 'ولد'],
              ['f', 'بنت'],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className="flex items-center gap-2">
              <input
                type="radio"
                name="gender"
                checked={gender === value}
                onChange={() => setGender(value)}
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <PrimaryButton disabled={busy} onClick={() => void save()}>
        حفظ
      </PrimaryButton>

      {message ? (
        <p className="font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink-muted">
          {message}
        </p>
      ) : null}

      <button
        type="button"
        className="py-2 text-start font-[family-name:var(--font-v2-arabic)] text-v2-ink underline"
        onClick={() => void signOut()}
      >
        خروج
      </button>

      {!confirmDelete ? (
        <button
          type="button"
          className="py-2 text-start font-[family-name:var(--font-v2-arabic)] text-amber-800 underline"
          onClick={() => setConfirmDelete(true)}
        >
          امسح حسابي
        </button>
      ) : (
        <div className="flex flex-col gap-2 rounded-xl bg-amber-50 p-4">
          <p className="font-[family-name:var(--font-v2-arabic)] text-sm text-amber-900">
            متأكد؟ هنمسح تقدّمك وكل بياناتك في v2. مش هيرجع.
          </p>
          <PrimaryButton disabled={busy} onClick={() => void deleteAccount()}>
            أيوه، امسح
          </PrimaryButton>
          <button
            type="button"
            className="text-sm text-v2-ink-muted underline"
            onClick={() => setConfirmDelete(false)}
          >
            إلغاء
          </button>
        </div>
      )}
    </div>
  );
}
