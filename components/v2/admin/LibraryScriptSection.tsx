'use client';

import { useCallback, useEffect, useState } from 'react';
import { lineAnchor, warningAnchor } from '@/lib/v2/library/scriptChecks';

type StageState = { status: string; stale?: boolean; stale_reason?: string };

type Line = {
  speaker: string;
  tl: string;
  tl_f?: string;
  ar: string;
  scene: number;
  moment: string;
  audio_stale?: boolean;
};

type Note = {
  after_line: number;
  eg: { text: string; lang?: string }[];
  focus?: string[];
};

type Warning = {
  code: string;
  message: string;
  line_index?: number;
  moment_id?: string;
};

type ScriptView = {
  brief_status: string;
  stages: { script: StageState };
  title_tl: string | null;
  title_ar: string | null;
  lines: Line[];
  notes: Note[];
  warnings: Warning[];
  script_failure: {
    raw_failed?: { attempt: number; raw: string; errors: { message: string }[] }[];
  } | null;
  estimate: { model: string; input_tokens: number; output_tokens: number };
  job: { id: string; status: string; kind: string; error: string | null } | null;
};

type Props = {
  slug: string;
  briefApproved: boolean;
  onStagesChange?: () => void;
};

function noteText(n: Note): string {
  return (n.eg ?? []).map((s) => s.text).join('');
}

