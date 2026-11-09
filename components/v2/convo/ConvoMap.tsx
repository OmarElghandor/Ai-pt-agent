'use client';

import type { ConvoMapVisual } from '@/lib/v2/convo/pack';

type Props = {
  visual: ConvoMapVisual;
  /** Node id where the character stands. */
  characterNode: string | null;
  /** Route step to highlight. */
  activeStepId: string | null;
  /** Node to pulse (current question). */
  pulseNodeId?: string | null;
  /** Place nodes answered correctly — sage check (M6). */
  checkedNodeIds?: string[];
  /** Brief wrong-way flash. */
  wrongWay: { from: string; toward: string } | null;
  /** Side-channel: highlight a map node (T3.2). */
  highlightNodeId?: string | null;
  /** Collapse to a ~120px progress strip while scrolling. */
  collapsed?: boolean;
  hidden?: boolean;
};

const ARROW: Record<string, string> = {
  left: '←',
  right: '→',
  straight: '↑',
};

/**
 * Illustrated map: nodes at x/y, sage route + Inês dot, moss pulse,
 * muted ochre wrong-way (Stitch l1/l3 · Calm Kit).
 */
export function ConvoMap({
  visual,
  characterNode,
  activeStepId,
  pulseNodeId,
  checkedNodeIds,
  wrongWay,
  highlightNodeId,
  collapsed,
  hidden,
}: Props) {
  const checked = new Set(checkedNodeIds ?? []);
  if (hidden) return null;

  const activeStep = visual.route.find((s) => s.step_id === activeStepId);
  const hasXy = visual.nodes.every(
    (n) => typeof n.x === 'number' && typeof n.y === 'number',
  );

  if (!hasXy) {
    // Fallback strip for older packs without x/y.
    return (
      <div
        className="shrink-0 border-b border-[color:var(--ft-border,#E5DED5)] bg-[color:var(--ft-mist,#D9E1D9)]/40 px-3 py-3"
        dir="ltr"
        aria-label="خريطة المسار"
      >
        <div className="relative mx-auto flex max-w-[360px] flex-wrap items-center justify-center gap-2">
          {visual.nodes.map((node, i) => {
            const isChar = characterNode === node.id;
            return (
              <div key={node.id} className="flex items-center gap-2">
                <div
                  className={[
                    'relative flex h-11 min-w-11 items-center justify-center rounded-full border px-2',
                    isChar
                      ? 'border-[color:var(--ft-sage,#6B7F6E)] bg-[color:var(--ft-sage,#6B7F6E)] text-white'
                      : 'border-[color:var(--ft-border,#E5DED5)] bg-white text-[color:var(--ft-ink,#202A25)]',
                  ].join(' ')}
                >
                  <span className="font-[family-name:var(--font-ft-pt,var(--font-v2-target))] text-[10px] font-bold">
                    {node.label_tl}
                  </span>
                </div>
                {i < visual.nodes.length - 1 ? (
                  <span className="h-0.5 w-3 rounded-full bg-[color:var(--ft-moss,#A7B8A7)]" />
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (collapsed) {
    const placeNodes = visual.nodes.filter((n) => n.kind !== 'far_place');
    return (
      <div
        className="shrink-0 border-b border-[color:var(--ft-border,#E5DED5)] bg-[color:var(--ft-surface,#FBF8F3)] px-3 py-2"
        dir="ltr"
        aria-label="مسار مختصر"
        style={{ maxHeight: 120 }}
      >
        <div className="mx-auto flex max-w-[360px] items-center justify-between gap-1">
          {placeNodes.map((node, i) => {
            const isChar = characterNode === node.id;
            const done =
              characterNode &&
              placeNodes.findIndex((n) => n.id === characterNode) > i;
            return (
              <div key={node.id} className="flex flex-1 items-center gap-1">
                <div
                  className={[
                    'flex h-8 min-w-0 flex-1 items-center justify-center rounded-full px-1 text-center',
                    isChar
                      ? 'bg-[color:var(--ft-sage,#6B7F6E)] text-white'
                      : done
                        ? 'bg-[color:var(--ft-success-soft,#E5E9DF)] text-[color:var(--ft-sage,#6B7F6E)]'
                        : 'bg-[color:var(--ft-mist,#D9E1D9)] text-[color:var(--ft-text-secondary,#666963)]',
                  ].join(' ')}
                >
                  <span className="truncate font-[family-name:var(--font-ft-pt,var(--font-v2-target))] text-[9px] font-semibold">
                    {done && !isChar ? '✓ ' : ''}
                    {node.label_tl}
                  </span>
                </div>
                {i < placeNodes.length - 1 ? (
                  <span className="h-px w-2 shrink-0 border-t border-dashed border-[color:var(--ft-sage,#6B7F6E)]" />
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div
      className="shrink-0 border-b border-[color:var(--ft-border,#E5DED5)] bg-[color:var(--ft-ivory,#F4EFE8)] px-3 py-3"
      dir="ltr"
      aria-label="خريطة المسار"
    >
      <div
        className="relative mx-auto max-w-[360px] overflow-hidden rounded-[1.5rem] border border-[color:var(--ft-border,#E5DED5)] bg-[linear-gradient(160deg,#E8EFE6_0%,#F4EFE8_45%,#EDE6DC_100%)]"
        style={{ height: 168 }}
      >
        {/* soft street bands */}
        <div
          className="absolute inset-x-[8%] top-[68%] h-3 rounded-full bg-[#C9BDAF]/55"
          aria-hidden
        />
        <div
          className="absolute end-[18%] top-[28%] h-[48%] w-3 rounded-full bg-[#C9BDAF]/45"
          aria-hidden
        />

        {visual.route.map((step) => {
          const from = visual.nodes.find((n) => n.id === step.from);
          const to = visual.nodes.find((n) => n.id === step.to);
          if (!from || !to) return null;
          const active = activeStep?.step_id === step.step_id;
          return (
            <svg
              key={step.step_id}
              className="pointer-events-none absolute inset-0 h-full w-full"
              aria-hidden
            >
              <line
                x1={`${from.x}%`}
                y1={`${from.y}%`}
                x2={`${to.x}%`}
                y2={`${to.y}%`}
                stroke={active ? '#6B7F6E' : '#A7B8A7'}
                strokeWidth={active ? 3 : 2}
                strokeDasharray={active ? '0' : '4 4'}
                strokeLinecap="round"
              />
            </svg>
          );
        })}

        {visual.nodes.map((node) => {
          const isChar = characterNode === node.id;
          const isChecked = checked.has(node.id) && !isChar;
          const pulse =
            pulseNodeId === node.id || highlightNodeId === node.id;
          const isWrong =
            wrongWay &&
            (wrongWay.from === node.id || wrongWay.toward === node.id);
          const onEdge =
            activeStep &&
            (activeStep.from === node.id || activeStep.to === node.id);
          return (
            <div
              key={node.id}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${node.x}%`, top: `${node.y}%` }}
            >
              <div
                className={[
                  'relative flex flex-col items-center',
                  pulse ? 'animate-pulse' : '',
                ].join(' ')}
              >
                <div
                  className={[
                    'flex h-9 min-w-9 items-center justify-center rounded-full border px-2 shadow-sm',
                    isChar
                      ? 'border-[color:var(--ft-sage,#6B7F6E)] bg-[color:var(--ft-sage,#6B7F6E)] text-white'
                      : isChecked
                        ? 'border-[color:var(--ft-sage,#6B7F6E)] bg-[color:var(--ft-success-soft,#E5E9DF)] text-[color:var(--ft-sage,#6B7F6E)]'
                      : isWrong
                        ? 'border-[color:var(--ft-correction,#B8955A)] bg-[color:var(--ft-coach,#EFE7DC)] text-[color:var(--ft-correction-text,#7A5E30)] ring-2 ring-[color:var(--ft-correction,#B8955A)]/40'
                        : onEdge || pulse
                          ? 'border-[color:var(--ft-moss,#A7B8A7)] bg-white text-[color:var(--ft-sage,#6B7F6E)] ring-2 ring-[color:var(--ft-moss,#A7B8A7)]/50'
                          : 'border-[color:var(--ft-border,#E5DED5)] bg-white/95 text-[color:var(--ft-ink,#202A25)]',
                  ].join(' ')}
                >
                  <span className="font-[family-name:var(--font-ft-pt,var(--font-v2-target))] text-[10px] font-bold leading-none">
                    {isChecked ? '✓ ' : ''}
                    {node.label_tl}
                  </span>
                </div>
                {isChar ? (
                  <span className="mt-1 h-2.5 w-2.5 rounded-full bg-[color:var(--ft-sage,#6B7F6E)] ring-4 ring-[color:var(--ft-sage,#6B7F6E)]/25" />
                ) : null}
                {activeStep?.to === node.id && activeStep.arrow ? (
                  <span className="mt-0.5 text-[12px] text-[color:var(--ft-sage,#6B7F6E)]">
                    {ARROW[activeStep.arrow] ?? ''}
                  </span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
