'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';

type DayRow = {
  day: number;
  week: number;
  title_tl: string;
  title_ar: string;
  situation_eg: string;
  example_tl: string;
  is_story: boolean;
  can_generate: boolean;
  status: string | null;
  version: number | null;
  flagged: boolean;
  cost: { total_usd_estimate?: number } | null;
};

type PreviewPayload = {
  day: number;
  version: number;
  status: string;
  meta: unknown;
  lesson: {
    lesson: { id: string; situation?: { tl: string; eg: string }; pages: string[] };
    items: {
      id: string;
      type: string;
      tl?: string;
      ar?: string;
      say?: string;
    }[];
    pages: {
      id: string;
      preset?: string;
      mode?: string;
      title?: unknown;
      blocks?: unknown[];
    }[];
  };
};

type JobRow = {
  id: string;
  kind: string;
  page_index: number | null;
  page_id: string | null;
  status: string;
  input_hash: string | null;
  progress: {
    tokens?: {
      system?: number;
      input?: number;
      output?: number;
      example_tokens?: number;
    };
    over_budget?: boolean;
    timing?: { duration_ms?: number };
    current_prompt?: {
      label?: string;
      kind?: string;
      model?: string;
      provider?: string;
      started_at?: string;
    };
  } | null;
  error: string | null;
  depends_on: string[];
};

type GenerationProgress = {
  day: number;
  job: { id: string | null; status: string; version: number | null; error: string | null } | null;
  jobs?: JobRow[];
  version: number | null;
  text_ready: boolean;
  flagged: boolean;
  stale_count?: number;
  cost: { total_usd_estimate?: number } | null;
};

type BusyKind = 'generate' | 'warm' | 'status' | 'rerun' | 'item' | null;

function jobStatusMark(s: string | undefined): string {
  if (s === 'done') return '✓';
  if (s === 'failed') return '✗';
  if (s === 'stale') return '↻';
  if (s === 'running') return '…';
  if (s === 'queued') return '○';
  return '—';
}

