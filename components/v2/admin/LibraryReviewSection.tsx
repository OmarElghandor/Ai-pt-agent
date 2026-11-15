'use client';

import { useCallback, useEffect, useState } from 'react';

type Props = {
  slug: string;
  tokensReady: boolean;
  onStagesChange?: () => void;
};

type ReviewView = {
  target_level: number;
  measured_level: number;
  measured_score: {
    sentence_length: number;
    out_of_1000_share: number;
    tenses: string[];
    turns: number;
  };
  moments: { id: string; eg: string; covered: boolean; line_numbers: number[] }[];
  lines: {
    tl: string;
    tl_f?: string;
    ar: string;
    speaker: string;
    moment?: string;
  }[];
  notes: { after_line: number; eg: { text: string }[] }[];
  stages: { review: { status: string; stale?: boolean; stale_reason?: string } };
  intro_eg?: string;
  title_ar?: string;
  title_tl?: string;
};

export default function LibraryReviewSection({
  slug,
  tokensReady,
  onStagesChange,
}: Props) {
  const [view, setView] = useState<ReviewView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({
    tl: '',
    tl_f: '',
    ar: '',
    speaker: '',
  });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/v2/admin/library/episodes/${slug}/review`);
    if (!res.ok) {
      setError(await res.text());
      return;
    }
    setView((await res.json()) as ReviewView);
    setError(null);
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load]);

  async function post(body: Record<string, unknown>) {
    setBusy(true);
    const res = await fetch(`/api/v2/admin/library/episodes/${slug}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (!res.ok) {
      setError(await res.text());
      return;
    }
    await load();
    onStagesChange?.();
  }

  function speakLine(text: string) {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'pt-PT';
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }

  if (!tokensReady) {
    return (
      <section
        id="stage-review"
        className="rounded-v2-card border border-v2-line bg-v2-paper p-4 opacity-60"
      >
        <h2 className="text-lg font-medium text-v2-ink">٤. المراجعة</h2>
        <p className="text-sm text-v2-ink-muted">حلّل الكلمات الأول.</p>
      </section>
    );
  }

  return (
    <section
      id="stage-review"
      className="space-y-4 rounded-v2-card border border-v2-line bg-v2-card p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-medium text-v2-ink">٤. المراجعة</h2>
        <span className="text-xs text-v2-ink-muted">
          {view?.stages.review.status}
          {view?.stages.review.stale ? ' · مفتوحة تاني' : ''}
        </span>
      </div>

      {error ? (
        <p className="rounded-v2-row border border-v2-attention bg-v2-attention/15 px-3 py-2 text-sm">
          {error}
        </p>
      ) : null}

      {view ? (
        <>
          <div className="rounded-v2-row border border-v2-line bg-v2-paper p-3 text-sm space-y-1">
            <p>
              المستوى المستهدف: <strong>{view.target_level}</strong> · المقاس:{' '}
              <strong>{view.measured_level}</strong>
            </p>
            <p className="text-v2-ink-muted">
              طول الجملة {view.measured_score.sentence_length} · خارج الـ1000{' '}
              {Math.round(view.measured_score.out_of_1000_share * 100)}% · أزمنة{' '}
              {view.measured_score.tenses.join(', ') || '—'} · لفات{' '}
              {view.measured_score.turns}
            </p>
            <button
              type="button"
              disabled={busy}
              className="rounded-v2-chip border border-v2-line px-3 py-1"
              onClick={() => void post({ action: 'accept_level' })}
            >
              اقبل المستوى المقاس
            </button>
          </div>

          <div className="space-y-1 text-sm">
            <p className="font-medium">اللحظات</p>
            {view.moments.map((m) => (
              <p key={m.id}>
                {m.covered ? '✓' : 'ناقصة'} {m.eg}
                {m.covered
                  ? ` · أسطر ${m.line_numbers.join(', ')}`
                  : ''}
              </p>
            ))}
          </div>

          <div className="space-y-3">
            <p className="font-medium text-sm">وضع القراءة</p>
            {view.intro_eg ? (
              <p className="text-sm text-v2-ink-muted">{view.intro_eg}</p>
            ) : null}
            {view.lines.map((line, i) => (
              <div
                key={i}
                className="rounded-v2-row border border-v2-line bg-v2-paper p-3 space-y-1"
              >
                <div className="flex flex-wrap gap-2 text-xs text-v2-ink-muted">
                  <span>{line.speaker}</span>
                  <button
                    type="button"
                    className="text-v2-primary underline"
                    onClick={() => speakLine(line.tl)}
                  >
                    اسمع بصوت المتصفح
                  </button>
                  <button
                    type="button"
                    className="text-v2-primary underline"
                    onClick={() => {
                      setEditIdx(i);
                      setEditForm({
                        tl: line.tl,
                        tl_f: line.tl_f ?? '',
                        ar: line.ar,
                        speaker: line.speaker,
                      });
                    }}
                  >
                    عدّل السطر
                  </button>
                </div>
                <p
                  dir="ltr"
                  className="text-start font-[family-name:var(--font-v2-target)]"
                >
                  {line.tl}
                </p>
                <p className="text-sm text-v2-ink-muted">{line.ar}</p>
              </div>
            ))}
          </div>

          <button
            type="button"
            disabled={busy || view.stages.review.status === 'approved'}
            className="rounded-v2-chip bg-v2-action px-4 py-2 text-sm text-white disabled:opacity-40"
            onClick={() => void post({ action: 'approve' })}
          >
            اعتمد المراجعة
          </button>
        </>
      ) : (
        <p className="text-sm text-v2-ink-muted">بيحمّل…</p>
      )}

      {editIdx !== null ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-md space-y-2 rounded-v2-card border border-v2-line bg-v2-card p-4">
            <h3 className="font-medium">تعديل السطر {editIdx}</h3>
            {(['tl', 'tl_f', 'ar', 'speaker'] as const).map((k) => (
              <label key={k} className="block text-sm">
                {k}
                <input
                  dir={k === 'ar' ? undefined : 'ltr'}
                  value={editForm[k]}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, [k]: e.target.value }))
                  }
                  className="mt-1 w-full rounded border border-v2-line px-2 py-1"
                />
              </label>
            ))}
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy}
                className="rounded-v2-chip bg-v2-action px-3 py-1 text-white"
                onClick={() => {
                  void post({
                    action: 'edit_line',
                    line_index: editIdx,
                    ...editForm,
                  }).then(() => setEditIdx(null));
                }}
              >
                احفظ
              </button>
              <button
                type="button"
                className="rounded-v2-chip border border-v2-line px-3 py-1"
                onClick={() => setEditIdx(null)}
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
