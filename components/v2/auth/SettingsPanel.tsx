'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { authClient } from '@/lib/v2/auth/client';
import { PrimaryButton } from '@/components/v2/PrimaryButton';
import type { V2User } from '@/lib/v2/auth/types';

type Props = {
  user: V2User;
};

export function SettingsPanel({ user }: Props) {
  const router = useRouter();
  const [name, setName] = useState(user.name);
  const [gender, setGender] = useState<'m' | 'f' | ''>(user.gender ?? '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

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
      <label className="font-[family-name:var(--font-v2-arabic)] text-v2-ink">
        الاسم
        <input
          className="mt-2 w-full rounded-xl border border-v2-mist bg-white px-3 py-3 outline-none focus:border-v2-sage"
          value={name}
          onChange={(e) => setName(e.target.value)}
          dir="auto"
        />
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
