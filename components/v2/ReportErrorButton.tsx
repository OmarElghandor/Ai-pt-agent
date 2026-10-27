'use client';

import { useState } from 'react';

type Props = {
  day: number;
  itemId?: string;
  questionId?: string;
  className?: string;
};

export function ReportErrorButton({
  day,
  itemId,
  questionId,
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'done' | 'err'>(
    'idle',
  );

  async function submit() {
    if (!note.trim()) return;
    setStatus('saving');
    try {
      const res = await fetch('/api/v2/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          day,
          item_id: itemId,
          question_id: questionId,
          note: note.trim(),
        }),
      });
      if (!res.ok) throw new Error('fail');
      setStatus('done');
      setNote('');
      setOpen(false);
    } catch {
      setStatus('err');
    }
  }

  return (
    <span className={className}>
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          setStatus('idle');
        }}
        className="font-[family-name:var(--font-v2-arabic)] text-sm text-v2-ink-muted underline underline-offset-2"
      >
        بلّغ عن خطأ
      </button>
      {open ? (
        <div className="mt-2 flex flex-col gap-2 rounded-lg border border-v2-border bg-v2-surface p-2">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="إيه الغلط؟"
            className="font-[family-name:var(--font-v2-arabic)] w-full rounded border border-v2-border bg-transparent p-2 text-sm text-v2-ink"
          />
          <button
            type="button"
            disabled={status === 'saving' || !note.trim()}
            onClick={() => void submit()}
            className="font-[family-name:var(--font-v2-arabic)] rounded bg-v2-ink px-3 py-1 text-sm text-v2-surface disabled:opacity-50"
          >
            إرسال
          </button>
          {status === 'done' ? (
            <p className="font-[family-name:var(--font-v2-arabic)] text-xs text-v2-ink-muted">
              تم الإرسال
            </p>
          ) : null}
          {status === 'err' ? (
            <p className="font-[family-name:var(--font-v2-arabic)] text-xs text-amber-700">
              حصل خطأ — حاول تاني
            </p>
          ) : null}
        </div>
      ) : null}
    </span>
  );
}