export default function V2AdminPage() {
  const [days, setDays] = useState<DayRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busyDay, setBusyDay] = useState<number | null>(null);
  const [busyKind, setBusyKind] = useState<BusyKind>(null);
  /** Day whose DAG poll is in flight (does not lock Rerun). */
  const [pollingDay, setPollingDay] = useState<number | null>(null);
  const [preview, setPreview] = useState<PreviewPayload | null>(null);
  const [progress, setProgress] = useState<GenerationProgress | null>(null);
  const [jobGraphDay, setJobGraphDay] = useState<number | null>(null);
  const [jobGraph, setJobGraph] = useState<JobRow[]>([]);
  const [editItemId, setEditItemId] = useState<string>('');
  const [editField, setEditField] = useState<'tl' | 'ar' | 'say'>('ar');
  const [editValue, setEditValue] = useState('');
  const [mounted, setMounted] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const pollAbort = useRef(false);

  const refresh = useCallback(async () => {
    setError(null);
    setLoadingList(true);
    try {
      const res = await fetch('/api/v2/admin/lessons');
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? `HTTP ${res.status}`);
        setDays([]);
        return;
      }
      const data = (await res.json()) as { days: DayRow[]; warning?: string };
      setDays(Array.isArray(data.days) ? data.days : []);
      if (data.warning) {
        setMessage(`Loaded plan; Mongo: ${data.warning}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load days');
      setDays([]);
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    setMounted(true);
    void refresh();
  }, [refresh]);

  useEffect(() => {
    return () => {
      pollAbort.current = true;
    };
  }, []);

  async function loadJobGraph(day: number) {
    const res = await fetch(`/api/v2/admin/lessons/${day}/generation`);
    const body = (await res.json()) as GenerationProgress & { error?: string };
    if (!res.ok) {
      setError(body.error ?? `Job graph failed (${res.status})`);
      return;
    }
    setJobGraphDay(day);
    setJobGraph(body.jobs ?? []);
    setProgress(body);
  }

  async function pollGeneration(day: number, jobId: string) {
    pollAbort.current = false;
    setPollingDay(day);
    const deadline = Date.now() + 45 * 60 * 1000;
    try {
      while (!pollAbort.current && Date.now() < deadline) {
        const res = await fetch(
          `/api/v2/admin/lessons/${day}/generation?jobId=${encodeURIComponent(jobId)}`,
        );
        const body = (await res.json()) as GenerationProgress & { error?: string };
        if (!res.ok) {
          setError(body.error ?? `Poll failed (${res.status})`);
          return;
        }
        setProgress(body);
        setJobGraphDay(day);
        setJobGraph(body.jobs ?? []);
        const status = body.job?.status;
        if (status === 'done') {
          setMessage(
            `Day ${day} v${body.version} text ready${body.flagged ? ' (flagged)' : ''}${
              body.cost?.total_usd_estimate != null
                ? ` · ~$${body.cost.total_usd_estimate}`
                : ''
            }`,
          );
          await refresh();
          return;
        }
        if (status === 'failed') {
          setError(body.job?.error ?? `Generation failed for day ${day}`);
          await refresh();
          return;
        }
        if (status === 'stale') {
          setMessage(
            `Day ${day} v${body.version} has stale jobs (${body.stale_count ?? '?'}) — use Rerun stale`,
          );
          await refresh();
          return;
        }
        await new Promise((r) => setTimeout(r, 1500));
      }
      if (!pollAbort.current) {
        setError(`Timed out waiting for day ${day}.`);
      }
    } finally {
      setPollingDay(null);
    }
  }

  async function generate(day: number) {
    setBusyDay(day);
    setBusyKind('generate');
    setMessage(null);
    setError(null);
    setProgress(null);
    try {
      const res = await fetch(`/api/v2/admin/generate/lesson/${day}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const body = (await res.json()) as {
        error?: string;
        jobId?: string;
        version?: number;
        started?: boolean;
        message?: string;
      };
      if (!res.ok) {
        setError(body.error ?? `Generate failed (${res.status})`);
        return;
      }
      if (!body.jobId) {
        setError('Generate returned no jobId');
        return;
      }
      setMessage(`Day ${day} v${body.version} · DAG generating…`);
      // Unlock Rerun immediately; poll continues in background.
      void pollGeneration(day, body.jobId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyDay(null);
      setBusyKind(null);
    }
  }

  async function warmAudio(day: number) {
    setBusyDay(day);
    setBusyKind('warm');
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(`/api/v2/admin/lessons/${day}/warm-audio`, {
        method: 'POST',
      });
      const body = (await res.json()) as {
        error?: string;
        cached?: number;
        skipped?: number;
        failed?: number;
      };
      if (!res.ok) {
        setError(body.error ?? `Warm audio failed (${res.status})`);
        return;
      }
      setMessage(
        `Day ${day} audio · cached ${body.cached ?? 0} · skipped ${body.skipped ?? 0} · failed ${body.failed ?? 0}`,
      );
    } finally {
      setBusyDay(null);
      setBusyKind(null);
    }
  }

  async function setStatus(day: number, status: 'reviewed' | 'published' | 'draft') {
    setBusyDay(day);
    setBusyKind('status');
    setError(null);
    try {
      const res = await fetch(`/api/v2/admin/lessons/${day}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const body = (await res.json()) as {
        error?: string;
        conflicts?: string[];
        registry?: { written: number };
      };
      if (!res.ok) {
        setError(
          body.error ??
            (body.conflicts?.length
              ? `Registry conflicts: ${body.conflicts.join('; ')}`
              : 'Status update failed'),
        );
        return;
      }
      setMessage(
        `Day ${day} → ${status}${
          body.registry ? ` · registry +${body.registry.written}` : ''
        }`,
      );
      await refresh();
    } finally {
      setBusyDay(null);
      setBusyKind(null);
    }
  }

  async function rerunJob(jobId: string) {
    setBusyKind('rerun');
    setError(null);
    try {
      const res = await fetch(`/api/v2/admin/jobs/${jobId}/rerun`, {
        method: 'POST',
      });
      const body = (await res.json()) as {
        error?: string;
        job?: { day: number; id: string };
      };
      if (!res.ok) {
        setError(body.error ?? 'Rerun failed');
        return;
      }
      setMessage(`Reran job ${jobId}`);
      if (body.job?.day) {
        void pollGeneration(body.job.day, body.job.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyKind(null);
    }
  }

  async function rerunStale(day: number) {
    setBusyDay(day);
    setBusyKind('rerun');
    setError(null);
    try {
      const res = await fetch(`/api/v2/admin/lessons/${day}/rerun-stale`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const body = (await res.json()) as {
        error?: string;
        requeued?: number;
        version?: number;
      };
      if (!res.ok) {
        setError(body.error ?? 'Rerun stale failed');
        return;
      }
      setMessage(`Day ${day} requeued ${body.requeued ?? 0} stale jobs`);
      await loadJobGraph(day);
      if ((body.requeued ?? 0) > 0) {
        const gen = await fetch(`/api/v2/admin/lessons/${day}/generation`);
        const g = (await gen.json()) as GenerationProgress;
        const seed = g.jobs?.[0]?.id;
        if (seed) await pollGeneration(day, seed);
      }
    } finally {
      setBusyDay(null);
      setBusyKind(null);
    }
  }

  async function saveItemEdit(day: number, version: number) {
    if (!editItemId || !editValue) {
      setError('Pick an item and enter a value');
      return;
    }
    setBusyKind('item');
    setError(null);
    try {
      const res = await fetch(
        `/api/v2/admin/lessons/${day}/items/${encodeURIComponent(editItemId)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            version,
            patch: { [editField]: editValue },
          }),
        },
      );
      const body = (await res.json()) as {
        error?: string;
        stale_job_ids?: string[];
      };
      if (!res.ok) {
        setError(body.error ?? 'Item edit failed');
        return;
      }
      setMessage(
        `Saved ${editItemId}.${editField} · stale jobs: ${(body.stale_job_ids ?? []).length}`,
      );
      setEditValue('');
      await openPreview(day);
      await loadJobGraph(day);
    } finally {
      setBusyKind(null);
    }
  }

  async function openPreview(day: number) {
    setError(null);
    const res = await fetch(`/api/v2/admin/lessons/${day}`);
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? 'Preview failed');
      return;
    }
    setPreview((await res.json()) as PreviewPayload);
  }

  const anyBusy = busyDay != null || busyKind === 'rerun' || busyKind === 'item';

  return (
    <main className="flex flex-1 flex-col gap-5 overflow-y-auto px-4 py-6 pb-28">
      <header className="space-y-1">
        <h1 className="font-[family-name:var(--font-v2-display-ar)] text-3xl text-v2-ink">
          v2-admin
        </h1>
        <p className="mt-1 text-sm text-v2-muted">
          <Link href="/v2-admin/quality">Quality runs</Link>
          {' · '}
          <Link href="/v2-admin/reports">Reports</Link>
          {' · '}
          open a day for the full job graph / timeline
        </p>
        <p className="font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink-muted">
          توليد مرتبط · وظائف · مراجعة · نشر — V2_ENABLED=true
        </p>
      </header>

      {mounted ? (
        <p
          className="rounded-v2-row border border-v2-rule bg-v2-card px-3 py-2 text-xs text-v2-ink-muted"
          dir="ltr"
        >
          Linked jobs: items → outline → pages ∥ questions ∥ micro ∥ daily_use →
          continuity → assemble. Images off by default. Warm audio separately.
        </p>
      ) : null}

      {pollingDay != null ? (
        <div className="space-y-2 rounded-v2-row border border-sky-200 bg-sky-50 px-3 py-3 text-sm text-sky-950">
          <div className="font-medium">Day {pollingDay} generating…</div>
          <div className="font-[family-name:var(--font-v2-ui)] text-xs" dir="ltr">
            {progress?.job?.status ?? '…'}
            {progress?.stale_count ? ` · stale ${progress.stale_count}` : ''}
            {(() => {
              const running = jobGraph.find((j) => j.status === 'running');
              if (running) {
                const cp = running.progress?.current_prompt;
                const label = `${running.kind}${running.page_id ? `:${running.page_id}` : ''}`;
                return ` · ${label}${cp?.label ? ` · prompt ${cp.label}` : ''}${
                  cp?.model ? ` (${cp.model})` : ''
                }`;
              }
              const queued = jobGraph.find((j) => j.status === 'queued');
              if (queued) {
                return ` · waiting: next queued ${queued.kind}${
                  queued.page_id ? `:${queued.page_id}` : ''
                }`;
              }
              return null;
            })()}
          </div>
        </div>
      ) : null}
      {busyKind === 'warm' && busyDay != null ? (
        <p className="rounded-v2-row border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-950">
          Day {busyDay} warming audio…
        </p>
      ) : null}

      {error ? (
        <div className="rounded-v2-row border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <div className="font-medium">Error</div>
          <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words font-[family-name:var(--font-v2-ui)] text-xs leading-relaxed">
            {error}
          </pre>
        </div>
      ) : null}
      {message ? (
        <p className="rounded-v2-row border border-v2-rule bg-v2-card px-3 py-2 text-sm text-v2-ink">
          {message}
        </p>
      ) : null}

      {loadingList ? (
        <p className="text-sm text-v2-ink-muted">Loading days…</p>
      ) : days.length === 0 && !error ? (
        <p className="rounded-v2-row border border-v2-rule bg-v2-card px-3 py-3 text-sm text-v2-ink-muted">
          No days in plan. Check content/v2/plan/pt-PT.days.json
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {days.map((row) => {
            const rowBusy = busyDay === row.day;
            return (
              <li
                key={row.day}
                className="rounded-v2-row border border-v2-rule bg-v2-card px-3 py-3 text-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 space-y-0.5">
                    <div className="font-[family-name:var(--font-v2-ui)] font-semibold">
                      <Link
                        href={`/v2-admin/lessons/${row.day}`}
                        className="underline-offset-2 hover:underline"
                      >
                        Day {row.day}
                      </Link>
                      {row.is_story ? (
                        <span className="ml-1 text-xs font-normal text-v2-ink-muted">
                          story
                        </span>
                      ) : null}
                    </div>
                    {row.title_tl ? (
                      <div className="truncate" dir="ltr">
                        {row.title_tl}
                        {row.title_ar ? (
                          <span className="ml-1 font-[family-name:var(--font-v2-arabic)] font-normal text-v2-ink-muted">
                            · {row.title_ar}
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                    {row.situation_eg ? (
                      <div className="font-[family-name:var(--font-v2-arabic)] text-v2-ink-muted">
                        {row.situation_eg}
                      </div>
                    ) : null}
                  </div>
                  <div className="shrink-0 text-right text-xs text-v2-ink-muted">
                    <div>{row.status ?? '—'}</div>
                    {row.version != null ? <div>v{row.version}</div> : null}
                    {row.flagged ? (
                      <div className="text-amber-700">flagged</div>
                    ) : null}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={!row.can_generate || anyBusy}
                    onClick={() => void generate(row.day)}
                    className="rounded-v2-chip bg-v2-ink px-2 py-1 text-xs text-white disabled:opacity-40"
                  >
                    {rowBusy && busyKind === 'generate' ? 'Generating…' : 'Generate'}
                  </button>
                  {row.status ? (
                    <>
                      <button
                        type="button"
                        disabled={anyBusy}
                        onClick={() => void loadJobGraph(row.day)}
                        className="rounded-v2-chip border border-v2-rule px-2 py-1 text-xs disabled:opacity-40"
                      >
                        Jobs
                      </button>
                      <button
                        type="button"
                        disabled={anyBusy}
                        onClick={() => void rerunStale(row.day)}
                        className="rounded-v2-chip border border-v2-rule px-2 py-1 text-xs disabled:opacity-40"
                      >
                        Rerun stale
                      </button>
                      <button
                        type="button"
                        disabled={anyBusy}
                        onClick={() => void warmAudio(row.day)}
                        className="rounded-v2-chip border border-v2-rule px-2 py-1 text-xs disabled:opacity-40"
                      >
                        {rowBusy && busyKind === 'warm' ? 'Warming…' : 'Warm audio'}
                      </button>
                      <button
                        type="button"
                        disabled={anyBusy}
                        onClick={() => void openPreview(row.day)}
                        className="rounded-v2-chip border border-v2-rule px-2 py-1 text-xs disabled:opacity-40"
                      >
                        Preview
                      </button>
                      {row.status === 'draft' ? (
                        <button
                          type="button"
                          disabled={anyBusy}
                          onClick={() => void setStatus(row.day, 'reviewed')}
                          className="rounded-v2-chip border border-v2-rule px-2 py-1 text-xs disabled:opacity-40"
                        >
                          Review
                        </button>
                      ) : null}
                      {row.status === 'reviewed' || row.status === 'draft' ? (
                        <button
                          type="button"
                          disabled={anyBusy}
                          onClick={() => void setStatus(row.day, 'published')}
                          className="rounded-v2-chip border border-v2-rule px-2 py-1 text-xs disabled:opacity-40"
                        >
                          Publish
                        </button>
                      ) : null}
                      <Link
                        href={`/day/${row.day}`}
                        className="rounded-v2-chip border border-v2-rule px-2 py-1 text-xs text-v2-ink-muted"
                      >
                        /day/{row.day}
                      </Link>
                    </>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {jobGraphDay != null && jobGraph.length > 0 ? (
        <section className="space-y-3 rounded-v2-row border border-v2-rule bg-v2-card p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-[family-name:var(--font-v2-ui)] text-lg font-semibold">
              Job graph · day {jobGraphDay}
              {progress?.job?.status ? (
                <span className="ml-2 text-sm font-normal text-v2-ink-muted">
                  · {progress.job.status}
                </span>
              ) : null}
            </h2>
            <button
              type="button"
              onClick={() => {
                setJobGraphDay(null);
                setJobGraph([]);
              }}
              className="text-sm text-v2-ink-muted"
            >
              Close
            </button>
          </div>
          <ul className="space-y-1.5 text-xs" dir="ltr">
            {jobGraph.map((j) => {
              const t = j.progress?.tokens;
              const cp = j.progress?.current_prompt;
              return (
                <li
                  key={j.id}
                  className="flex flex-wrap items-center gap-2 rounded border border-v2-rule/60 px-2 py-1.5"
                >
                  <span className="w-4">{jobStatusMark(j.status)}</span>
                  <span className="min-w-[7rem] font-medium">
                    {j.kind}
                    {j.page_id ? `:${j.page_id}` : ''}
                  </span>
                  <span className="text-v2-ink-muted">{j.status}</span>
                  {cp?.label ? (
                    <span className="text-sky-800">
                      prompt {cp.label}
                      {cp.model ? ` · ${cp.model}` : ''}
                    </span>
                  ) : null}
                  {t ? (
                    <span className="text-v2-ink-muted">
                      tok {t.system ?? '—'}/{t.input ?? '—'}/{t.output ?? '—'}
                      {t.example_tokens != null ? ` ex=${t.example_tokens}` : ''}
                      {j.progress?.over_budget ? ' OVER' : ''}
                    </span>
                  ) : null}
                  {j.progress?.timing?.duration_ms != null ? (
                    <span className="text-v2-ink-muted">
                      {j.progress.timing.duration_ms}ms
                    </span>
                  ) : null}
                  {j.error ? (
                    <span className="w-full basis-full whitespace-pre-wrap break-words text-amber-900">
                      {j.error}
                    </span>
                  ) : null}
                  <button
                    type="button"
                    disabled={anyBusy}
                    onClick={() => void rerunJob(j.id)}
                    className="ml-auto rounded border border-v2-rule px-1.5 py-0.5 disabled:opacity-40"
                  >
                    Rerun
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {preview ? (
        <section className="space-y-3 rounded-v2-row border border-v2-rule bg-v2-card p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-[family-name:var(--font-v2-ui)] text-lg font-semibold">
              Preview · day {preview.day} · v{preview.version} · {preview.status}
            </h2>
            <button
              type="button"
              onClick={() => setPreview(null)}
              className="text-sm text-v2-ink-muted"
            >
              Close
            </button>
          </div>
          <p className="font-[family-name:var(--font-v2-arabic)] text-sm">
            {preview.lesson.lesson.situation?.eg}
          </p>
          <p className="text-xs text-v2-ink-muted">
            {preview.lesson.items.length} items · {preview.lesson.pages.length} pages
          </p>

          <div className="space-y-2 rounded border border-v2-rule/70 p-3" dir="ltr">
            <div className="text-xs font-medium text-v2-ink-muted">Edit item → stale dependents</div>
            <div className="flex flex-wrap gap-2 text-xs">
              <select
                value={editItemId}
                onChange={(e) => setEditItemId(e.target.value)}
                className="rounded border border-v2-rule bg-white px-2 py-1"
              >
                <option value="">item…</option>
                {preview.lesson.items.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.id}
                  </option>
                ))}
              </select>
              <select
                value={editField}
                onChange={(e) => setEditField(e.target.value as 'tl' | 'ar' | 'say')}
                className="rounded border border-v2-rule bg-white px-2 py-1"
              >
                <option value="ar">ar</option>
                <option value="say">say</option>
                <option value="tl">tl</option>
              </select>
              <input
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                placeholder="new value"
                className="min-w-[10rem] flex-1 rounded border border-v2-rule bg-white px-2 py-1"
              />
              <button
                type="button"
                disabled={anyBusy}
                onClick={() => void saveItemEdit(preview.day, preview.version)}
                className="rounded-v2-chip bg-v2-ink px-2 py-1 text-white disabled:opacity-40"
              >
                Save
              </button>
            </div>
          </div>

          <ul className="space-y-2">
            {preview.lesson.pages.map((p) => (
              <li
                key={p.id}
                className="rounded-v2-row border border-v2-rule/70 px-3 py-2 text-sm"
              >
                <div className="font-medium" dir="ltr">
                  {p.id} · {p.preset} · {p.mode}
                </div>
                <div className="text-xs text-v2-ink-muted">
                  {(p.blocks?.length ?? 0)} blocks
                </div>
              </li>
            ))}
          </ul>
          <details className="text-xs">
            <summary className="cursor-pointer text-v2-ink-muted">Raw JSON</summary>
            <pre
              className="mt-2 max-h-80 overflow-auto rounded bg-black/5 p-2"
              dir="ltr"
            >
              {JSON.stringify(preview.lesson, null, 2)}
            </pre>
          </details>
        </section>
      ) : null}
    </main>
  );
}
