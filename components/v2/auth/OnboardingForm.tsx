'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Icon } from '@/components/v2/Icon';
import type {
  CoachDialect,
  DailyMinutesOption,
  MotivationId,
  ProficiencyLevel,
} from '@/lib/v2/auth/onboardingProfile';

type Step =
  | 'name'
  | 'gender'
  | 'dialect'
  | 'motivation'
  | 'level'
  | 'daily';

const STEPS: Step[] = [
  'name',
  'gender',
  'dialect',
  'motivation',
  'level',
  'daily',
];

const STEP_LABELS: Record<Step, string> = {
  name: 'الاسم',
  gender: 'الجنس',
  dialect: 'اللهجة',
  motivation: 'الدافع',
  level: 'المستوى',
  daily: 'الالتزام اليومي',
};

const DIALECT_OPTIONS: {
  id: CoachDialect;
  title: string;
  body: string;
  icon: string;
  badge?: string;
  preview: string;
}[] = [
  {
    id: 'eg',
    title: 'اللهجة المصرية',
    body: 'شرح تلقائي ومبسط بأمثلة من كلام الشارع اليومي في مصر.',
    icon: 'explore',
    badge: 'الأكثر شيوعاً',
    preview: 'صباح الفل يا بطل، جاهز؟',
  },
  {
    id: 'msa',
    title: 'العربية الفصحى المبسطة',
    body: 'لغة عربية واضحة ومباشرة خالية من التعقيد.',
    icon: 'menu_book',
    preview: 'مرحباً بك، لنبدأ درسنا اليوم.',
  },
  {
    id: 'levantine',
    title: 'اللهجة الشامية',
    body: 'شرح قريب للمتعلمين في الشام وبلاد المهجر.',
    icon: 'spa',
    preview: 'يسعد أوقاتك، جاهز لنبلش سوا؟',
  },
  {
    id: 'gulf',
    title: 'اللهجة الخليجية',
    body: 'عبارات مبسطة وتوضيحات تناسب لهجة الخليج العربي.',
    icon: 'wb_sunny',
    preview: 'حيّاك الله، نبدأ تمريننا اليوم؟',
  },
];

const MOTIVATION_OPTIONS: {
  id: MotivationId;
  title: string;
  body: string;
  icon: string;
}[] = [
  {
    id: 'travel',
    title: 'السفر أو الإقامة في البرتغال',
    body: 'التعامل في السوبرماركت، كافيهات لشبونة، والمصالح الحكومية.',
    icon: 'tram',
  },
  {
    id: 'fluency',
    title: 'التحدث بطلاقة وبدون خوف',
    body: 'كسر حاجز الكلام والرد التلقائي بدون ترجمة في دماغك.',
    icon: 'forum',
  },
  {
    id: 'work',
    title: 'الشغل والفرص المهنية',
    body: 'محادثات العمل، الاجتماعات، وإيميلات الشغل اليومية.',
    icon: 'work',
  },
  {
    id: 'culture',
    title: 'شغف باللغة والثقافة البرتغالية',
    body: 'فهم الأغاني، القصص، والحوارات مع السكان الأصليين.',
    icon: 'queue_music',
  },
];

const LEVEL_OPTIONS: {
  id: ProficiencyLevel;
  title: string;
  body: string;
  icon: string;
  badge?: string;
  badgeTone?: 'success' | 'tertiary';
}[] = [
  {
    id: 'zero',
    title: 'صفر تماماً · أول مرة أسمعها',
    body: 'عايز أتعلم النطق المظبوط وحروف البرتغالية الأوروبية من الأساس.',
    icon: 'potted_plant',
    badge: 'الأنسب للبداية',
    badgeTone: 'success',
  },
  {
    id: 'words',
    title: 'عارف كام كلمة بس متلخبط',
    body: 'بعرف أقول Olá و Obrigado بس مقدرش أفتح حوار بسيط.',
    icon: 'explore',
  },
  {
    id: 'basics',
    title: 'عندي أساسيات وبنسى وأنا بتكلم',
    body: 'فاهِم القواعد شوية لكن لساني بيقف لما حد يكلمني بسرعة.',
    icon: 'forum',
  },
  {
    id: 'quiz',
    title: 'عايز تقييم سريع (اختبار دقيقة)',
    body: 'جاوب على ٣ أسئلة سريعة والكوتش هيحدد مستواك بدقة.',
    icon: 'timer',
    badge: 'دقيقة واحدة',
    badgeTone: 'tertiary',
  },
];

