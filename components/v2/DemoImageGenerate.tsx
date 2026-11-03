'use client';

import { useState } from 'react';

type Props = {
  /** Shown only when there is something to generate. */
  enabled?: boolean;
  label?: string;
  body: Record<string, unknown>;
  onReady?: (url: string) => void;
  className?: string;
};

type GenerateJson = {
  error?: string;
  queued?: boolean;
  started?: boolean;
  key?: string;
  day?: number;
  jobIds?: string[];
  skipped?: boolean;
  reason?: string;
  doc?: { url?: string; status?: string; reason?: string };
  message?: string;
};

type ImagePollRow = {
  key: string;
  status: string;
  url: string | null;
  reason: string | null;
};

const POLL_MS = 1500;
const POLL_CAP_MS = 15 * 60 * 1000;

function bustUrl(url: string): string {
  // Bust local/dev caches; Cloudinary URLs already carry a new version.
  if (
    /res\.cloudinary\.com\//.test(url) ||
    /cloudinary\.com\/.*\/upload\//.test(url)
  ) {
    return url;
  }
  return `${url}${url.includes('?') ? '&' : '?'}_=${Date.now()}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollUntilReady(
  day: number,
  key: string,
): Promise<{ url?: string; error?: string }> {
  const started = Date.now();
  let sawInFlight = false;
  while (Date.now() - started < POLL_CAP_MS) {
    const res = await fetch(`/api/v2/admin/images?day=${day}`);
    const json = (await res.json().catch(() => null)) as {
      error?: string;
      images?: ImagePollRow[];
    } | null;
    if (!res.ok) {
      return { error: json?.error ?? `poll failed (${res.status})` };
    }
    const row = (json?.images ?? []).find((r) => r.key === key);
    if (!row) {
      return { error: `key not in day ${day} manifest` };
    }
    if (row.status === 'queued' || row.status === 'generating') {
      sawInFlight = true;
      await sleep(POLL_MS);
      continue;
    }
    if (
      row.status === 'failed' ||
      row.status === 'blocked' ||
      row.status === 'flagged'
    ) {
      return { error: row.reason || row.status };
    }
    if (row.status === 'ready' && row.url) {
      // Avoid accepting a stale pre-enqueue ready before markQueued is visible.
      if (!sawInFlight && Date.now() - started < 8_000) {
        await sleep(POLL_MS);
        continue;
      }
      return { url: row.url };
    }
    // missing / other — keep waiting
    await sleep(POLL_MS);
  }
  return { error: 'timed out waiting for image' };
}

/**
 * Demo overlay: calls the server-gated admin generate route.
 * Always force-regenerates so a click overwrites the existing asset.
 * The route itself enforces denyUnlessV2Admin — this is just UI.
 * Generate is async (enqueue + drain); we poll until ready with a url.
 */
export function DemoImageGenerate({
  enabled = true,
  label = 'Generate',
  body,
  onReady,
  className,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!enabled) return null;

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const day = Number(body.day);
      if (!Number.isInteger(day) || day < 1) {
        throw new Error('day required');
      }

      const res = await fetch('/api/v2/admin/images/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, force: true }),
      });
      const json = (await res.json()) as GenerateJson;
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);

      // Legacy sync shape (if a route ever returns doc.url immediately).
      const syncUrl = json.doc?.url;
      if (syncUrl) {
        onReady?.(bustUrl(syncUrl));
        return;
      }
      if (json.doc?.status === 'blocked') {
        setError(json.doc.reason || 'blocked');
        return;
      }
      if (json.skipped) {
        setError(json.reason || 'busy');
        return;
      }

      const key = typeof json.key === 'string' ? json.key : '';
      if (!key) {
        setError(json.reason || json.message || 'no key');
        return;
      }

      // API always sets queued:true; only started/jobIds mean work was enqueued.
      if (!(json.started || (json.jobIds?.length ?? 0) > 0)) {
        setError(json.message || 'not queued');
        return;
      }

      const result = await pollUntilReady(day, key);
      if (result.url) {
        onReady?.(bustUrl(result.url));
      } else {
        setError(result.error || 'no url');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={[
        'pointer-events-auto absolute bottom-3 start-3 z-20 flex flex-col items-start gap-1',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <button
        type="button"
        disabled={busy}
        onClick={() => void run()}
        className="rounded-full bg-black/55 px-3 py-1.5 text-xs font-medium text-white backdrop-blur disabled:opacity-60"
      >
        {busy ? '…' : label}
      </button>
      {error ? (
        <span className="max-w-[200px] rounded bg-black/50 px-2 py-0.5 text-[10px] text-amber-100">
          {error}
        </span>
      ) : null}
    </div>
  );
}
