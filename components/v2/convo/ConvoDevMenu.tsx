'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

type RegenAction = 'reset' | 'reload_pack' | 'regenerate_day' | 'clear_audio';

const CONVO_MODEL_KEY = 'v2.convo.model';

export type ConvoModelChoice = 'qwen' | 'haiku';

export function readConvoModelChoice(): ConvoModelChoice {
  try {
    const v = localStorage.getItem(CONVO_MODEL_KEY);
    if (v === 'haiku' || v === 'qwen') return v;
  } catch {
    /* ignore */
  }
  return 'qwen';
}

export function writeConvoModelChoice(choice: ConvoModelChoice): void {
  try {
    localStorage.setItem(CONVO_MODEL_KEY, choice);
  } catch {
    /* ignore */
  }
}

type Props = {
  packId?: string | null;
  topicId?: string | null;
  day?: number | null;
  onPreparing?: () => void;
  onReloadStart?: () => void;
  /** Fired when the character model A/B switch changes. */
  onConvoModelChange?: (choice: ConvoModelChoice) => void;
};

/**
 * ⋯ menu for admin/dev: reset session, reload pack, regenerate day, clear audio.
 * Visible only when GET /api/v2/admin/me returns ok.
 */
export function ConvoDevMenu({
  packId,
  topicId,
  day,
  onPreparing,
  onReloadStart,
  onConvoModelChange,
}: Props) {
  const [allowed, setAllowed] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [convoModel, setConvoModel] = useState<ConvoModelChoice>('qwen');
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/v2/admin/me');
        if (!cancelled) setAllowed(res.ok);
      } catch {
        if (!cancelled) setAllowed(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setConvoModel(readConvoModelChoice());
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const run = useCallback(
    async (action: RegenAction) => {
      if (busy) return;
      if (action === 'regenerate_day') {
        const ok = window.confirm(
          'إعادة توليد اليوم بالكامل؟ قد يستغرق دقائق.',
        );
        if (!ok) return;
      }
      setBusy(true);
      setMsg(null);
      try {
        const res = await fetch('/api/v2/admin/convo/regenerate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action,
            ...(packId ? { pack_id: packId } : {}),
            ...(topicId ? { topic_id: topicId } : {}),
          }),
        });
        const body = (await res.json().catch(() => null)) as {
          ok?: boolean;
          error?: string;
          preparing?: boolean;
        } | null;
        if (!res.ok) {
          throw new Error(body?.error ?? `HTTP ${res.status}`);
        }
        setOpen(false);
        if (body?.preparing) {
          onPreparing?.();
        } else {
          onReloadStart?.();
        }
      } catch (err) {
        setMsg(err instanceof Error ? err.message : 'فشل');
      } finally {
        setBusy(false);
      }
    },
    [busy, packId, topicId, onPreparing, onReloadStart],
  );

  if (!allowed) return null;

  const adminHref =
    day != null && day > 0 ? `/v2-admin/lessons/${day}` : '/v2-admin/lessons';

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        aria-label="قائمة المطوّر"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-10 w-10 items-center justify-center rounded-full text-[color:var(--ft-text-secondary,#666963)] hover:bg-[color:var(--ft-mist,#D9E1D9)]/50"
      >
        <span className="material-symbols-rounded text-[22px]">more_horiz</span>
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute end-0 top-full z-50 mt-1 min-w-[220px] overflow-hidden rounded-2xl border border-[color:var(--ft-border,#E5DED5)] bg-white py-1 shadow-lg"
        >
          <div className="border-b border-[color:var(--ft-border,#E5DED5)] px-4 py-2">
            <p className="mb-1.5 font-[family-name:var(--font-ft-ar,var(--font-v2-arabic))] text-[11px] text-[color:var(--ft-text-secondary,#666963)]">
              نموذج الشخصية (A/B)
            </p>
            <div className="flex gap-1">
              {(
                [
                  ['qwen', 'Qwen'],
                  ['haiku', 'Haiku'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={convoModel === id}
                  disabled={busy}
                  onClick={() => {
                    setConvoModel(id);
                    writeConvoModelChoice(id);
                    onConvoModelChange?.(id);
                    setMsg(`نموذج: ${label}`);
                  }}
                  className={`flex-1 rounded-lg px-2 py-1.5 font-[family-name:var(--font-ft-ui,var(--font-v2-ui))] text-[12px] ${
                    convoModel === id
                      ? 'bg-[color:var(--ft-moss,#5C6B5E)] text-white'
                      : 'bg-[color:var(--ft-mist,#D9E1D9)]/50 text-[color:var(--ft-ink,#202A25)]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {(
            [
              ['reset', 'ابدأ من الأول'],
              ['reload_pack', 'أعد تحميل المحادثة'],
              ['regenerate_day', 'أعد توليد اليوم'],
              ['clear_audio', 'امسح كاش الصوت'],
            ] as const
          ).map(([action, label]) => (
            <button
              key={action}
              type="button"
              role="menuitem"
              disabled={busy}
              onClick={() => void run(action)}
              className="block w-full px-4 py-2.5 text-start font-[family-name:var(--font-ft-ar,var(--font-v2-arabic))] text-[13px] text-[color:var(--ft-ink,#202A25)] hover:bg-[color:var(--ft-mist,#D9E1D9)]/40 disabled:opacity-50"
            >
              {label}
            </button>
          ))}
          <Link
            href={adminHref}
            role="menuitem"
            className="block w-full border-t border-[color:var(--ft-border,#E5DED5)] px-4 py-2.5 text-start font-[family-name:var(--font-ft-ar,var(--font-v2-arabic))] text-[13px] text-[color:var(--ft-sage,#6B7F6E)] hover:bg-[color:var(--ft-mist,#D9E1D9)]/40"
            onClick={() => setOpen(false)}
          >
            افتح في الأدمن
          </Link>
          {msg ? (
            <p className="border-t border-[color:var(--ft-border,#E5DED5)] px-4 py-2 font-[family-name:var(--font-ft-ar,var(--font-v2-arabic))] text-[11px] text-red-700">
              {msg}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