const DAILY_OPTIONS: {
  minutes: DailyMinutesOption;
  title: string;
  body: string;
  icon: string;
  badge?: string;
}[] = [
  {
    minutes: 5,
    title: '٥ دقايق / يوم',
    body: 'هادي وخفيف — تثبيت كلمتين وتمرين نطق واحد على السريع.',
    icon: 'nature',
  },
  {
    minutes: 15,
    title: '١٠ إلى ١٥ دقيقة / يوم',
    body: 'محادثة واقعية + تثبيت ٦ كلمات وقاعدة واحدة.',
    icon: 'local_fire_department',
    badge: 'الموصى به',
  },
  {
    minutes: 20,
    title: '٢٠ دقيقة / يوم',
    body: 'مكثف للمسافرين — جلسة نطق متكاملة وسيناريو شوارع لشبونة.',
    icon: 'flight_takeoff',
  },
];

type Props = {
  initialName: string;
  initialDialect?: CoachDialect | null;
  initialMotivations?: MotivationId[];
  initialProficiency?: ProficiencyLevel | null;
  initialDailyMinutes?: number | null;
};

export function OnboardingForm({
  initialName,
  initialDialect = 'eg',
  initialMotivations = [],
  initialProficiency = null,
  initialDailyMinutes = 15,
}: Props) {
  const router = useRouter();
  const [stepIndex, setStepIndex] = useState(0);
  const step = STEPS[stepIndex]!;
  const [name, setName] = useState(initialName);
  const [dialect, setDialect] = useState<CoachDialect>(
    initialDialect ?? 'eg',
  );
  const [motivations, setMotivations] = useState<MotivationId[]>(
    initialMotivations,
  );
  const [level, setLevel] = useState<ProficiencyLevel | null>(
    initialProficiency,
  );
  const [daily, setDaily] = useState<DailyMinutesOption>(
    initialDailyMinutes === 5 ||
      initialDailyMinutes === 15 ||
      initialDailyMinutes === 20
      ? initialDailyMinutes
      : 15,
  );
  const [reminders, setReminders] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const progress = Math.round(((stepIndex + 1) / STEPS.length) * 100);

  async function patch(body: Record<string, unknown>) {
    const res = await fetch('/api/v2/me', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error('failed');
  }

  function goBack() {
    setError(null);
    if (stepIndex > 0) setStepIndex((i) => i - 1);
  }

  async function advance(payload: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      await patch(payload);
      if (stepIndex >= STEPS.length - 1) {
        router.replace('/day/1');
        return;
      }
      setStepIndex((i) => i + 1);
    } catch {
      setError('حاول تاني');
    } finally {
      setBusy(false);
    }
  }

  function toggleMotivation(id: MotivationId) {
    setMotivations((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id],
    );
  }

  const dialectLabel =
    DIALECT_OPTIONS.find((d) => d.id === dialect)?.title ?? 'المصرية';
  const motivationLabel =
    motivations.length === 0
      ? '—'
      : motivations
          .map((id) => MOTIVATION_OPTIONS.find((m) => m.id === id)?.title)
          .filter(Boolean)
          .slice(0, 2)
          .join(' · ');
  const levelLabel =
    LEVEL_OPTIONS.find((l) => l.id === level)?.title ?? 'مبتدئ';

  return (
    <div className="flex min-h-[100dvh] flex-col bg-v2-panel text-v2-ink">
      <header className="sticky top-0 z-20 border-b border-v2-divider/60 bg-v2-panel/90 backdrop-blur-xl">
        <div className="flex h-16 items-center justify-between px-4">
          <button
            type="button"
            aria-label="رجوع"
            onClick={goBack}
            className="flex size-11 items-center justify-center text-v2-ink hover:text-v2-primary"
          >
            <Icon name="arrow_back" size={24} className="rtl:rotate-180" />
          </button>
          <div className="flex flex-col items-center">
            <h1 className="font-[family-name:var(--font-v2-ui)] text-sm font-semibold text-v2-ink">
              {STEP_LABELS[step]}
            </h1>
          </div>
          <div className="flex size-8 items-center justify-center rounded-full bg-v2-primary text-white">
            <Icon name="person" size={20} className="text-white" />
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-6 pb-10 pt-4">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between font-[family-name:var(--font-v2-arabic)] text-xs text-v2-ink-muted">
            <span>
              الخطوة {toArabicDigits(stepIndex + 1)} من{' '}
              {toArabicDigits(STEPS.length)}
            </span>
            <span>
              {stepIndex === STEPS.length - 1
                ? 'جاهز للانطلاق 100%'
                : `${toArabicDigits(progress)}٪ مكتمل`}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-v2-progress-track">
            <div
              className="h-full rounded-full bg-v2-progress-fill transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {step === 'name' ? (
          <StepBlock
            title="خلّينا نتعرّف"
            subtitle="اسمك (الشخصيات هتناديك بيه)"
          >
            <input
              className="h-12 w-full rounded-xl border border-v2-line bg-white px-4 font-[family-name:var(--font-v2-arabic)] text-base outline-none focus:ring-2 focus:ring-v2-focus-ring"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              dir="auto"
            />
            <PrimaryCta
              disabled={busy || !name.trim()}
              onClick={() => void advance({ name: name.trim() })}
            >
              كمّل
            </PrimaryCta>
          </StepBlock>
        ) : null}

        {step === 'gender' ? (
          <StepBlock
            title="الجنس"
            subtitle="عشان نقولك obrigado ولا obrigada"
          >
            <div className="flex flex-col gap-2">
              <SelectCard
                selected={false}
                title="ولد"
                onClick={() => void advance({ gender: 'm' })}
                icon="man"
              />
              <SelectCard
                selected={false}
                title="بنت"
                onClick={() => void advance({ gender: 'f' })}
                icon="woman"
              />
              <button
                type="button"
                disabled={busy}
                className="py-2 font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink-muted underline disabled:opacity-50"
                onClick={() => void advance({ gender: null })}
              >
                تخطّي (هنفترض ولد، تقدّر تغيّر بعدين)
              </button>
            </div>
          </StepBlock>
        ) : null}

        {step === 'dialect' ? (
          <StepBlock
            title="تحب نشرح لك بلهجة إيه؟"
            subtitle="هنظبط نبرة الكوتش الصوتي وشروحات القواعد بالنكهة الأقرب لودنك."
          >
            <span className="inline-flex w-fit items-center gap-1 rounded-full bg-v2-secondary-fixed px-3 py-1 font-[family-name:var(--font-v2-arabic)] text-[10px] font-bold text-v2-success-text">
              <Icon name="record_voice_over" size={20} />
              تخصيص التجربة الصوتية
            </span>
            <div className="flex flex-col gap-3">
              {DIALECT_OPTIONS.map((opt) => (
                <SelectCard
                  key={opt.id}
                  selected={dialect === opt.id}
                  title={opt.title}
                  body={opt.body}
                  icon={opt.icon}
                  badge={opt.badge}
                  onClick={() => setDialect(opt.id)}
                  footer={
                    <span className="flex items-center gap-2 text-xs text-v2-ink-muted">
                      <span className="flex size-7 items-center justify-center rounded-full bg-v2-primary text-white">
                        <Icon name="play_arrow" size={20} className="text-white" />
                      </span>
                      معاينة النبرة: «{opt.preview}»
                    </span>
                  }
                />
              ))}
            </div>
            <PrimaryCta
              disabled={busy}
              onClick={() => void advance({ coach_dialect: dialect })}
            >
              المتابعة
            </PrimaryCta>
            <p className="flex items-center justify-center gap-1 text-center font-[family-name:var(--font-v2-arabic)] text-xs text-v2-ink-muted">
              <Icon name="verified_user" size={20} className="text-v2-success" />
              تقدر تغير اللهجة في أي وقت من الإعدادات.
            </p>
          </StepBlock>
        ) : null}

        {step === 'motivation' ? (
          <StepBlock
            title="إيه دافعك الأكبر لتعلم البرتغالية؟"
            subtitle="علشان نركّز لك على المفردات والمواقف الحقيقية اللي هتقابلها فعلاً."
          >
            <div className="flex flex-col gap-3">
              {MOTIVATION_OPTIONS.map((opt) => (
                <SelectCard
                  key={opt.id}
                  selected={motivations.includes(opt.id)}
                  title={opt.title}
                  body={opt.body}
                  icon={opt.icon}
                  onClick={() => toggleMotivation(opt.id)}
                />
              ))}
            </div>
            <p className="flex items-start gap-2 rounded-xl bg-v2-primary-tint px-3 py-2 font-[family-name:var(--font-v2-arabic)] text-xs text-v2-primary-strong">
              <Icon name="auto_awesome" size={20} className="text-v2-primary" />
              اقتراح ذكي: هنجهّز لك أول درس بناءً على اختياراتك فوراً!
            </p>
            <p className="font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink-muted">
              اختار هدف أو أكتر لتخصيص محتواك.
            </p>
            <PrimaryCta
              disabled={busy || motivations.length === 0}
              onClick={() => void advance({ motivations })}
            >
              المتابعة
            </PrimaryCta>
          </StepBlock>
        ) : null}

        {step === 'level' ? (
          <StepBlock
            title="مستواك إيه في البرتغالية حالياً؟"
            subtitle="متشيلش هم لو لسه بتبدأ من الصفر، الكوتش هيمشي معاك خطوة بخطوة."
          >
            <div className="flex flex-col gap-3">
              {LEVEL_OPTIONS.map((opt) => (
                <SelectCard
                  key={opt.id}
                  selected={level === opt.id}
                  title={opt.title}
                  body={opt.body}
                  icon={opt.icon}
                  badge={opt.badge}
                  badgeTone={opt.badgeTone}
                  onClick={() => setLevel(opt.id)}
                />
              ))}
            </div>
            <PrimaryCta
              disabled={busy || !level}
              onClick={() =>
                level ? void advance({ proficiency: level }) : undefined
              }
            >
              المتابعة
            </PrimaryCta>
            <p className="flex items-center justify-center gap-1 text-center font-[family-name:var(--font-v2-arabic)] text-xs text-v2-ink-muted">
              <Icon name="verified_user" size={20} className="text-v2-success" />
              متقلقش، مش هنضيع وقتك في دروس إنت عارفها.
            </p>
          </StepBlock>
        ) : null}

        {step === 'daily' ? (
          <StepBlock
            title="تقدر تدّي للبرتغالي كام دقيقة يومياً؟"
            subtitle="الاستمرارية الهادية هي السر، ٥ دقايق بتركيز أحسن من ساعتين في الويك إند."
          >
            <div className="flex flex-col gap-3">
              {DAILY_OPTIONS.map((opt) => (
                <SelectCard
                  key={opt.minutes}
                  selected={daily === opt.minutes}
                  title={opt.title}
                  body={opt.body}
                  icon={opt.icon}
                  badge={opt.badge}
                  onClick={() => setDaily(opt.minutes)}
                />
              ))}
            </div>

            <div className="rounded-2xl border border-v2-line bg-v2-nested/60 p-4">
              <div className="mb-3 flex items-center gap-2">
                <Icon name="smart_toy" size={20} className="text-v2-primary" />
                <h3 className="font-[family-name:var(--font-v2-display-ar)] text-base font-semibold">
                  كوتشك الذكي AZ جاهز لتفصيل خطتك
                </h3>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <SummaryChip emoji="🇪🇬" label="اللهجة" value={dialectLabel} />
                <SummaryChip emoji="✈️" label="الهدف" value={motivationLabel} />
                <SummaryChip emoji="🌱" label="البداية" value={levelLabel} />
                <SummaryChip
                  emoji="⏱️"
                  label="يومياً"
                  value={`${toArabicDigits(daily)} دقيقة`}
                />
              </div>
              <p className="mt-3 flex items-center gap-1 font-[family-name:var(--font-v2-arabic)] text-xs text-v2-ink-muted">
                <Icon name="explore" size={20} />
                الوجهة الأولى: لشبونة وبورتو · Vamos lá!
              </p>
            </div>

            <PrimaryCta
              disabled={busy}
              onClick={() =>
                void advance({
                  practice: { daily_minutes: daily },
                  reminders: { daily_enabled: reminders },
                  onboarded: true,
                })
              }
            >
              انطلق للمسار التعليمي 🚀
            </PrimaryCta>

            <label className="flex items-center gap-2 font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink">
              <input
                type="checkbox"
                checked={reminders}
                onChange={(e) => setReminders(e.target.checked)}
                className="size-4 accent-v2-primary"
              />
              <Icon name="notifications_active" size={20} className="text-v2-primary" />
              تفعيل تذكير يومي لطيف في ميعادك المفضل
            </label>
          </StepBlock>
        ) : null}

        {error ? (
          <p className="font-[family-name:var(--font-v2-arabic)] text-sm text-amber-800">
            {error}
          </p>
        ) : null}
      </main>
    </div>
  );
}

