'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

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

const STAGE_LABEL: Record<Stage, string> = {
  brief: 'ملخص',
  script: 'سكريبت',
  tokens: 'كلمات',
  review: 'مراجعة',
  voices: 'أصوات',
  audio: 'صوت',
  images: 'صور',
  publish: 'نشر',
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

type Row = {
  slug: string;
  number: number | null;
  title_tl: string | null;
  title_ar: string | null;
  intro_eg: string | null;
  type: 'story' | 'podcast';
  target_level: number;
  measured_level: number | null;
  sort_order: number;
  stages: Record<Stage, { status: string; stale: boolean }>;
  bucket: string | null;
  warnings: number;
  total_cost_usd: number;
  updated_at: string | null;
};

type ImportSummary = {
  briefs_created: number;
  briefs_updated: number;
  briefs_skipped: { slug: string; reason: string }[];
  briefs_unchanged: number;
  voices_created: number;
  moments_created: number;
  episodes_created: number;
};

const LEVEL_LABEL: Record<number, string> = {
  1: 'سهل جداً',
  2: 'سهل',
  3: 'متوسط',
  4: 'أصعب شوية',
  5: 'صعب',
};

const BUCKETS: { value: string; label: string }[] = [
  { value: '', label: 'كل المراحل' },
  { value: 'needs_review', label: 'محتاج مراجعة' },
  { value: 'needs_audio', label: 'محتاج صوت' },
  { value: 'ready_to_publish', label: 'جاهز للنشر' },
  { value: 'published', label: 'منشور' },
];

function chipClass(status: string, stale: boolean): string {
  if (stale || status === 'failed') {
    return 'border-v2-attention bg-v2-attention/15 text-v2-ink';
  }
  if (['approved', 'ready', 'ok', 'published'].includes(status)) {
    return 'border-transparent bg-v2-primary-tint text-v2-primary';
  }
  if (['generating', 'building', 'queued', 'estimated', 'partial'].includes(status)) {
    return 'border-v2-note-border bg-v2-note text-v2-ink';
  }
  return 'border-v2-line bg-v2-card text-v2-ink-muted';
}

const selectClass =
  'rounded-v2-row border border-v2-line bg-v2-card px-3 py-2 text-sm text-v2-ink';

export default function LibraryAdminPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [type, setType] = useState('');
  const [level, setLevel] = useState('');
  const [bucket, setBucket] = useState('');

  const load = useCallback(async () => {
    const res = await fetch('/api/v2/admin/library/episodes');
    if (!res.ok) {
      setError(`تعذر التحميل (${res.status})`);
      setLoading(false);
      return;
    }
    const json = (await res.json()) as { episodes: Row[] };
    setError(null);
    setRows(json.episodes);
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await fetch('/api/v2/admin/library/episodes');
      if (cancelled) return;
      if (!res.ok) {
        setError(`تعذر التحميل (${res.status})`);
      } else {
        const json = (await res.json()) as { episodes: Row[] };
        if (!cancelled) setRows(json.episodes);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const visible = useMemo(
    () =>
      rows.filter(
        (r) =>
          (!type || r.type === type) &&
          (!level || r.target_level === Number(level)) &&
          (!bucket || r.bucket === bucket),
      ),
    [rows, type, level, bucket],
  );

  async function runImport() {
    setBusy('import');
    setError(null);
    setMessage(null);
    try {
      const res = await fetch('/api/v2/admin/library/import', { method: 'POST' });
      const json = (await res.json()) as { summary?: ImportSummary; error?: string };
      if (!res.ok || !json.summary) throw new Error(json.error ?? `HTTP ${res.status}`);
      const s = json.summary;
      const parts = [
        `جديد ${s.briefs_created}`,
        `اتحدّث ${s.briefs_updated}`,
        `موجود ${s.briefs_unchanged}`,
      ];
      if (s.briefs_skipped.length) {
        parts.push(`موجود، اتساب ${s.briefs_skipped.length}`);
      }
      setMessage(parts.join(' · '));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function move(row: Row, dir: -1 | 1) {
    const sameLevel = rows
      .filter((r) => r.target_level === row.target_level)
      .sort((a, b) => a.sort_order - b.sort_order);
    const i = sameLevel.findIndex((r) => r.slug === row.slug);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= sameLevel.length) return;
    const slugs = sameLevel.map((r) => r.slug);
    [slugs[i], slugs[j]] = [slugs[j], slugs[i]];
    setBusy(row.slug);
    setError(null);
    try {
      const res = await fetch('/api/v2/admin/library/episodes/reorder', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level: row.target_level, slugs }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const levelCounts = useMemo(() => {
    const m = new Map<number, number>();
    for (const r of rows) m.set(r.target_level, (m.get(r.target_level) ?? 0) + 1);
    return m;
  }, [rows]);

  return (
    <main
      dir="rtl"
      className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-5 overflow-y-auto px-4 py-6 pb-28 font-[family-name:var(--font-v2-arabic)]"
    >
      <header className="space-y-2">
        <p className="text-sm text-v2-ink-muted">
          <Link href="/v2-admin" className="underline">
            v2-admin
          </Link>
          {' · '}المكتبة
        </p>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-[family-name:var(--font-v2-display-ar)] text-3xl text-v2-ink">
            المكتبة
          </h1>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/v2-admin/library/moments"
              className="text-sm text-v2-ink-muted underline"
            >
              بنك اللحظات
            </Link>
            <Link
              href="/v2-admin/library/voices"
              className="text-sm text-v2-ink-muted underline"
            >
              الأصوات
            </Link>
            <Link
              href="/v2-admin/library/cost"
              className="text-sm text-v2-ink-muted underline"
            >
              التكلفة
            </Link>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void runImport()}
              className="rounded-v2-chip bg-v2-action px-4 py-2 text-sm text-white disabled:opacity-50"
            >
              {busy === 'import' ? 'بيستورد…' : 'استورد من 14b'}
            </button>
          </div>
        </div>
        <p className="text-sm text-v2-ink-muted">
          حلقات القصص والبودكاست مرتبة من الأسهل للأصعب. الترتيب جوه المستوى بإيدك.
        </p>
      </header>

      {error ? (
        <p className="rounded-v2-row border border-v2-attention bg-v2-attention/15 px-3 py-2 text-sm text-v2-ink">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="rounded-v2-row bg-v2-note px-3 py-2 text-sm text-v2-ink">
          {message}
        </p>
      ) : null}

      <section className="flex flex-wrap gap-3" aria-label="فلاتر">
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className={selectClass}
          aria-label="النوع"
        >
          <option value="">كل الأنواع</option>
          <option value="story">قصص</option>
          <option value="podcast">بودكاست</option>
        </select>
        <select
          value={level}
          onChange={(e) => setLevel(e.target.value)}
          className={selectClass}
          aria-label="المستوى"
        >
          <option value="">كل المستويات</option>
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              {n} · {LEVEL_LABEL[n]}
            </option>
          ))}
        </select>
        <select
          value={bucket}
          onChange={(e) => setBucket(e.target.value)}
          className={selectClass}
          aria-label="المرحلة"
        >
          {BUCKETS.map((b) => (
            <option key={b.value} value={b.value}>
              {b.label}
            </option>
          ))}
        </select>
      </section>

      <div className="overflow-x-auto rounded-v2-card border border-v2-line bg-v2-card shadow-v2-soft">
        <table className="w-full min-w-[960px] text-sm text-v2-ink">
          <thead className="bg-v2-paper-deep/40 text-start text-xs text-v2-ink-muted">
            <tr>
              <th className="px-3 py-3 text-start">ترتيب</th>
              <th className="px-3 py-3 text-start">#</th>
              <th className="px-3 py-3 text-start">الحلقة</th>
              <th className="px-3 py-3 text-start">النوع</th>
              <th className="px-3 py-3 text-start">المستوى</th>
              <th className="px-3 py-3 text-start">المراحل</th>
              <th className="px-3 py-3 text-start">تحذيرات</th>
              <th className="px-3 py-3 text-start">التكلفة</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-v2-ink-muted">
                  بيحمّل…
                </td>
              </tr>
            ) : visible.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-v2-ink-muted">
                  {rows.length === 0
                    ? 'مفيش حلقات لسه. اضغط «استورد من 14b».'
                    : 'مفيش حلقات بالفلاتر دي.'}
                </td>
              </tr>
            ) : (
              visible.map((r, idx) => {
                const siblings = rows
                  .filter((x) => x.target_level === r.target_level)
                  .sort((a, b) => a.sort_order - b.sort_order);
                const pos = siblings.findIndex((x) => x.slug === r.slug);
                const firstOfLevel =
                  idx === 0 || visible[idx - 1].target_level !== r.target_level;
                return (
                  <tr
                    key={r.slug}
                    className={`border-t border-v2-line ${
                      firstOfLevel ? 'border-t-2 border-t-v2-sand' : ''
                    }`}
                  >
                    <td className="px-3 py-3 whitespace-nowrap">
                      <button
                        type="button"
                        aria-label="فوق"
                        disabled={busy !== null || pos <= 0}
                        onClick={() => void move(r, -1)}
                        className="rounded-v2-row border border-v2-line px-2 py-1 disabled:opacity-30"
                      >
                        ↑
                      </button>{' '}
                      <button
                        type="button"
                        aria-label="تحت"
                        disabled={
                          busy !== null ||
                          pos < 0 ||
                          pos >= (levelCounts.get(r.target_level) ?? 0) - 1
                        }
                        onClick={() => void move(r, 1)}
                        className="rounded-v2-row border border-v2-line px-2 py-1 disabled:opacity-30"
                      >
                        ↓
                      </button>
                    </td>
                    <td className="px-3 py-3 text-v2-ink-muted">{r.number ?? '—'}</td>
                    <td className="px-3 py-3">
                      <Link
                        href={`/v2-admin/library/${r.slug}`}
                        className="font-medium underline"
                      >
                        {r.title_ar ?? r.slug}
                      </Link>
                      <div
                        dir="ltr"
                        className="text-start text-xs text-v2-ink-muted font-[family-name:var(--font-v2-target)]"
                      >
                        {r.title_tl ?? r.slug}
                      </div>
                    </td>
                    <td className="px-3 py-3">{r.type === 'story' ? 'قصة' : 'بودكاست'}</td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      {r.target_level} · {LEVEL_LABEL[r.target_level]}
                      {r.measured_level != null ? (
                        <span className="text-v2-ink-muted">
                          {' '}
                          (مقاس {r.measured_level})
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1">
                        {STAGES.map((s) => {
                          const st = r.stages[s];
                          return (
                            <span
                              key={s}
                              title={st.stale ? 'محتاج يتعمل تاني' : undefined}
                              className={`rounded-v2-chip border px-2 py-0.5 text-xs ${chipClass(
                                st.status,
                                st.stale,
                              )}`}
                            >
                              {STAGE_LABEL[s]} · {STATUS_LABEL[st.status] ?? st.status}
                              {st.stale ? ' ↻' : ''}
                            </span>
                          );
                        })}
                      </div>
                    </td>
                    <td className="px-3 py-3">{r.warnings || '—'}</td>
                    <td className="px-3 py-3 whitespace-nowrap" dir="ltr">
                      {r.total_cost_usd ? `$${r.total_cost_usd.toFixed(2)}` : '—'}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
