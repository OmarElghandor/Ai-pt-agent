'use client';

import { useEffect, useState } from 'react';

const STORAGE_KEY = 'v2-convo-dev-panel';

export type TalkTurnMetrics = {
  input_tokens: number;
  cached_input_tokens: number | null;
  output_tokens: number;
  ttft_ms: number;
  total_ms: number;
  /** Batch 10 D10 */
  stt_ms?: number | null;
  send_to_first_audio_ms?: number | null;
  reaction_tts_ms?: number | null;
  /** Batch 10 E7 open-mode fallback */
  open_used_fallback?: boolean;
  open_turns?: number;
  open_fallbacks?: number;
};

type Props = {
  metrics: TalkTurnMetrics | null;
  turnCount?: number;
  sttMs?: number | null;
  firstAudioMs?: number | null;
  ttsMs?: number | null;
};

/**
 * Per-turn token/latency strip (09 §5.5 / Batch 10 D10).
 * Toggle with localStorage key `v2-convo-dev-panel` = "1".
 */
export function TalkDevPanel({
  metrics,
  turnCount,
  sttMs,
  firstAudioMs,
  ttsMs,
}: Props) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      setOpen(localStorage.getItem(STORAGE_KEY) === '1');
    } catch {
      setOpen(false);
    }
  }, []);

  if (!open || !metrics) return null;

  const rows: Array<[string, string | number]> = [
    ['turn', turnCount ?? '—'],
    ['input', metrics.input_tokens],
    [
      'cached',
      metrics.cached_input_tokens == null
        ? 'n/a'
        : metrics.cached_input_tokens,
    ],
    ['output', metrics.output_tokens],
    ['ttft_ms', metrics.ttft_ms],
    ['total_ms', metrics.total_ms],
    [
      'stt_ms',
      sttMs ?? metrics.stt_ms ?? 'n/a',
    ],
    [
      '1st_audio',
      firstAudioMs ?? metrics.send_to_first_audio_ms ?? 'n/a',
    ],
    [
      'tts_ms',
      ttsMs ?? metrics.reaction_tts_ms ?? 'n/a',
    ],
  ];

  if (metrics.open_turns != null && metrics.open_turns > 0) {
    const hits = metrics.open_fallbacks ?? 0;
    const turns = metrics.open_turns;
    const pct = Math.round((hits / turns) * 100);
    rows.push([
      'fallback',
      `${hits}/${turns} (${pct}%)${metrics.open_used_fallback ? ' *' : ''}`,
    ]);
  }

  return (
    <aside
      dir="ltr"
      className="border-t border-dashed border-v2-line/80 bg-[#1a1a1a] px-3 py-2 font-mono text-[10px] leading-relaxed text-[#9fef9f]"
      aria-label="Conversation turn metrics"
    >
      <div className="mb-1 flex items-center justify-between text-[#6a6]">
        <span>convo dev · turn metrics (target 1st audio ~2.5s)</span>
        <button
          type="button"
          className="text-[#888] hover:text-white"
          onClick={() => {
            try {
              localStorage.setItem(STORAGE_KEY, '0');
            } catch {
              /* ignore */
            }
            setOpen(false);
          }}
        >
          hide
        </button>
      </div>
      <dl className="grid grid-cols-3 gap-x-3 gap-y-0.5 sm:grid-cols-6">
        {rows.map(([k, v]) => (
          <div key={k} className="flex gap-1">
            <dt className="text-[#6a6]">{k}</dt>
            <dd className="text-[#cfc]">{v}</dd>
          </div>
        ))}
      </dl>
    </aside>
  );
}

/** Helper for console: localStorage.setItem('v2-convo-dev-panel','1') */
export const TALK_DEV_PANEL_KEY = STORAGE_KEY;