function StepBlock({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="font-[family-name:var(--font-v2-display-ar)] text-2xl font-bold tracking-tight text-v2-ink">
          {title}
        </h2>
        {subtitle ? (
          <p className="font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink-muted">
            {subtitle}
          </p>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function PrimaryCta({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-v2-primary font-[family-name:var(--font-v2-display-ar)] text-lg font-semibold text-white shadow-md transition active:scale-[0.99] hover:bg-v2-primary-strong disabled:opacity-50"
    >
      {children}
      <Icon name="arrow_forward" size={20} className="text-white rtl:rotate-180" />
    </button>
  );
}

function SelectCard({
  selected,
  title,
  body,
  icon,
  badge,
  badgeTone = 'success',
  onClick,
  footer,
}: {
  selected: boolean;
  title: string;
  body?: string;
  icon: string;
  badge?: string;
  badgeTone?: 'success' | 'tertiary';
  onClick: () => void;
  footer?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'flex w-full flex-col gap-2 rounded-2xl border bg-white p-4 text-start transition',
        selected
          ? 'border-v2-primary bg-v2-primary-tint/40 shadow-sm'
          : 'border-v2-line hover:border-v2-primary/40',
      ].join(' ')}
    >
      <div className="flex items-start gap-3">
        <span
          className={[
            'flex size-10 shrink-0 items-center justify-center rounded-xl',
            selected
              ? 'bg-v2-primary text-white'
              : 'bg-v2-nested text-v2-ink-muted',
          ].join(' ')}
        >
          <Icon
            name={icon}
            size={20}
            className={selected ? 'text-white' : undefined}
          />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <span className="font-[family-name:var(--font-v2-display-ar)] text-base font-semibold text-v2-ink">
              {title}
            </span>
            <span
              className={[
                'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border',
                selected
                  ? 'border-v2-primary bg-v2-primary text-white'
                  : 'border-v2-line bg-white',
              ].join(' ')}
            >
              {selected ? (
                <Icon name="check" size={20} className="text-white" />
              ) : null}
            </span>
          </div>
          {body ? (
            <p className="mt-1 font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink-muted">
              {body}
            </p>
          ) : null}
          {badge ? (
            <span
              className={[
                'mt-2 inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold',
                badgeTone === 'tertiary'
                  ? 'bg-v2-grammar-note text-v2-grammar-note-text'
                  : 'bg-v2-success-panel text-v2-success-text',
              ].join(' ')}
            >
              {badge}
            </span>
          ) : null}
        </div>
      </div>
      {footer ? (
        <div className="rounded-lg bg-v2-input px-3 py-2">{footer}</div>
      ) : null}
    </button>
  );
}

function SummaryChip({
  emoji,
  label,
  value,
}: {
  emoji: string;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl bg-white px-3 py-2">
      <div className="flex items-center gap-1 text-xs text-v2-meta">
        <span>{emoji}</span>
        <span>{label}</span>
      </div>
      <p className="mt-0.5 truncate font-[family-name:var(--font-v2-arabic)] text-sm font-semibold text-v2-ink">
        {value}
      </p>
    </div>
  );
}

function toArabicDigits(n: number): string {
  return String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)]!);
}
