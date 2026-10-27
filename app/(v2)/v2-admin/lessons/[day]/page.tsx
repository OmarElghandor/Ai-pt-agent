'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ReportErrorButton } from '@/components/v2';

type JobRow = {
  id: string;
  kind: string;
  page_index: number | null;
  page_id: string | null;
  status: string;
  depends_on: string[];
  consumers?: string[];
  provider?: string | null;
  model?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  input?: unknown;
  output?: unknown;
  handoff?: unknown;
  tokens?: {
    system?: number;
    input?: number;
    output?: number;
    example_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  } | null;
  over_budget?: boolean;
  usd_estimate?: number | null;
  issues?: unknown;
  attempts?: unknown[];
  error?: string | null;
  progress?: {
    current_prompt?: {
      label?: string;
      kind?: string;
      model?: string;
      provider?: string;
      started_at?: string;
    };
  } | null;
};

type GenPayload = {
  day: number;
  plan: { title_tl: string; title_ar: string; situation_eg: string; week: number };
  version: number | null;
  lesson_status: string | null;
  flagged: boolean;
  text_ready: boolean;
  stale_count: number;
  total_usd_estimate: number;
  total_duration_ms: number;
  wall_started_at: string | null;
  wall_finished_at: string | null;
  jobs: JobRow[];
  items: {
    id: string;
    type: string;
    tl?: string;
    ar?: string;
    say?: string;
    extra?: boolean;
  }[];
  questions: {
    id: string;
    type?: string;
    skill?: string;
    tests?: string[];
  }[];
  budgets: Record<string, { system: number; input: number; output: number }>;
  handoffs: unknown;
  job: { status: string; error: string | null };
};

type ItemBadge = 'core' | 'extra' | 'recycle';

function itemBadge(
  item: { id: string; extra?: boolean },
  handoffs: unknown,
): ItemBadge | null {
  const h = handoffs as {
    items?: { id: string; badge?: ItemBadge; role?: string }[];
    brief?: {
      core_items?: { id: string }[];
      recycle_ids?: string[];
    };
  } | null;
  const digest = h?.items?.find((x) => x.id === item.id);
  if (digest?.badge) return digest.badge;
  if (digest?.role === 'recycle' || digest?.role === 'core' || digest?.role === 'extra') {
    return digest.role;
  }
  const recycle = new Set(h?.brief?.recycle_ids ?? []);
  if (recycle.has(item.id)) return 'recycle';
  const core = new Set((h?.brief?.core_items ?? []).map((c) => c.id));
  if (core.has(item.id)) return 'core';
  if (item.extra) return 'extra';
  return null;
}

const BADGE_STYLE: Record<ItemBadge, { bg: string; color: string }> = {
  core: { bg: '#dbeafe', color: '#1d4ed8' },
  extra: { bg: '#fef3c7', color: '#b45309' },
  recycle: { bg: '#e5e7eb', color: '#374151' },
};

type Tab =
  | 'input'
  | 'output'
  | 'handoff'
  | 'issues'
  | 'tokens'
  | 'history';

const STATUS_COLOR: Record<string, string> = {
  queued: 'var(--v2-muted, #9ca3af)',
  running: 'var(--v2-blue, #2563eb)',
  done: 'var(--v2-green, #16a34a)',
  failed: 'var(--v2-red, #dc2626)',
  stale: 'var(--v2-orange, #ea580c)',
};

function jobLabel(j: JobRow): string {
  if (j.page_id) return `${j.kind}:${j.page_id}`;
  if (j.page_index != null) return `${j.kind}:${j.page_index}`;
  return j.kind;
}

function activeStepLine(data: GenPayload): string | null {
  const running = data.jobs.find((j) => j.status === 'running');
  if (running) {
    const cp = running.progress?.current_prompt;
    const bits = [
      jobLabel(running),
      cp?.label ? `prompt ${cp.label}` : null,
      cp?.model ?? null,
    ].filter(Boolean);
    return bits.join(' · ');
  }
  if (data.job.status !== 'running' && data.job.status !== 'queued') return null;
  const queued = data.jobs.find((j) => j.status === 'queued');
  if (queued) return `waiting: next queued ${jobLabel(queued)}`;
  return null;
}