export default function LibraryScriptSection({
  slug,
  briefApproved,
  onStagesChange,
}: Props) {
  const [view, setView] = useState<ScriptView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rawOpen, setRawOpen] = useState(false);
  const [rewriteFor, setRewriteFor] = useState<
    | { mode: 'line'; line_index: number }
    | { mode: 'moment'; moment_id: string }
    | null
  >(null);
  const [instruction, setInstruction] = useState('');

  const load = useCallback(async () => {
    const res = await fetch(`/api/v2/admin/library/episodes/${slug}/script`);
    if (!res.ok) {
      setError(await res.text());
      return;
    }
    setView((await res.json()) as ScriptView);
    setError(null);
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load]);

  const running =
    busy ||
    view?.job?.status === 'queued' ||
    view?.job?.status === 'running' ||
    view?.stages.script.status === 'generating';

  useEffect(() => {
    if (!running || !view?.job?.id) return;
    const id = view.job.id;
    const t = setInterval(async () => {
      const res = await fetch(`/api/v2/admin/library/jobs/${id}`);
      if (!res.ok) return;
      const json = (await res.json()) as {
        job: { status: string };
      };
      if (json.job.status === 'done' || json.job.status === 'failed') {
        setBusy(false);
        await load();
        onStagesChange?.();
      }
    }, 1500);
    return () => clearInterval(t);
  }, [running, view?.job?.id, load, onStagesChange]);

  async function generate(force: boolean) {
    if (running) return;
    if (force && !window.confirm('هيتولد السكريبت من أول وجديد، والكلمات والصوت والمراجعة هيبقوا محتاجين تاني. كمّل؟')) {
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch(
      `/api/v2/admin/library/episodes/${slug}/script/generate`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force }),
      },
    );
    if (res.status === 409) {
      setBusy(false);
      setError('فيه شغل شغال على السكريبت دلوقتي');
      return;
    }
    if (!res.ok) {
      setBusy(false);
      setError(await res.text());
      return;
    }
    await load();
  }

  async function rewrite() {
    if (!rewriteFor || running) return;
    setBusy(true);
    setError(null);
    const res = await fetch(
      `/api/v2/admin/library/episodes/${slug}/script/rewrite`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...rewriteFor,
          instruction: instruction.trim() || undefined,
        }),
      },
    );
    if (res.status === 409) {
      setBusy(false);
      setError('فيه شغل شغال على السكريبت دلوقتي');
      return;
    }
    if (!res.ok) {
      setBusy(false);
      setError(await res.text());
      return;
    }
    setRewriteFor(null);
    setInstruction('');
    await load();
  }

  const estimateTip = view
    ? `${view.estimate.model} · ~${view.estimate.input_tokens + view.estimate.output_tokens} توكن`
    : '';

  const hasScript = (view?.lines?.length ?? 0) > 0;
  const notesByAfter = new Map<number, Note[]>();
  for (const n of view?.notes ?? []) {
    const list = notesByAfter.get(n.after_line) ?? [];
    list.push(n);
    notesByAfter.set(n.after_line, list);
  }

  return (
    <section
      id="stage-script"
      className="space-y-4 rounded-v2-card border border-v2-line bg-v2-card p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-medium text-v2-ink">٢. السكريبت</h2>
        <span className="rounded-v2-chip border border-v2-line px-2 py-0.5 text-xs text-v2-ink-muted">
          {view?.stages.script.status ?? '…'}
          {view?.stages.script.stale ? ' · محتاج تاني' : ''}
        </span>
      </div>

      {!briefApproved ? (
        <p className="text-sm text-v2-ink-muted">اعتمد الـ brief الأول عشان تولّد السكريبت.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={running}
            title={estimateTip}
            onClick={() => void generate(hasScript)}
            className="rounded-v2-chip bg-v2-action px-4 py-2 text-sm text-white disabled:opacity-40"
          >
            {running ? 'بيشتغل…' : hasScript ? 'ولّد تاني' : 'ولّد السكريبت'}
          </button>
        </div>
      )}

      {error ? (
        <p className="rounded-v2-row border border-v2-attention bg-v2-attention/15 px-3 py-2 text-sm">
          {error}
        </p>
      ) : null}

      {view?.stages.script.stale ? (
        <p className="rounded-v2-row border border-v2-attention bg-v2-attention/15 px-3 py-2 text-sm">
          {view.stages.script.stale_reason ?? 'السكريبت محتاج يتعمل تاني'}
        </p>
      ) : null}

      {(view?.warnings?.length ?? 0) > 0 ? (
        <div className="space-y-1 rounded-v2-row border border-v2-line bg-v2-paper p-3">
          <p className="text-sm font-medium text-v2-ink">تحذيرات</p>
          <ul className="space-y-1 text-sm">
            {view!.warnings.map((w, i) => {
              const href = warningAnchor(w);
              return (
                <li key={`${w.code}-${i}`}>
                  {href ? (
                    <a href={href} className="text-v2-primary underline">
                      {w.message}
                    </a>
                  ) : (
                    <span>{w.message}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {view?.script_failure?.raw_failed?.length ? (
        <div className="rounded-v2-row border border-v2-danger/40 bg-v2-paper p-3 text-sm">
          <p className="font-medium text-v2-ink">فشل التوليد بعد المحاولة</p>
          <ul className="mt-1 list-disc pe-5">
            {view.script_failure.raw_failed.flatMap((a) =>
              a.errors.map((e, i) => (
                <li key={`${a.attempt}-${i}`}>{e.message}</li>
              )),
            )}
          </ul>
          <button
            type="button"
            className="mt-2 text-v2-primary underline"
            onClick={() => setRawOpen((v) => !v)}
          >
            {rawOpen ? 'اخفي الناتج الخام' : 'اعرض الناتج الخام'}
          </button>
          {rawOpen ? (
            <pre
              dir="ltr"
              className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-v2-paper-deep p-2 text-start text-xs"
            >
              {view.script_failure.raw_failed
                .map((a) => `--- attempt ${a.attempt} ---\n${a.raw}`)
                .join('\n\n')}
            </pre>
          ) : null}
        </div>
      ) : null}

      {hasScript ? (
        <div className="space-y-3">
          {(view?.title_ar || view?.title_tl) && (
            <div>
              {view?.title_ar ? (
                <p className="text-base font-medium text-v2-ink">{view.title_ar}</p>
              ) : null}
              {view?.title_tl ? (
                <p
                  dir="ltr"
                  className="text-start font-[family-name:var(--font-v2-target)] text-sm text-v2-ink-muted"
                >
                  {view.title_tl}
                </p>
              ) : null}
            </div>
          )}

          {view!.lines.map((line, i) => (
            <div key={i} id={lineAnchor(i)} className="scroll-mt-28 space-y-1 border-b border-v2-line pb-3">
              <div className="flex flex-wrap items-center gap-2 text-xs text-v2-ink-muted">
                <span className="rounded-v2-chip bg-v2-primary-tint px-2 py-0.5 text-v2-primary">
                  {line.speaker}
                </span>
                <span>مشهد {line.scene}</span>
                {line.moment ? (
                  <span className="rounded-v2-chip border border-v2-line px-2 py-0.5">
                    {line.moment}
                  </span>
                ) : null}
                <button
                  type="button"
                  disabled={running}
                  className="ms-auto text-v2-primary underline disabled:opacity-40"
                  onClick={() =>
                    setRewriteFor({ mode: 'line', line_index: i })
                  }
                >
                  اكتب السطر ده تاني
                </button>
              </div>
              <p
                dir="ltr"
                className="text-start font-[family-name:var(--font-v2-target)] text-base text-v2-ink"
              >
                {line.tl}
              </p>
              {line.tl_f ? (
                <p
                  dir="ltr"
                  className="text-start text-sm text-v2-ink-muted font-[family-name:var(--font-v2-target)]"
                >
                  ♀ {line.tl_f}
                </p>
              ) : null}
              <p className="text-sm text-v2-ink-muted">{line.ar}</p>
              {(notesByAfter.get(i) ?? []).map((n, ni) => (
                <div
                  key={ni}
                  className="rounded-v2-row border border-v2-note-border bg-v2-note px-3 py-2 text-sm text-v2-ink"
                >
                  {noteText(n)}
                </div>
              ))}
            </div>
          ))}

          {/* Moment rewrite shortcuts */}
          <div className="flex flex-wrap gap-2 pt-2">
            {[
              ...new Set(
                view!.lines.map((l) => l.moment).filter((m) => !!m),
              ),
            ].map((mid) => (
              <button
                key={mid}
                type="button"
                disabled={running}
                className="rounded-v2-chip border border-v2-line px-3 py-1 text-xs text-v2-ink disabled:opacity-40"
                onClick={() => setRewriteFor({ mode: 'moment', moment_id: mid })}
              >
                اكتب اللحظة دي تاني · {mid}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {rewriteFor ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-4 sm:items-center">
          <div className="w-full max-w-md space-y-3 rounded-v2-card border border-v2-line bg-v2-card p-4">
            <h3 className="text-base font-medium text-v2-ink">
              {rewriteFor.mode === 'line'
                ? `اكتب السطر ${rewriteFor.line_index} تاني`
                : `اكتب اللحظة ${rewriteFor.moment_id} تاني`}
            </h3>
            <label className="block space-y-1 text-sm">
              <span className="text-v2-ink-muted">تعليمات (اختياري)</span>
              <textarea
                rows={3}
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                className="w-full rounded-v2-row border border-v2-line bg-v2-paper px-3 py-2"
              />
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={running}
                onClick={() => void rewrite()}
                className="rounded-v2-chip bg-v2-action px-4 py-2 text-sm text-white disabled:opacity-40"
              >
                ولّد
              </button>
              <button
                type="button"
                onClick={() => {
                  setRewriteFor(null);
                  setInstruction('');
                }}
                className="rounded-v2-chip border border-v2-line px-4 py-2 text-sm"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
