'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type ImageCard = {
  key: string;
  item_id: string | null;
  manifest_source: string;
  aspect: string;
  ratio: string;
  characters: string[];
  source: 'authored' | 'generated' | 'override';
  scene_prompt: string | null;
  prompt_override: string | null;
  final_prompt: string;
  status: string;
  reason: string | null;
  url: string | null;
  cost_usd: number | null;
};

type ImagesPayload = {
  images?: ImageCard[];
  queued?: number;
  generating?: number;
  missing?: number;
  estimate_usd_for_missing?: number;
  error?: string;
};

const SOURCE_LABEL: Record<ImageCard['source'], string> = {
  authored: 'authored',
  generated: 'generated',
  override: 'override',
};

const SOURCE_STYLE: Record<ImageCard['source'], { bg: string; color: string }> = {
  authored: { bg: '#dbeafe', color: '#1d4ed8' },
  generated: { bg: '#e5e7eb', color: '#374151' },
  override: { bg: '#fef3c7', color: '#b45309' },
};

const POLL_MS = 1500;
const POLL_CAP_MS = 45 * 60 * 1000;

function isInFlight(status: string): boolean {
  return status === 'queued' || status === 'generating';
}

export function LessonImagesAdmin({ day }: { day: number }) {
  const [images, setImages] = useState<ImageCard[]>([]);
  const [missing, setMissing] = useState(0);
  const [estimateUsd, setEstimateUsd] = useState(0);
  const [queued, setQueued] = useState(0);
  const [generating, setGenerating] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [batchBusy, setBatchBusy] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollStartedRef = useRef<number | null>(null);

  const stopPoll = useCallback(() => {
    if (pollRef.current) {
      clearTimeout(pollRef.current);
      pollRef.current = null;
    }
    pollStartedRef.current = null;
  }, []);

  const applyPayload = useCallback((json: ImagesPayload) => {
    const rows = json.images ?? [];
    setImages(rows);
    setMissing(json.missing ?? 0);
    setEstimateUsd(json.estimate_usd_for_missing ?? 0);
    setQueued(json.queued ?? 0);
    setGenerating(json.generating ?? 0);
    const next: Record<string, string> = {};
    for (const row of rows) {
      next[row.key] = row.prompt_override ?? row.scene_prompt ?? '';
    }
    setDrafts(next);
    return rows;
  }, []);

  const load = useCallback(async () => {
    setError(null);
    const res = await fetch(`/api/v2/admin/images?day=${day}`);
    const json = (await res.json().catch(() => null)) as ImagesPayload | null;
    if (!res.ok) {
      setError(json?.error ?? `load failed (${res.status})`);
      return [];
    }
    return applyPayload(json ?? {});
  }, [applyPayload, day]);

  const pollUntilIdle = useCallback(async () => {
    stopPoll();
    pollStartedRef.current = Date.now();

    const tick = async () => {
      const rows = await load();
      const inflight = rows.some((r) => isInFlight(r.status));
      const elapsed =
        pollStartedRef.current != null
          ? Date.now() - pollStartedRef.current
          : 0;
      if (!inflight || elapsed >= POLL_CAP_MS) {
        stopPoll();
        setBatchBusy(false);
        setBusyKey(null);
        return;
      }
      pollRef.current = setTimeout(() => {
        void tick();
      }, POLL_MS);
    };

    await tick();
  }, [load, stopPoll]);

  useEffect(() => {
    void load();
    return () => stopPoll();
  }, [load, stopPoll]);

  async function saveOverride(row: ImageCard) {
    setBusyKey(row.key);
    setError(null);
    try {
      const res = await fetch('/api/v2/admin/images', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: row.key,
          prompt_override: drafts[row.key] ?? '',
        }),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(json?.error ?? `save failed (${res.status})`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyKey(null);
    }
  }

  async function regenerate(row: ImageCard) {
    setBusyKey(row.key);
    setError(null);
    try {
      const body =
        row.manifest_source === 'story_scene'
          ? { kind: 'story_scene', day, force: true }
          : {
              kind: 'item',
              day,
              item_id: row.item_id ?? row.key,
              force: true,
            };
      const res = await fetch('/api/v2/admin/images/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(json?.error ?? `generate failed (${res.status})`);
      await pollUntilIdle();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusyKey(null);
    }
  }

  async function generateMissing() {
    setBatchBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/v2/admin/images/generate-missing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ day }),
      });
      const json = (await res.json().catch(() => null)) as {
        error?: string;
        missing?: number;
        started?: boolean;
        jobIds?: string[];
        estimate_usd?: number;
        message?: string;
      } | null;
      if (!res.ok) throw new Error(json?.error ?? `generate-missing failed (${res.status})`);
      if ((json?.missing ?? 0) === 0 || !(json?.started || (json?.jobIds?.length ?? 0) > 0)) {
        setBatchBusy(false);
        await load();
        return;
      }
      await pollUntilIdle();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBatchBusy(false);
    }
  }

  /** Force-overwrite every manifest image (ready included). */
  async function regenerateAll() {
    setBatchBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/v2/admin/images/generate-missing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ day, force: true }),
      });
      const json = (await res.json().catch(() => null)) as {
        error?: string;
        started?: boolean;
        jobIds?: string[];
        message?: string;
      } | null;
      if (!res.ok) throw new Error(json?.error ?? `regenerate-all failed (${res.status})`);
      if (!(json?.started || (json?.jobIds?.length ?? 0) > 0)) {
        setBatchBusy(false);
        await load();
        return;
      }
      await pollUntilIdle();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBatchBusy(false);
    }
  }

  async function copyCoreItems(row: ImageCard) {
    const payload = {
      ratio: row.ratio,
      characters: row.characters,
      prompt: (drafts[row.key] ?? row.scene_prompt ?? '').trim(),
    };
    await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    setCopiedKey(row.key);
    setTimeout(() => setCopiedKey((k) => (k === row.key ? null : k)), 1500);
  }

  const inFlight = queued + generating > 0 || batchBusy;
  const estimateLabel =
    estimateUsd > 0 ? ` · ~$${estimateUsd.toFixed(2)}` : '';

  return (
    <section style={{ marginBottom: 24 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          marginBottom: 12,
          flexWrap: 'wrap',
        }}
      >
        <h2 style={{ fontSize: 16, margin: 0 }}>الصور</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {inFlight ? (
            <span style={{ fontSize: 12, color: '#b45309' }}>
              جاري التوليد… ({queued} queued · {generating} generating)
            </span>
          ) : null}
          <button
            type="button"
            disabled={batchBusy || missing === 0}
            onClick={() => void generateMissing()}
            title={
              missing === 0
                ? 'No missing images'
                : `Generate ${missing} missing images${estimateLabel}`
            }
          >
            {batchBusy
              ? '…'
              : `ولّد الصور الناقصة (${missing}${estimateLabel})`}
          </button>
          <button
            type="button"
            disabled={batchBusy || images.length === 0}
            onClick={() => void regenerateAll()}
            title={
              images.length === 0
                ? 'No images in the manifest'
                : `Force regenerate all ${images.length} images`
            }
          >
            {batchBusy ? '…' : `أعد توليد الكل (${images.length})`}
          </button>
          <button type="button" onClick={() => void load()} disabled={batchBusy}>
            Refresh
          </button>
        </div>
      </div>
      {error ? (
        <p style={{ color: '#b45309', fontSize: 13, marginBottom: 12 }}>{error}</p>
      ) : null}
      {images.length === 0 ? (
        <p style={{ fontSize: 13, color: '#666' }}>No image keys in the manifest.</p>
      ) : (
        <div style={{ display: 'grid', gap: 14 }}>
          {images.map((row) => {
            const badge = SOURCE_STYLE[row.source];
            const busy = busyKey === row.key || isInFlight(row.status);
            return (
              <article
                key={row.key}
                style={{
                  border: '1px solid #e5e7eb',
                  borderRadius: 8,
                  padding: 12,
                  display: 'grid',
                  gridTemplateColumns: '140px 1fr',
                  gap: 12,
                }}
              >
                <div>
                  {row.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={row.url}
                      alt={row.key}
                      style={{
                        width: '100%',
                        borderRadius: 6,
                        border: '1px solid #eee',
                        background: '#fafafa',
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        aspectRatio: '4 / 3',
                        borderRadius: 6,
                        background: '#f3f4f6',
                        display: 'grid',
                        placeItems: 'center',
                        fontSize: 12,
                        color: '#6b7280',
                      }}
                    >
                      لا صورة
                    </div>
                  )}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 8,
                      alignItems: 'center',
                      marginBottom: 6,
                    }}
                  >
                    <code style={{ fontSize: 12 }}>{row.key}</code>
                    <span
                      style={{
                        fontSize: 11,
                        padding: '2px 8px',
                        borderRadius: 999,
                        background: badge.bg,
                        color: badge.color,
                      }}
                    >
                      {SOURCE_LABEL[row.source]}
                    </span>
                    <span style={{ fontSize: 12, color: '#555' }}>
                      {row.status}
                      {row.reason ? ` · ${row.reason}` : ''}
                    </span>
                  </div>
                  <p style={{ fontSize: 12, color: '#666', margin: '0 0 8px' }}>
                    ratio {row.ratio} · chars {(row.characters ?? []).join(', ') || '—'}
                  </p>
                  <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>
                    edit prompt (scene)
                  </label>
                  <textarea
                    value={drafts[row.key] ?? ''}
                    onChange={(e) =>
                      setDrafts((prev) => ({ ...prev, [row.key]: e.target.value }))
                    }
                    rows={4}
                    style={{
                      width: '100%',
                      fontSize: 12,
                      fontFamily: 'ui-monospace, monospace',
                      marginBottom: 8,
                    }}
                  />
                  <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>
                    final prompt
                  </label>
                  <pre
                    style={{
                      fontSize: 11,
                      background: '#f9fafb',
                      border: '1px solid #eee',
                      borderRadius: 6,
                      padding: 8,
                      maxHeight: 160,
                      overflow: 'auto',
                      whiteSpace: 'pre-wrap',
                      marginBottom: 8,
                    }}
                  >
                    {row.final_prompt || '(empty — generate first for generated specs)'}
                  </pre>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    <button
                      type="button"
                      disabled={busy || batchBusy}
                      onClick={() => void saveOverride(row)}
                    >
                      {busyKey === row.key ? '…' : 'Save override'}
                    </button>
                    <button
                      type="button"
                      disabled={busy || batchBusy}
                      onClick={() => void regenerate(row)}
                    >
                      {busyKey === row.key || isInFlight(row.status)
                        ? '…'
                        : 'Regenerate'}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void copyCoreItems(row)}
                    >
                      {copiedKey === row.key ? 'Copied' : 'انسخ لـ core-items'}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
