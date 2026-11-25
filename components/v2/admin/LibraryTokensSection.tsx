'use client';

import { useCallback, useEffect, useState } from 'react';

type Token = {
  surface: string;
  lemma: string;
  pos: string;
  meaning_ar: string;
  say?: string;
  tense?: string;
  person?: string;
  flagged?: boolean;
  chunk_id?: string | null;
  hand_edited?: boolean;
};

type LineRow = { line_index: number; tl: string; tokens: Token[] };

type Props = {
  slug: string;
  scriptReady: boolean;
  onStagesChange?: () => void;
};

export default function LibraryTokensSection({
  slug,
  scriptReady,
  onStagesChange,
}: Props) {
  const [lines, setLines] = useState<LineRow[]>([]);
  const [status, setStatus] = useState('none');
  const [jobStatus, setJobStatus] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [selected, setSelected] = useState<{
    line: number;
    token: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/v2/admin/library/episodes/${slug}/tokens`);
    if (!res.ok) {
      setError(await res.text());
      return;
    }
    const json = (await res.json()) as {
      stages: { tokens: { status: string } };
      lines: LineRow[];
      job: { id: string; status: string } | null;
    };
    setLines(json.lines);
    setStatus(json.stages.tokens.status);
    setJobStatus(json.job?.status ?? null);
    setJobId(json.job?.id ?? null);
    setError(null);
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load]);

  const running =
    busy || jobStatus === 'queued' || jobStatus === 'running' || status === 'generating';

  useEffect(() => {
    if (!running || !jobId) return;
    const t = setInterval(async () => {
      const res = await fetch(`/api/v2/admin/library/jobs/${jobId}`);
      if (!res.ok) return;
      const json = (await res.json()) as { job: { status: string } };
      if (json.job.status === 'done' || json.job.status === 'failed') {
        setBusy(false);
        await load();
        onStagesChange?.();
      }
    }, 1500);
    return () => clearInterval(t);
  }, [running, jobId, load, onStagesChange]);

  async function analyse() {
    if (running) return;
    setBusy(true);
    const res = await fetch(`/api/v2/admin/library/episodes/${slug}/tokens`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (res.status === 409) {
      setBusy(false);
      setError('فيه شغل شغال على الكلمات دلوقتي');
      return;
    }
    if (!res.ok) {
      setBusy(false);
      setError(await res.text());
      return;
    }
    await load();
  }

  async function saveEdit(lemma: string, meaning_ar: string) {
    if (!selected) return;
    const res = await fetch(`/api/v2/admin/library/episodes/${slug}/tokens`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        line_index: selected.line,
        action: {
          type: 'edit',
          token_index: selected.token,
          lemma,
          meaning_ar,
        },
      }),
    });
    if (!res.ok) {
      setError(await res.text());
      return;
    }
    setSelected(null);
    await load();
  }

  async function mergeSelected(lineIndex: number, from: number, to: number) {
    await fetch(`/api/v2/admin/library/episodes/${slug}/tokens`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        line_index: lineIndex,
        action: { type: 'merge', from, to },
      }),
    });
    await load();
  }

  async function splitChunk(lineIndex: number, chunk_id: string) {
    await fetch(`/api/v2/admin/library/episodes/${slug}/tokens`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        line_index: lineIndex,
        action: { type: 'split', chunk_id },
      }),
    });
    await load();
  }

  const selTok =
    selected && lines[selected.line]?.tokens[selected.token]
      ? lines[selected.line].tokens[selected.token]
      : null;

  return (
    <section
      id="stage-tokens"
      className="space-y-4 rounded-v2-card border border-v2-line bg-v2-card p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-medium text-v2-ink">٣. الكلمات</h2>
        <span className="text-xs text-v2-ink-muted">{status}</span>
      </div>

      {!scriptReady ? (
        <p className="text-sm text-v2-ink-muted">ولّد السكريبت الأول.</p>
      ) : (
        <button
          type="button"
          disabled={running}
          onClick={() => void analyse()}
          className="rounded-v2-chip bg-v2-action px-4 py-2 text-sm text-white disabled:opacity-40"
        >
          {running ? 'بيحلّل…' : 'حلّل الكلمات'}
        </button>
      )}

      {error ? (
        <p className="rounded-v2-row border border-v2-attention bg-v2-attention/15 px-3 py-2 text-sm">
          {error}
        </p>
      ) : null}

      <div className="space-y-4">
        {lines.map((line) => (
          <div key={line.line_index} className="space-y-2 border-b border-v2-line pb-3">
            <p
              dir="ltr"
              className="text-start text-sm text-v2-ink-muted font-[family-name:var(--font-v2-target)]"
            >
              {line.line_index}. {line.tl}
            </p>
            <div className="flex flex-wrap gap-1" dir="ltr">
              {line.tokens.map((tok, ti) => (
                <button
                  key={ti}
                  type="button"
                  onClick={() => setSelected({ line: line.line_index, token: ti })}
                  className={`rounded-v2-chip border px-2 py-1 text-sm ${
                    tok.flagged
                      ? 'border-v2-attention bg-v2-attention/20 text-v2-ink'
                      : 'border-v2-line bg-v2-paper text-v2-ink'
                  } ${tok.chunk_id ? 'ring-1 ring-v2-primary' : ''}`}
                >
                  {tok.surface}
                </button>
              ))}
            </div>
            {line.tokens.length >= 2 ? (
              <button
                type="button"
                className="text-xs text-v2-primary underline"
                onClick={() => void mergeSelected(line.line_index, 0, 1)}
              >
                ادمج أول كلمتين
              </button>
            ) : null}
            {line.tokens.some((t) => t.chunk_id) ? (
              <button
                type="button"
                className="ms-2 text-xs text-v2-primary underline"
                onClick={() => {
                  const id = line.tokens.find((t) => t.chunk_id)?.chunk_id;
                  if (id) void splitChunk(line.line_index, id);
                }}
              >
                فك الـ chunk
              </button>
            ) : null}
          </div>
        ))}
      </div>

      {selTok && selected ? (
        <div className="rounded-v2-row border border-v2-line bg-v2-paper p-3 text-sm space-y-2">
          <p dir="ltr" className="font-[family-name:var(--font-v2-target)] text-base">
            {selTok.surface}
          </p>
          <label className="block">
            lemma
            <input
              dir="ltr"
              id="tok-lemma"
              defaultValue={selTok.lemma}
              className="mt-1 w-full rounded border border-v2-line px-2 py-1"
            />
          </label>
          <label className="block">
            المعنى
            <input
              id="tok-meaning"
              defaultValue={selTok.meaning_ar}
              className="mt-1 w-full rounded border border-v2-line px-2 py-1"
            />
          </label>
          <p className="text-xs text-v2-ink-muted">
            {selTok.pos}
            {selTok.tense ? ` · ${selTok.tense}/${selTok.person}` : ''}
            {selTok.flagged ? ' · معلّم' : ''}
            {selTok.chunk_id ? ` · chunk ${selTok.chunk_id}` : ''}
          </p>
          <button
            type="button"
            className="rounded-v2-chip bg-v2-action px-3 py-1 text-white"
            onClick={() => {
              const lemma = (
                document.getElementById('tok-lemma') as HTMLInputElement
              ).value;
              const meaning = (
                document.getElementById('tok-meaning') as HTMLInputElement
              ).value;
              void saveEdit(lemma, meaning);
            }}
          >
            احفظ التعديل
          </button>
        </div>
      ) : null}
    </section>
  );
}
