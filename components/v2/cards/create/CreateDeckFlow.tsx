'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { AudioButton } from '@/components/v2/AudioButton';
import { Icon } from '@/components/v2/Icon';
import { PrimaryButton } from '@/components/v2/PrimaryButton';
import { cardsHref } from '@/components/v2/cards/href';
import { toArDigits } from '@/lib/v2/formatAr';

const CHIPS = [
  'الطقس',
  'المطبخ',
  'عند الدكتور',
  'السوبرماركت',
  'الحمام',
  'المواصلات',
] as const;

type FoundDeck = {
  id: string;
  title_tl: string;
  title_ar: string;
  word_count: number;
};

type PreviewWord = {
  key: string;
  tl: string;
  say: string;
  ar: string;
  pos: string;
};

type Step =
  | 'topic'
  | 'found'
  | 'generating'
  | 'preview'
  | 'error';

export function CreateDeckFlow({ dayOverride }: { dayOverride: number | null }) {
  const router = useRouter();
  const [topic, setTopic] = useState('');
  const [step, setStep] = useState<Step>('topic');
  const [quotaRemaining, setQuotaRemaining] = useState<number | null>(null);
  const [found, setFound] = useState<FoundDeck[]>([]);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [titleAr, setTitleAr] = useState('');
  const [words, setWords] = useState<PreviewWord[]>([]);
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [errorEg, setErrorEg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/v2/custom-decks/quota');
        if (!res.ok) return;
        const data = (await res.json()) as { remaining?: number };
        if (!cancelled && typeof data.remaining === 'number') {
          setQuotaRemaining(data.remaining);
        }
      } catch {
        /* quiet */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function goHome() {
    router.push(cardsHref('/cards', dayOverride));
  }

  async function onFindOrGenerate(forceNew: boolean) {
    setErrorEg(null);
    const t = topic.trim();
    if (!t) return;

    if (!forceNew) {
      try {
        const res = await fetch('/api/v2/custom-decks/find', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ topic: t }),
        });
        if (res.ok) {
          const data = (await res.json()) as { decks?: FoundDeck[] };
          if (data.decks && data.decks.length > 0) {
            setFound(data.decks);
            setStep('found');
            return;
          }
        }
      } catch {
        /* fall through to generate */
      }
    }

    setStep('generating');
    try {
      const res = await fetch('/api/v2/custom-decks/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: t }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        draft_id?: string;
        title_ar?: string;
        words?: PreviewWord[];
        message_eg?: string;
        quota_remaining?: number;
      };
      if (typeof data.quota_remaining === 'number') {
        setQuotaRemaining(data.quota_remaining);
      }
      if (!res.ok || !data.ok || !data.draft_id || !data.words) {
        setErrorEg(data.message_eg ?? 'حصلت مشكلة، جرّب تاني');
        setStep('error');
        return;
      }
      setDraftId(data.draft_id);
      setTitleAr(data.title_ar ?? t);
      setWords(data.words);
      setRemoved(new Set());
      setStep('preview');
    } catch {
      setErrorEg('حصلت مشكلة، جرّب تاني');
      setStep('error');
    }
  }

  async function onSave() {
    if (!draftId) return;
    const remaining = words.filter((w) => !removed.has(w.key));
    if (remaining.length < 15) {
      setErrorEg('لازم يبقى ١٥ كلمة على الأقل عشان نحفظ الديك');
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch('/api/v2/custom-decks/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            draft_id: draftId,
            removed_keys: [...removed],
          }),
        });
        const data = (await res.json()) as {
          ok?: boolean;
          deck_id?: string;
          message_eg?: string;
        };
        if (!res.ok || !data.ok || !data.deck_id) {
          setErrorEg(data.message_eg ?? 'ما قدرناش نحفظ الديك');
          return;
        }
        router.push(
          cardsHref(`/cards/deck/custom:${data.deck_id}`, dayOverride),
        );
      } catch {
        setErrorEg('ما قدرناش نحفظ الديك');
      }
    });
  }

  const remainingCount = words.filter((w) => !removed.has(w.key)).length;

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-[390px] flex-col gap-4 bg-v2-paper px-4 pb-10 pt-4">
      <header className="flex items-center gap-3">
        <button
          type="button"
          onClick={goHome}
          className="flex h-11 w-11 items-center justify-center rounded-v2-chip bg-v2-card text-v2-ink shadow-[var(--shadow-v2-soft)]"
          aria-label="رجوع"
        >
          <Icon name="arrow_forward" size={24} />
        </button>
        <h1 className="font-[family-name:var(--font-v2-display-ar)] text-xl font-bold text-v2-ink">
          اعمل ديك
        </h1>
      </header>

      {step === 'topic' || step === 'error' ? (
        <section className="flex flex-col gap-4">
          <label className="font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink-muted">
            موضوع الديك
            <input
              value={topic}
              onChange={(e) => setTopic(e.target.value.slice(0, 60))}
              placeholder="مثلاً: الطقس، المطبخ، عند الدكتور"
              className="mt-2 w-full rounded-v2-row border border-v2-mist bg-v2-card px-4 py-3 font-[family-name:var(--font-v2-arabic)] text-base text-v2-ink outline-none focus:border-v2-primary"
              dir="rtl"
            />
          </label>
          {quotaRemaining != null ? (
            <p className="font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink-muted">
              باقيلك {toArDigits(quotaRemaining)} النهارده
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {CHIPS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setTopic(c)}
                className="min-h-11 rounded-v2-chip bg-v2-paper-deep px-3 font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink"
              >
                {c}
              </button>
            ))}
          </div>
          {errorEg ? (
            <p className="rounded-v2-row bg-v2-sand px-4 py-3 font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink">
              {errorEg}
            </p>
          ) : null}
          <PrimaryButton
            type="button"
            className="w-full"
            disabled={!topic.trim()}
            onClick={() => void onFindOrGenerate(false)}
          >
            كمّل
          </PrimaryButton>
        </section>
      ) : null}

      {step === 'found' && found[0] ? (
        <section className="flex flex-col gap-4">
          <p className="font-[family-name:var(--font-v2-arabic)] text-base text-v2-ink">
            فيه ديك جاهز: {found[0].title_ar} ·{' '}
            {toArDigits(found[0].word_count)} كلمة
          </p>
          <PrimaryButton
            href={cardsHref(`/cards/deck/custom:${found[0].id}`, dayOverride)}
            className="w-full"
          >
            ضيفه
          </PrimaryButton>
          <button
            type="button"
            className="min-h-11 rounded-v2-row bg-v2-card px-4 font-[family-name:var(--font-v2-arabic)] text-sm font-semibold text-v2-primary shadow-[var(--shadow-v2-soft)]"
            onClick={() => void onFindOrGenerate(true)}
          >
            اعمل واحد جديد برضه
          </button>
        </section>
      ) : null}

      {step === 'generating' ? (
        <p className="py-16 text-center font-[family-name:var(--font-v2-arabic)] text-base text-v2-ink-muted">
          بنجهّز الكلمات…
        </p>
      ) : null}

      {step === 'preview' ? (
        <section className="flex flex-col gap-3">
          <h2 className="font-[family-name:var(--font-v2-display-ar)] text-lg font-bold text-v2-ink">
            {titleAr}
          </h2>
          <p className="font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink-muted">
            باقي {toArDigits(remainingCount)} كلمة · شيل اللي مش عايزه
          </p>
          {errorEg ? (
            <p className="rounded-v2-row bg-v2-sand px-4 py-3 font-[family-name:var(--font-v2-arabic)] text-sm">
              {errorEg}
            </p>
          ) : null}
          <ul className="flex flex-col gap-2">
            {words.map((w) => {
              const gone = removed.has(w.key);
              return (
                <li
                  key={w.key}
                  className={[
                    'flex items-center justify-between gap-2 rounded-v2-row bg-v2-card px-3 py-3 shadow-[var(--shadow-v2-soft)]',
                    gone ? 'opacity-40' : '',
                  ].join(' ')}
                >
                  <AudioButton
                    text={w.tl}
                    size="chip"
                    label={`نطق ${w.tl}`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-[family-name:var(--font-v2-display)] text-base font-semibold text-v2-ink">
                      {w.tl}
                    </p>
                    <p className="font-[family-name:var(--font-v2-arabic)] text-xs text-v2-ink-muted">
                      {w.ar}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="min-h-11 shrink-0 px-2 font-[family-name:var(--font-v2-arabic)] text-sm text-v2-action"
                    onClick={() => {
                      setRemoved((prev) => {
                        const next = new Set(prev);
                        if (next.has(w.key)) next.delete(w.key);
                        else next.add(w.key);
                        return next;
                      });
                    }}
                  >
                    {gone ? 'رجّع' : 'شيل'}
                  </button>
                </li>
              );
            })}
          </ul>
          <PrimaryButton
            type="button"
            className="w-full"
            disabled={pending || remainingCount < 15}
            onClick={() => void onSave()}
          >
            احفظ الديك
          </PrimaryButton>
          <Link
            href={cardsHref('/cards', dayOverride)}
            className="text-center font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink-muted"
          >
            إلغاء
          </Link>
        </section>
      ) : null}
    </div>
  );
}
