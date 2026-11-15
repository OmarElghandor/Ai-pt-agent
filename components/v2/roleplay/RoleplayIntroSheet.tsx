'use client';

import { useMemo, useState } from 'react';
import type { RoleplayIndexTier, RoleplayKeyPhrase, RoleplayTier } from '@/lib/v2/roleplay/types';

export type RoleplayIntroSituation = {
  id: string;
  emoji: string;
  title_tl: string;
  title_ar: string;
  place_eg: string;
  task_eg: string;
  learner_role_eg: string;
  key_phrases: RoleplayKeyPhrase[];
  recommended_tier: RoleplayTier;
};

type Props = {
  situation: RoleplayIntroSituation;
  tiers: RoleplayIndexTier[];
  onStart: (tier: RoleplayTier) => void;
  starting?: boolean;
};

export function RoleplayIntroSheet({
  situation,
  tiers,
  onStart,
  starting,
}: Props) {
  const [tier, setTier] = useState<RoleplayTier>(situation.recommended_tier);
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [showPhrases, setShowPhrases] = useState(false);

  const selected = useMemo(
    () => tiers.find((t) => t.tier === tier) ?? tiers[0],
    [tiers, tier],
  );

  const playPhrase = async (tl: string) => {
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: tl, lang: 'pt-PT' }),
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      await audio.play();
    } catch {
      /* ignore */
    }
  };

  const begin = () => {
    if (tier === 1 && situation.key_phrases.length > 0 && !showPhrases) {
      setShowPhrases(true);
      setPhraseIndex(0);
      void playPhrase(situation.key_phrases[0].tl);
      return;
    }
    onStart(tier);
  };

  if (showPhrases) {
    const kp = situation.key_phrases[phraseIndex];
    const last = phraseIndex >= situation.key_phrases.length - 1;
    return (
      <div className="flex flex-col gap-5 px-4 pb-10 pt-4">
        <p className="font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink-muted">
          عبارات مهمة قبل ما تبدأ
        </p>
        <button
          type="button"
          onClick={() => void playPhrase(kp.tl)}
          className="rounded-v2-card bg-v2-card px-5 py-8 text-center shadow-[var(--shadow-v2-soft)]"
        >
          <p
            className="font-[family-name:var(--font-v2-target)] text-xl font-semibold text-v2-primary"
            dir="ltr"
          >
            {kp.tl}
          </p>
          <p className="mt-2 font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink-muted">
            {kp.ar}
          </p>
        </button>
        <button
          type="button"
          onClick={() => {
            if (last) {
              onStart(1);
              return;
            }
            const next = phraseIndex + 1;
            setPhraseIndex(next);
            void playPhrase(situation.key_phrases[next].tl);
          }}
          className="min-h-12 rounded-v2-row bg-v2-primary font-[family-name:var(--font-v2-arabic)] text-base font-semibold text-white"
        >
          {last ? 'ابدأ' : 'التالي'}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 px-4 pb-10 pt-4">
      <header className="flex flex-col gap-1">
        <span className="text-3xl" aria-hidden>
          {situation.emoji}
        </span>
        <h1
          className="font-[family-name:var(--font-v2-target)] text-xl font-bold text-v2-primary"
          dir="ltr"
        >
          {situation.title_tl}
        </h1>
        <p className="font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink-muted">
          {situation.title_ar}
        </p>
      </header>

      <dl className="flex flex-col gap-3 rounded-v2-card bg-v2-card px-4 py-4 shadow-[var(--shadow-v2-soft)] font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink">
        <div>
          <dt className="text-v2-ink-muted">المكان</dt>
          <dd>{situation.place_eg}</dd>
        </div>
        <div>
          <dt className="text-v2-ink-muted">المهمة</dt>
          <dd>{situation.task_eg}</dd>
        </div>
        <div>
          <dt className="text-v2-ink-muted">دورك</dt>
          <dd>{situation.learner_role_eg}</dd>
        </div>
      </dl>

      <div className="flex flex-col gap-2">
        <p className="font-[family-name:var(--font-v2-arabic)] text-sm font-semibold text-v2-ink">
          الدرجة
        </p>
        <div className="grid grid-cols-3 gap-2">
          {tiers.map((t) => {
            const active = t.tier === tier;
            return (
              <button
                key={t.tier}
                type="button"
                onClick={() => setTier(t.tier)}
                className={[
                  'rounded-v2-row px-2 py-3 text-center font-[family-name:var(--font-v2-arabic)] text-xs font-semibold ring-1 transition',
                  active
                    ? 'bg-v2-primary text-white ring-v2-primary'
                    : 'bg-v2-card text-v2-ink ring-v2-line',
                ].join(' ')}
              >
                {t.name_eg}
              </button>
            );
          })}
        </div>
        {selected ? (
          <p className="font-[family-name:var(--font-v2-arabic)] text-xs text-v2-ink-muted">
            {selected.desc_eg}
          </p>
        ) : null}
      </div>

      <button
        type="button"
        disabled={starting}
        onClick={begin}
        className="min-h-12 rounded-v2-row bg-v2-primary font-[family-name:var(--font-v2-arabic)] text-base font-semibold text-white disabled:opacity-60"
      >
        {starting ? '…' : 'ابدأ'}
      </button>
    </div>
  );
}