function TokenBar(props: {
  label: string;
  value: number;
  max: number;
}) {
  const pct = Math.min(100, (props.value / Math.max(1, props.max)) * 100);
  const over = props.value > props.max;
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
        <span>{props.label}</span>
        <span style={{ color: over ? '#dc2626' : undefined }}>
          {props.value} / {props.max}
        </span>
      </div>
      <div
        style={{
          height: 8,
          background: '#e5e7eb',
          borderRadius: 4,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: over ? '#dc2626' : '#2563eb',
          }}
        />
      </div>
    </div>
  );
}

export default function V2AdminLessonPage() {
  const params = useParams();
  const day = Number(params.day);
  const [data, setData] = useState<GenPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('input');
  const [editItemId, setEditItemId] = useState('');
  const [editField, setEditField] = useState<'tl' | 'ar' | 'say'>('ar');
  const [editValue, setEditValue] = useState('');
  const [staleIds, setStaleIds] = useState<string[]>([]);
  const failedExtraPollDone = useRef(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/v2/admin/lessons/${day}/generation`);
    if (!res.ok) {
      setError(await res.text());
      return;
    }
    const json = (await res.json()) as GenPayload;
    setData(json);
    setError(null);
    if (!selectedId && json.jobs[0]) setSelectedId(json.jobs[0].id);
  }, [day, selectedId]);

  useEffect(() => {
    void load();
    const status = data?.job.status;
    if (status === 'running' || status === 'queued') {
      failedExtraPollDone.current = false;
    }
    const t = setInterval(() => {
      if (status === 'running' || status === 'queued') {
        void load();
        return;
      }
      // One extra tick after failed so top-level job.error is present.
      if (status === 'failed' && !failedExtraPollDone.current) {
        failedExtraPollDone.current = true;
        void load();
      }
    }, 2000);
    return () => clearInterval(t);
  }, [load, data?.job.status]);

  const selected = useMemo(
    () => data?.jobs.find((j) => j.id === selectedId) ?? null,
    [data, selectedId],
  );

  const timeline = useMemo(() => {
    if (!data?.jobs.length) return null;
    const starts = data.jobs
      .map((j) => (j.started_at ? new Date(j.started_at).getTime() : null))
      .filter((n): n is number => n != null);
    const ends = data.jobs
      .map((j) => (j.finished_at ? new Date(j.finished_at).getTime() : null))
      .filter((n): n is number => n != null);
    if (!starts.length) return null;
    const min = Math.min(...starts);
    const max = Math.max(...ends, Date.now());
    const span = Math.max(1, max - min);
    return { min, span };
  }, [data]);

  async function generate() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/v2/admin/generate/lesson/${day}`, {
        method: 'POST',
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? res.statusText);
      setMessage(`Enqueued v${json.version}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function rerunStale() {
    setBusy(true);
    try {
      const res = await fetch(`/api/v2/admin/lessons/${day}/rerun-stale`, {
        method: 'POST',
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? res.statusText);
      setMessage(`Requeued ${json.requeued} stale jobs`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function rerunJob(id: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/v2/admin/jobs/${id}/rerun`, {
        method: 'POST',
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? res.statusText);
      setMessage(`Requeued ${json.job?.kind ?? id}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function saveItem() {
    if (!editItemId) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/v2/admin/lessons/${day}/items/${encodeURIComponent(editItemId)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ [editField]: editValue }),
        },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? res.statusText);
      setStaleIds(json.stale_job_ids ?? []);
      setMessage(
        `Saved ${editItemId}; stale: ${(json.stale_job_ids ?? []).length}`,
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const statusLabel = data?.flagged
    ? 'flagged'
    : data?.text_ready
      ? 'ready'
      : data?.lesson_status ?? 'draft';

  const budget =
    selected && data?.budgets
      ? data.budgets[selected.kind as keyof typeof data.budgets]
      : null;

  return (
    <main dir="ltr" style={{ padding: 16, maxWidth: 1100, margin: '0 auto' }}>
      <p>
        <Link href="/v2-admin">← Admin</Link>
        {' · '}
        <Link href="/v2-admin/quality">Quality</Link>
        {' · '}
        <Link href={`/day/${day}`}>Player</Link>
      </p>

      {error && <p style={{ color: '#dc2626' }}>{error}</p>}
      {message && <p style={{ color: '#16a34a' }}>{message}</p>}

      <header style={{ marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>
          Day {day}
          {data ? ` · ${data.plan.title_tl}` : ''}
        </h1>
        {data && (
          <p style={{ margin: '4px 0', opacity: 0.8 }}>
            {data.plan.title_ar} · v{data.version ?? '—'} · {statusLabel} ·{' '}
            {(data.total_duration_ms / 1000).toFixed(1)}s · $
            {data.total_usd_estimate.toFixed(4)}
            {data.stale_count ? ` · stale ${data.stale_count}` : ''}
          </p>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button type="button" disabled={busy} onClick={() => void generate()}>
            Generate from scratch
          </button>
          <button type="button" disabled={busy} onClick={() => void rerunStale()}>
            Rerun stale
          </button>
        </div>
      </header>

      {data &&
        (data.job.status === 'running' || data.job.status === 'queued') &&
        (() => {
          const step = activeStepLine(data);
          return (
            <div
              style={{
                position: 'sticky',
                top: 0,
                zIndex: 10,
                marginBottom: 16,
                padding: '10px 12px',
                borderRadius: 8,
                border: '1px solid #bfdbfe',
                background: '#eff6ff',
                color: '#1e3a8a',
                fontSize: 14,
              }}
            >
              <strong>Current step:</strong>{' '}
              {step ?? `job ${data.job.status}…`}
            </div>
          );
        })()}

      {data?.job.status === 'failed' && (
        <div
          style={{
            marginBottom: 16,
            padding: '12px 14px',
            borderRadius: 8,
            border: '1px solid #fecaca',
            background: '#fef2f2',
            color: '#991b1b',
            fontSize: 14,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          <strong>Generation failed</strong>
          <div style={{ marginTop: 6, fontFamily: 'ui-monospace, monospace', fontSize: 13 }}>
            {data.job.error ?? 'Unknown error (no message on job)'}
          </div>
        </div>
      )}

      {/* Job graph */}
      <section style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 16 }}>Job graph</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {(data?.jobs ?? []).map((j) => {
            const selected = selectedId === j.id;
            const running = j.status === 'running';
            return (
              <button
                key={j.id}
                type="button"
                onClick={() => {
                  setSelectedId(j.id);
                  setTab('input');
                }}
                style={{
                  border: running
                    ? '2px solid #2563eb'
                    : selected
                      ? '2px solid #111'
                      : '1px solid #ddd',
                  borderRadius: 6,
                  padding: '6px 10px',
                  background: running ? '#eff6ff' : '#fff',
                  color: STATUS_COLOR[j.status] ?? '#111',
                  cursor: 'pointer',
                  boxShadow: running ? '0 0 0 1px #93c5fd' : undefined,
                  maxWidth: 280,
                  textAlign: 'left',
                }}
                title={
                  j.error
                    ? j.error
                    : `deps: ${j.depends_on.length}`
                }
              >
                {jobLabel(j)} · {j.status}
                {j.status === 'failed' && j.error ? (
                  <span
                    style={{
                      display: 'block',
                      marginTop: 2,
                      fontSize: 11,
                      color: '#991b1b',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {j.error.slice(0, 100)}
                    {j.error.length > 100 ? '…' : ''}
                  </span>
                ) : null}
                {running && j.progress?.current_prompt?.label ? (
                  <span
                    style={{
                      display: 'block',
                      marginTop: 2,
                      fontSize: 11,
                      color: '#1d4ed8',
                    }}
                  >
                    {j.progress.current_prompt.label}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
        {selected && selected.depends_on.length > 0 && (
          <p style={{ fontSize: 12, opacity: 0.7 }}>
            Depends on:{' '}
            {selected.depends_on
              .map((id) => {
                const d = data?.jobs.find((x) => x.id === id);
                return d ? jobLabel(d) : id.slice(-6);
              })
              .join(' → ')}
          </p>
        )}
      </section>

      {/* Timeline */}
      {timeline && (
        <section style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: 16 }}>Timeline</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {(data?.jobs ?? []).map((j) => {
              const s = j.started_at
                ? new Date(j.started_at).getTime()
                : null;
              const e = j.finished_at
                ? new Date(j.finished_at).getTime()
                : s
                  ? Date.now()
                  : null;
              if (s == null || e == null) {
                return (
                  <div key={j.id} style={{ fontSize: 11, opacity: 0.5 }}>
                    {jobLabel(j)} —
                  </div>
                );
              }
              const left = ((s - timeline.min) / timeline.span) * 100;
              const width = Math.max(0.5, ((e - s) / timeline.span) * 100);
              return (
                <div
                  key={j.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '120px 1fr',
                    gap: 8,
                    alignItems: 'center',
                    fontSize: 11,
                  }}
                >
                  <span>{jobLabel(j)}</span>
                  <div
                    style={{
                      position: 'relative',
                      height: 10,
                      background: '#f3f4f6',
                      borderRadius: 4,
                    }}
                  >
                    <div
                      style={{
                        position: 'absolute',
                        left: `${left}%`,
                        width: `${width}%`,
                        height: '100%',
                        background: STATUS_COLOR[j.status] ?? '#666',
                        borderRadius: 4,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Job panel */}
      {selected && (
        <section
          style={{
            border: '1px solid #e5e7eb',
            borderRadius: 8,
            padding: 12,
            marginBottom: 20,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 8,
            }}
          >
            <h2 style={{ fontSize: 16, margin: 0 }}>
              {jobLabel(selected)} · {selected.provider}/{selected.model}
            </h2>
            <button
              type="button"
              disabled={busy}
              onClick={() => void rerunJob(selected.id)}
            >
              Rerun this job
            </button>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
            {(
              [
                'input',
                'output',
                'handoff',
                'issues',
                'tokens',
                'history',
              ] as Tab[]
            ).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                style={{
                  fontWeight: tab === t ? 700 : 400,
                  textTransform: 'capitalize',
                }}
              >
                {t}
              </button>
            ))}
          </div>

          {tab === 'input' && (
            <pre style={{ fontSize: 11, overflow: 'auto', maxHeight: 360 }}>
              {JSON.stringify(selected.input ?? selected.progress, null, 2)}
            </pre>
          )}
          {tab === 'output' && (
            <div>
              {selected.kind === 'page' && selected.page_id && (
                <p>
                  <Link
                    href={`/day/${day}/page/${selected.page_id}`}
                    target="_blank"
                  >
                    Preview in player
                  </Link>
                </p>
              )}
              <pre style={{ fontSize: 11, overflow: 'auto', maxHeight: 360 }}>
                {JSON.stringify(selected.output, null, 2)}
              </pre>
            </div>
          )}
          {tab === 'handoff' && (
            <div>
              <p style={{ fontSize: 12 }}>
                Consumers:{' '}
                {(selected.consumers ?? [])
                  .map((id) => {
                    const c = data?.jobs.find((x) => x.id === id);
                    return c ? jobLabel(c) : id.slice(-6);
                  })
                  .join(', ') || '(none)'}
              </p>
              <pre style={{ fontSize: 11, overflow: 'auto', maxHeight: 360 }}>
                {JSON.stringify(selected.handoff, null, 2)}
              </pre>
            </div>
          )}
          {tab === 'issues' && (
            <pre style={{ fontSize: 11, overflow: 'auto', maxHeight: 360 }}>
              {JSON.stringify(
                {
                  issues: selected.issues,
                  error: selected.error,
                },
                null,
                2,
              )}
            </pre>
          )}
          {tab === 'tokens' && (
            <div>
              <TokenBar
                label="system"
                value={selected.tokens?.system ?? 0}
                max={budget?.system ?? 1500}
              />
              <TokenBar
                label="input"
                value={selected.tokens?.input ?? 0}
                max={budget?.input ?? 3000}
              />
              <TokenBar
                label="output"
                value={selected.tokens?.output ?? 0}
                max={budget?.output ?? 6000}
              />
              <p style={{ fontSize: 12 }}>
                example_tokens: {selected.tokens?.example_tokens ?? 0}
                <br />
                cache_creation: {selected.tokens?.cache_creation_input_tokens ?? 0}
                <br />
                cache_read: {selected.tokens?.cache_read_input_tokens ?? 0}
                <br />
                duration:{' '}
                {(
                  selected.progress as { timing?: { duration_ms?: number } } | null
                )?.timing?.duration_ms ?? '—'}
                ms · cost: ${selected.usd_estimate ?? 0}
                <br />
                over_budget: {String(selected.over_budget)} · attempts:{' '}
                {(selected.attempts ?? []).length}
              </p>
            </div>
          )}
          {tab === 'history' && (
            <div>
              <pre style={{ fontSize: 11, overflow: 'auto', maxHeight: 240 }}>
                {JSON.stringify(selected.attempts ?? [], null, 2)}
              </pre>
              {(selected.attempts ?? []).length >= 2 && (
                <p style={{ fontSize: 12, opacity: 0.8 }}>
                  Diff: compare last two attempt outputs in the JSON above
                  (attempt N vs N−1).
                </p>
              )}
            </div>
          )}
        </section>
      )}

      {/* Items editor */}
      <section>
        <h2 style={{ fontSize: 16 }}>Items</h2>
        <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th align="left">id</th>
              <th align="left">badge</th>
              <th align="left">type</th>
              <th align="left">tl</th>
              <th align="left">ar</th>
              <th align="left">report</th>
            </tr>
          </thead>
          <tbody>
            {(data?.items ?? []).map((it) => {
              const badge = itemBadge(it, data?.handoffs);
              const style = badge ? BADGE_STYLE[badge] : null;
              return (
              <tr
                key={it.id}
                style={{ cursor: 'pointer' }}
                onClick={() => {
                  setEditItemId(it.id);
                  setEditValue(String(it[editField] ?? ''));
                }}
              >
                <td>{it.id}</td>
                <td>
                  {badge ? (
                    <span
                      style={{
                        fontSize: 10,
                        padding: '1px 6px',
                        borderRadius: 4,
                        background: style!.bg,
                        color: style!.color,
                      }}
                    >
                      {badge}
                    </span>
                  ) : (
                    '—'
                  )}
                </td>
                <td>{it.type}</td>
                <td>{it.tl}</td>
                <td>{it.ar}</td>
                <td onClick={(e) => e.stopPropagation()}>
                  <ReportErrorButton day={day} itemId={it.id} />
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
        <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          <input
            value={editItemId}
            onChange={(e) => setEditItemId(e.target.value)}
            placeholder="item id"
          />
          <select
            value={editField}
            onChange={(e) => setEditField(e.target.value as 'tl' | 'ar' | 'say')}
          >
            <option value="tl">tl</option>
            <option value="ar">ar</option>
            <option value="say">say</option>
          </select>
          <input
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            placeholder="value"
            style={{ flex: 1, minWidth: 160 }}
          />
          <button type="button" disabled={busy} onClick={() => void saveItem()}>
            Save item
          </button>
        </div>
        {staleIds.length > 0 && (
          <p style={{ fontSize: 12, color: '#ea580c' }}>
            Became stale:{' '}
            {staleIds
              .map((id) => {
                const j = data?.jobs.find((x) => x.id === id);
                return j ? jobLabel(j) : id.slice(-6);
              })
              .join(', ')}
          </p>
        )}
      </section>

      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 16 }}>Questions</h2>
        {(data?.questions ?? []).length === 0 ? (
          <p style={{ fontSize: 12, opacity: 0.6 }}>No questions yet.</p>
        ) : (
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th align="left">id</th>
                <th align="left">type</th>
                <th align="left">skill</th>
                <th align="left">tests</th>
                <th align="left">report</th>
              </tr>
            </thead>
            <tbody>
              {(data?.questions ?? []).map((q) => (
                <tr key={q.id}>
                  <td>{q.id}</td>
                  <td>{q.type ?? '—'}</td>
                  <td>{q.skill ?? '—'}</td>
                  <td>{(q.tests ?? []).join(', ') || '—'}</td>
                  <td>
                    <ReportErrorButton day={day} questionId={q.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
