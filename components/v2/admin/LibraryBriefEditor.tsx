'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  MOMENT_DIRECTIONS,
  momentMinimum,
} from '@/lib/v2/library/briefRules';
import LibraryScriptSection from '@/components/v2/admin/LibraryScriptSection';
import LibraryTokensSection from '@/components/v2/admin/LibraryTokensSection';
import LibraryReviewSection from '@/components/v2/admin/LibraryReviewSection';
import LibraryRemainingStages from '@/components/v2/admin/LibraryRemainingStages';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

const STAGES = [
  'brief',
  'script',
  'tokens',
  'review',
  'voices',
  'audio',
  'images',
  'publish',
] as const;
type Stage = (typeof STAGES)[number];

export const STAGE_LABEL: Record<Stage, string> = {
  brief: 'الـ brief',
  script: 'السكريبت',
  tokens: 'الكلمات',
  review: 'المراجعة',
  voices: 'الأصوات',
  audio: 'الصوت',
  images: 'الصور',
  publish: 'النشر',
};

const STATUS_LABEL: Record<string, string> = {
  none: 'لسه',
  draft: 'مسودة',
  approved: 'معتمد',
  generating: 'بيتولّد',
  ready: 'جاهز',
  failed: 'فشل',
  open: 'مفتوح',
  missing: 'ناقص',
  ok: 'تمام',
  estimated: 'متحسب',
  building: 'بيتبني',
  partial: 'جزئي',
  queued: 'في الطابور',
  published: 'منشور',
  hidden: 'مخفي',
};

const DIRECTION_LABEL: Record<string, string> = {
  يسأل: 'يسأل',
  يتسأل: 'يتسأل',
  يسمع: 'يسمع',
  none: 'مفيش متعلم',
};

type StageState = { status: string; stale?: boolean; stale_reason?: string };
type Stages = Record<Stage, StageState>;

type CastRow = { voice_key: string; role_eg: string; learner: boolean };
type BriefMoment = {
  id: string;
  eg: string;
  direction: string;
  must_say: string;
  bank_id: string | null;
};

type BriefDoc = {
  slug: string;
  number: number;
  type: 'story' | 'podcast';
  target_level: number;
  intro_eg: string;
  cast: CastRow[];
  places: string[];
  beats: string[];
  must_have_phrases: string[];
  moments: BriefMoment[];
  linked_episode: string | null;
  status: 'draft' | 'approved';
  admin_edited: boolean;
};

type BriefPayload = {
  brief: BriefDoc;
  stages: Stages;
  episode: { title_ar: string | null; title_tl: string | null } | null;
  moment_minimum: number;
};

type Voice = {
  key: string;
  who: string;
  gender: 'm' | 'f' | null;
  kind: string;
  approved: boolean;
};

type BankMoment = {
  id: string;
  place: string;
  eg: string;
  must_say: string;
  archived: boolean;
  used_in: number;
};

const LEVEL_LABEL: Record<number, string> = {
  1: 'سهل جداً',
  2: 'سهل',
  3: 'متوسط',
  4: 'أصعب شوية',
  5: 'صعب',
};

const GENDER_LABEL: Record<string, string> = { m: 'ذكر', f: 'أنثى' };

const inputClass =
  'w-full rounded-v2-row border border-v2-line bg-v2-card px-3 py-2 text-sm text-v2-ink';
const smallBtn =
  'rounded-v2-row border border-v2-line px-2 py-1 text-sm disabled:opacity-30';
const sectionClass =
  'space-y-4 rounded-v2-card border border-v2-line bg-v2-card p-4 shadow-v2-soft';
const labelClass = 'block space-y-1 text-sm text-v2-ink';

function arNum(n: number): string {
  return n.toLocaleString('ar-EG');
}

function chipClass(status: string, stale: boolean, current: boolean): string {
  const ring = current ? ' ring-2 ring-v2-primary' : '';
  if (stale || status === 'failed') {
    return `border-v2-attention bg-v2-attention/15 text-v2-ink${ring}`;
  }
  if (['approved', 'ready', 'ok', 'published'].includes(status)) {
    return `border-transparent bg-v2-primary-tint text-v2-primary${ring}`;
  }
  if (['generating', 'building', 'queued', 'estimated', 'partial'].includes(status)) {
    return `border-v2-note-border bg-v2-note text-v2-ink${ring}`;
  }
  return `border-v2-line bg-v2-card text-v2-ink-muted${ring}`;
}

