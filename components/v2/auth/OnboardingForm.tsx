'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { PrimaryButton } from '@/components/v2/PrimaryButton';

type Step = 'name' | 'gender';

export function OnboardingForm({ initialName }: { initialName: string }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>('name');
  const [name, setName] = useState(initialName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function saveName() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/v2/me', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: name.trim() || undefined }),
      });
      if (!res.ok) throw new Error('failed');
      setStep('gender');
    } catch {
      setError('حاول تاني');
    } finally {
      setBusy(false);
    }
  }

  async function saveGender(gender: 'm' | 'f' | null) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/v2/me', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ gender, onboarded: true }),
      });
      if (!res.ok) throw new Error('failed');
      router.replace('/day/1');
    } catch {
      setError('حاول تاني');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-[100dvh] flex-col gap-6 px-5 py-10">
      <h1 className="font-[family-name:var(--font-v2-display-ar)] text-3xl text-v2-ink">
        خلّينا نتعرّف
      </h1>

      {step === 'name' ? (
        <div className="flex flex-col gap-4">
          <label className="font-[family-name:var(--font-v2-arabic)] text-v2-ink">
            اسمك (الشخصيات هتناديك بيه)
            <input
              className="mt-2 w-full rounded-xl border border-v2-mist bg-white px-3 py-3 text-v2-ink outline-none focus:border-v2-sage"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              dir="auto"
            />
          </label>
          <PrimaryButton
            disabled={busy || !name.trim()}
            onClick={() => void saveName()}
          >
            كمّل
          </PrimaryButton>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="font-[family-name:var(--font-v2-arabic)] text-v2-ink-muted">
            عشان نقولك obrigado ولا obrigada
          </p>
          <div className="flex flex-col gap-2">
            <PrimaryButton disabled={busy} onClick={() => void saveGender('m')}>
              ولد
            </PrimaryButton>
            <PrimaryButton disabled={busy} onClick={() => void saveGender('f')}>
              بنت
            </PrimaryButton>
            <button
              type="button"
              disabled={busy}
              className="py-2 font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink-muted underline"
              onClick={() => void saveGender(null)}
            >
              تخطّي (هنفترض ولد، تقدّر تغيّر بعدين)
            </button>
          </div>
        </div>
      )}

      {error ? (
        <p className="font-[family-name:var(--font-v2-arabic)] text-sm text-amber-700">
          {error}
        </p>
      ) : null}
    </main>
  );
}