function stageDone(stage: Stage, s: StageState | undefined): boolean {
  if (!s) return false;
  switch (stage) {
    case 'brief':
    case 'review':
      return s.status === 'approved';
    case 'script':
    case 'tokens':
    case 'audio':
    case 'images':
      return s.status === 'ready';
    case 'voices':
      return s.status === 'ok';
    case 'publish':
      return s.status === 'published';
  }
}

/** Current stage: the first one not yet done. */
function currentStage(stages: Stages): Stage {
  return STAGES.find((s) => !stageDone(s, stages[s])) ?? 'publish';
}

function nextMomentId(slug: string, moments: BriefMoment[]): string {
  const prefix = `${slug}_m`;
  let max = 0;
  for (const m of moments) {
    if (!m.id.startsWith(prefix)) continue;
    const n = Number(m.id.slice(prefix.length));
    if (Number.isInteger(n) && n > max) max = n;
  }
  return `${prefix}${max + 1}`;
}

/* ------------------------------------------------------------------ */
/* Small editors                                                       */
/* ------------------------------------------------------------------ */

function StringListEditor({
  items,
  onChange,
  addLabel,
  placeholder,
  reorder,
  ltr,
  multiline,
}: {
  items: string[];
  onChange: (next: string[]) => void;
  addLabel: string;
  placeholder?: string;
  reorder?: boolean;
  ltr?: boolean;
  multiline?: boolean;
}) {
  function move(i: number, d: -1 | 1) {
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  }
  return (
    <div className="space-y-2">
      {items.map((it, i) => (
        <div key={i} className="flex items-start gap-2">
          {reorder ? (
            <span className="pt-2 text-xs text-v2-ink-muted">{arNum(i + 1)}</span>
          ) : null}
          {multiline ? (
            <textarea
              rows={2}
              value={it}
              placeholder={placeholder}
              dir={ltr ? 'ltr' : undefined}
              onChange={(e) => onChange(items.map((x, k) => (k === i ? e.target.value : x)))}
              className={inputClass}
            />
          ) : (
            <input
              value={it}
              placeholder={placeholder}
              dir={ltr ? 'ltr' : undefined}
              onChange={(e) => onChange(items.map((x, k) => (k === i ? e.target.value : x)))}
              className={`${inputClass}${ltr ? ' font-[family-name:var(--font-v2-target)]' : ''}`}
            />
          )}
          {reorder ? (
            <>
              <button
                type="button"
                aria-label="فوق"
                disabled={i === 0}
                onClick={() => move(i, -1)}
                className={smallBtn}
              >
                ↑
              </button>
              <button
                type="button"
                aria-label="تحت"
                disabled={i === items.length - 1}
                onClick={() => move(i, 1)}
                className={smallBtn}
              >
                ↓
              </button>
            </>
          ) : null}
          <button
            type="button"
            aria-label="امسح"
            onClick={() => onChange(items.filter((_, k) => k !== i))}
            className={smallBtn}
          >
            ✕
          </button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...items, ''])} className={smallBtn}>
        + {addLabel}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main editor                                                         */
/* ------------------------------------------------------------------ */

export default function LibraryBriefEditor({ slug }: { slug: string }) {
  const [payload, setPayload] = useState<BriefPayload | null>(null);
  const [form, setForm] = useState<BriefDoc | null>(null);
  const [dirty, setDirty] = useState(false);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [bank, setBank] = useState<BankMoment[]>([]);
  const [pickPlace, setPickPlace] = useState<string>('');
  const [newMoment, setNewMoment] = useState<{ eg: string; place: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const applyPayload = useCallback((data: BriefPayload) => {
    setPayload(data);
    setForm(data.brief);
    setDirty(false);
    setPickPlace((p) => p || data.brief.places[0] || '');
  }, []);

  const refreshBrief = useCallback(async () => {
    const res = await fetch(`/api/v2/admin/library/episodes/${slug}/brief`);
    if (!res.ok) {
      setError(res.status === 404 ? 'الحلقة مش موجودة' : `تعذر التحميل (${res.status})`);
      return;
    }
    applyPayload((await res.json()) as BriefPayload);
  }, [slug, applyPayload]);

  useEffect(() => {
    void refreshBrief();
    void (async () => {
      const res = await fetch('/api/v2/admin/library/moments?archived=1');
      if (res.ok) setBank(((await res.json()) as { moments: BankMoment[] }).moments);
    })();
    void (async () => {
      const res = await fetch('/api/v2/admin/library/voices');
      if (res.ok) setVoices(((await res.json()) as { voices: Voice[] }).voices);
    })();
  }, [slug, applyPayload, refreshBrief]);

  const voiceByKey = useMemo(() => new Map(voices.map((v) => [v.key, v])), [voices]);
  const archivedIds = useMemo(
    () => new Set(bank.filter((m) => m.archived).map((m) => m.id)),
    [bank],
  );
  const bankPlaces = useMemo(
    () => [...new Set([...(form?.places ?? []), ...bank.map((m) => m.place)])].sort(),
    [bank, form?.places],
  );

  const update = useCallback((patch: Partial<BriefDoc>) => {
    setForm((f) => (f ? { ...f, ...patch } : f));
    setDirty(true);
    setMessage(null);
  }, []);

  if (error && !form) {
    return (
      <p className="rounded-v2-row border border-v2-attention bg-v2-attention/15 px-3 py-2 text-sm text-v2-ink">
        {error}
      </p>
    );
  }
  if (!form || !payload) {
    return <p className="text-sm text-v2-ink-muted">بيحمّل…</p>;
  }

  const stages = payload.stages;
  const approved = form.status === 'approved';
  const need = momentMinimum(form.target_level);
  const have = form.moments.length;
  const belowMinimum = have < need;
  const current = currentStage(stages);
  const inBrief = new Set(form.moments.map((m) => m.bank_id).filter(Boolean));
  const pickable = bank.filter(
    (m) => !m.archived && (pickPlace ? m.place === pickPlace : true) && !inBrief.has(m.id),
  );

  async function save(): Promise<boolean> {
    if (!form) return false;
    let confirmEdit = false;
    if (approved) {
      const ok = window.confirm(
        'الـ brief معتمد. لو عدّلته هيرجع مسودة والسكريبت هيتعلّم إنه محتاج يتعمل تاني. تكمّل؟',
      );
      if (!ok) return false;
      confirmEdit = true;
    }
    setBusy('save');
    setError(null);
    try {
      const res = await fetch(`/api/v2/admin/library/episodes/${slug}/brief`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brief: {
            type: form.type,
            target_level: form.target_level,
            intro_eg: form.intro_eg,
            cast: form.cast,
            places: form.places,
            beats: form.beats,
            must_have_phrases: form.must_have_phrases,
            moments: form.moments,
            linked_episode: form.linked_episode,
          },
          confirm_edit_approved: confirmEdit,
        }),
      });
      const data = (await res.json()) as BriefPayload & { error?: string };
      if (!res.ok) {
        setError(data.error ?? `تعذر الحفظ (${res.status})`);
        return false;
      }
      setPayload(data);
      setForm(data.brief);
      setDirty(false);
      setMessage(
        confirmEdit ? 'اتحفظ. الـ brief رجع مسودة والسكريبت محتاج يتعمل تاني.' : 'اتحفظ.',
      );
      return true;
    } finally {
      setBusy(null);
    }
  }

  async function approve() {
    if (dirty && !(await save())) return;
    setBusy('approve');
    setError(null);
    try {
      const res = await fetch(`/api/v2/admin/library/episodes/${slug}/brief/approve`, {
        method: 'POST',
      });
      const data = (await res.json()) as BriefPayload & { error?: string };
      if (!res.ok) {
        setError(data.error ?? `تعذر الاعتماد (${res.status})`);
        return;
      }
      setPayload(data);
      setForm(data.brief);
      setDirty(false);
      setMessage('الـ brief اتعتمد.');
    } finally {
      setBusy(null);
    }
  }

  function addFromBank(m: BankMoment) {
    if (!form) return;
    update({
      moments: [
        ...form.moments,
        {
          id: nextMomentId(form.slug, form.moments),
          eg: m.eg,
          direction: form.type === 'podcast' ? 'none' : 'يسأل',
          must_say: m.must_say,
          bank_id: m.id,
        },
      ],
    });
  }

  async function createNewMoment() {
    if (!form || !newMoment) return;
    const place = newMoment.place || pickPlace || form.places[0];
    if (!place || !newMoment.eg.trim()) {
      setError('اكتب وصف اللحظة واختار المكان');
      return;
    }
    setBusy('moment');
    setError(null);
    try {
      const res = await fetch('/api/v2/admin/library/moments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ place, eg: newMoment.eg }),
      });
      const data = (await res.json()) as { moment?: BankMoment; error?: string };
      if (!res.ok || !data.moment) {
        setError(data.error ?? `تعذر إضافة اللحظة (${res.status})`);
        return;
      }
      setBank((b) => [...b, data.moment!]);
      addFromBank(data.moment);
      setNewMoment(null);
    } finally {
      setBusy(null);
    }
  }

  function updateMoment(i: number, patch: Partial<BriefMoment>) {
    if (!form) return;
    update({ moments: form.moments.map((m, k) => (k === i ? { ...m, ...patch } : m)) });
  }

  function updateCast(i: number, patch: Partial<CastRow>) {
    if (!form) return;
    update({ cast: form.cast.map((c, k) => (k === i ? { ...c, ...patch } : c)) });
  }

  return (
    <div className="space-y-4">
      {/* Sticky stage bar */}
      <nav
        aria-label="مراحل الحلقة"
        className="sticky top-0 z-10 -mx-4 border-b border-v2-line bg-v2-paper/95 px-4 py-2 backdrop-blur"
      >
        <ol className="flex flex-wrap gap-1.5">
          {STAGES.map((s, i) => {
            const st = stages[s];
            return (
              <li key={s}>
                <a
                  href={`#stage-${s}`}
                  title={st.stale ? st.stale_reason : undefined}
                  aria-current={s === current ? 'step' : undefined}
                  className={`block rounded-v2-chip border px-2.5 py-1 text-xs ${chipClass(
                    st.status,
                    Boolean(st.stale),
                    s === current,
                  )}`}
                >
                  {arNum(i + 1)}. {STAGE_LABEL[s]} · {STATUS_LABEL[st.status] ?? st.status}
                  {st.stale ? ' ↻' : ''}
                </a>
              </li>
            );
          })}
        </ol>
      </nav>

      <header className="space-y-1">
        <h1 className="font-[family-name:var(--font-v2-display-ar)] text-2xl text-v2-ink">
          {payload.episode?.title_ar ?? `حلقة ${arNum(form.number)}`}
        </h1>
        {payload.episode?.title_tl ? (
          <p
            dir="ltr"
            className="text-start text-sm text-v2-ink-muted font-[family-name:var(--font-v2-target)]"
          >
            {payload.episode.title_tl}
          </p>
        ) : null}
      </header>

      {error ? (
        <p className="rounded-v2-row border border-v2-attention bg-v2-attention/15 px-3 py-2 text-sm text-v2-ink">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="rounded-v2-row border border-v2-line bg-v2-primary-tint px-3 py-2 text-sm text-v2-primary">
          {message}
        </p>
      ) : null}
      {stages.script.stale ? (
        <p className="rounded-v2-row border border-v2-attention bg-v2-attention/15 px-3 py-2 text-sm text-v2-ink">
          {stages.script.stale_reason ?? 'السكريبت محتاج يتعمل تاني'}
        </p>
      ) : null}

      {/* a. Brief */}
      <section id="stage-brief" className={sectionClass}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-medium text-v2-ink">١. الـ brief</h2>
          <span
            className={`rounded-v2-chip border px-2 py-0.5 text-xs ${chipClass(
              form.status,
              false,
              false,
            )}`}
          >
            {STATUS_LABEL[form.status]}
            {dirty ? ' · فيه تعديلات مش محفوظة' : ''}
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <label className={labelClass}>
            <span>الـ slug (ثابت بعد أول حفظ)</span>
            <input value={form.slug} readOnly dir="ltr" className={`${inputClass} bg-v2-paper`} />
          </label>
          <label className={labelClass}>
            <span>النوع</span>
            <select
              value={form.type}
              onChange={(e) => update({ type: e.target.value as BriefDoc['type'] })}
              className={inputClass}
            >
              <option value="story">قصة</option>
              <option value="podcast">بودكاست</option>
            </select>
          </label>
          <label className={labelClass}>
            <span>المستوى المستهدف</span>
            <select
              value={form.target_level}
              onChange={(e) => update({ target_level: Number(e.target.value) })}
              className={inputClass}
            >
              {[1, 2, 3, 4, 5].map((l) => (
                <option key={l} value={l}>
                  {l} · {LEVEL_LABEL[l]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className={labelClass}>
          <span>الموقف (intro_eg)</span>
          <textarea
            rows={2}
            value={form.intro_eg}
            onChange={(e) => update({ intro_eg: e.target.value })}
            className={inputClass}
          />
        </label>

        {/* Cast */}
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-v2-ink">الشخصيات (cast)</h3>
          {form.cast.map((c, i) => {
            const v = voiceByKey.get(c.voice_key);
            return (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <input
                  value={c.role_eg}
                  placeholder="الدور"
                  onChange={(e) => updateCast(i, { role_eg: e.target.value })}
                  className={`${inputClass} sm:w-48`}
                />
                <select
                  value={c.voice_key}
                  onChange={(e) => updateCast(i, { voice_key: e.target.value })}
                  className={`${inputClass} sm:w-64`}
                  dir="ltr"
                >
                  {!v && c.voice_key ? <option value={c.voice_key}>{c.voice_key} (مش في الـ registry)</option> : null}
                  <option value="" disabled>
                    اختار صوت
                  </option>
                  {voices.map((vv) => (
                    <option key={vv.key} value={vv.key}>
                      {vv.key}
                      {vv.gender ? ` · ${vv.gender === 'm' ? '♂' : '♀'}` : ''}
                      {vv.who ? ` · ${vv.who}` : ''}
                    </option>
                  ))}
                </select>
                <span className="text-xs text-v2-ink-muted">
                  {v?.gender ? GENDER_LABEL[v.gender] : '—'}
                </span>
                <label className="flex items-center gap-1 text-sm text-v2-ink">
                  <input
                    type="checkbox"
                    checked={c.learner}
                    onChange={(e) => updateCast(i, { learner: e.target.checked })}
                  />
                  المتعلم
                </label>
                <button
                  type="button"
                  aria-label="امسح"
                  onClick={() => update({ cast: form.cast.filter((_, k) => k !== i) })}
                  className={smallBtn}
                >
                  ✕
                </button>
              </div>
            );
          })}
          <button
            type="button"
            onClick={() =>
              update({ cast: [...form.cast, { voice_key: '', role_eg: '', learner: false }] })
            }
            className={smallBtn}
          >
            + شخصية
          </button>
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-medium text-v2-ink">الأماكن (عامة)</h3>
          <StringListEditor
            items={form.places}
            onChange={(places) => update({ places })}
            addLabel="مكان"
            ltr
          />
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-medium text-v2-ink">الـ beats بالترتيب</h3>
          <StringListEditor
            items={form.beats}
            onChange={(beats) => update({ beats })}
            addLabel="beat"
            reorder
            multiline
          />
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-medium text-v2-ink">جمل لازم تتقال (اختياري)</h3>
          <StringListEditor
            items={form.must_have_phrases}
            onChange={(must_have_phrases) => update({ must_have_phrases })}
            addLabel="جملة"
            ltr
          />
        </div>

        <label className={labelClass}>
          <span>حلقة مربوطة (اختياري)</span>
          <input
            value={form.linked_episode ?? ''}
            dir="ltr"
            placeholder="slug"
            onChange={(e) => update({ linked_episode: e.target.value || null })}
            className={`${inputClass} sm:w-64`}
          />
        </label>

        {/* Moments */}
        <div className="space-y-3 rounded-v2-row border border-v2-line p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-medium text-v2-ink">لحظات حقيقية</h3>
            <span
              className={`rounded-v2-chip border px-2 py-0.5 text-xs ${
                belowMinimum
                  ? 'border-v2-attention bg-v2-attention/15 text-v2-ink'
                  : 'border-transparent bg-v2-primary-tint text-v2-primary'
              }`}
            >
              {arNum(have)} من {arNum(need)} مطلوبين
            </span>
          </div>

          {form.moments.length === 0 ? (
            <p className="text-sm text-v2-ink-muted">لسه مفيش لحظات في الـ brief.</p>
          ) : null}
          {form.moments.map((m, i) => (
            <div key={m.id} className="space-y-2 rounded-v2-row bg-v2-paper p-2">
              <div className="flex items-start gap-2">
                <textarea
                  rows={2}
                  value={m.eg}
                  onChange={(e) => updateMoment(i, { eg: e.target.value })}
                  className={inputClass}
                />
                <button
                  type="button"
                  aria-label="شيل من الـ brief"
                  onClick={() => update({ moments: form.moments.filter((_, k) => k !== i) })}
                  className={smallBtn}
                >
                  ✕
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={m.direction}
                  onChange={(e) => updateMoment(i, { direction: e.target.value })}
                  className={`${inputClass} sm:w-40`}
                >
                  {MOMENT_DIRECTIONS.map((d) => (
                    <option key={d} value={d}>
                      {DIRECTION_LABEL[d]}
                    </option>
                  ))}
                </select>
                <input
                  value={m.must_say}
                  dir="ltr"
                  placeholder="must_say (اختياري)"
                  onChange={(e) => updateMoment(i, { must_say: e.target.value })}
                  className={`${inputClass} flex-1 font-[family-name:var(--font-v2-target)]`}
                />
                {m.bank_id && archivedIds.has(m.bank_id) ? (
                  <span className="rounded-v2-chip border border-v2-note-border bg-v2-note px-2 py-0.5 text-xs text-v2-ink">
                    متأرشفة من البنك
                  </span>
                ) : null}
              </div>
            </div>
          ))}

          <div className="space-y-2 border-t border-v2-line pt-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-v2-ink">من بنك اللحظات:</span>
              <select
                value={pickPlace}
                onChange={(e) => setPickPlace(e.target.value)}
                className={`${inputClass} sm:w-44`}
                dir="ltr"
              >
                <option value="">كل الأماكن</option>
                {bankPlaces.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() =>
                  setNewMoment((n) => (n ? null : { eg: '', place: pickPlace || form.places[0] || '' }))
                }
                className={smallBtn}
              >
                + لحظة جديدة
              </button>
            </div>
            {newMoment ? (
              <div className="flex flex-wrap items-start gap-2 rounded-v2-row border border-v2-line p-2">
                <select
                  value={newMoment.place}
                  onChange={(e) => setNewMoment({ ...newMoment, place: e.target.value })}
                  className={`${inputClass} sm:w-44`}
                  dir="ltr"
                >
                  <option value="" disabled>
                    المكان
                  </option>
                  {bankPlaces.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
                <input
                  value={newMoment.eg}
                  placeholder="وصف اللحظة بالمصري"
                  onChange={(e) => setNewMoment({ ...newMoment, eg: e.target.value })}
                  className={`${inputClass} flex-1`}
                />
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void createNewMoment()}
                  className="rounded-v2-chip bg-v2-action px-3 py-2 text-sm text-white disabled:opacity-50"
                >
                  ضيف للبنك والـ brief
                </button>
              </div>
            ) : null}
            {pickable.length === 0 ? (
              <p className="text-sm text-v2-ink-muted">مفيش لحظات تانية في المكان ده.</p>
            ) : (
              <ul className="max-h-60 space-y-1 overflow-y-auto">
                {pickable.map((m) => (
                  <li
                    key={m.id}
                    className="flex items-center justify-between gap-2 rounded-v2-row border border-v2-line px-2 py-1.5 text-sm"
                  >
                    <span className="text-v2-ink">{m.eg}</span>
                    <button type="button" onClick={() => addFromBank(m)} className={smallBtn}>
                      + ضيف
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-v2-line pt-3">
          <button
            type="button"
            disabled={busy !== null || !dirty}
            onClick={() => void save()}
            className="rounded-v2-chip border border-v2-action px-4 py-2 text-sm text-v2-action disabled:opacity-40"
          >
            {busy === 'save' ? 'بيحفظ…' : 'حفظ'}
          </button>
          <button
            type="button"
            disabled={busy !== null || belowMinimum || (approved && !dirty)}
            onClick={() => void approve()}
            title={
              belowMinimum
                ? `اللحظات ${arNum(have)} من ${arNum(need)} مطلوبين`
                : undefined
            }
            className="rounded-v2-chip bg-v2-action px-4 py-2 text-sm text-white disabled:opacity-40"
          >
            {busy === 'approve'
              ? 'بيعتمد…'
              : approved && !dirty
                ? 'الـ brief معتمد ✓'
                : 'اعتمد الـ brief'}
          </button>
          {belowMinimum ? (
            <span className="text-xs text-v2-ink-muted">
              محتاج {arNum(need - have)} لحظة كمان عشان تعتمد.
            </span>
          ) : null}
        </div>
      </section>

      <LibraryScriptSection
        slug={slug}
        briefApproved={approved}
        onStagesChange={() => void refreshBrief()}
      />

      <LibraryTokensSection
        slug={slug}
        scriptReady={stages.script.status === 'ready'}
        onStagesChange={() => void refreshBrief()}
      />

      <LibraryReviewSection
        slug={slug}
        tokensReady={stages.tokens.status === 'ready'}
        onStagesChange={() => void refreshBrief()}
      />

      <LibraryRemainingStages
        slug={slug}
        stages={stages}
        onStagesChange={() => void refreshBrief()}
      />
    </div>
  );
}
