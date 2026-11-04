'use client';

import type { ConvoMapVisual } from '@/lib/v2/convo/pack';

type Props = {
  visual: ConvoMapVisual;
  /** Node id where the character stands. */
  characterNode: string | null;
  /** Route step to highlight. */
  activeStepId: string | null;
  /** Brief wrong-way flash. */
  wrongWay: { from: string; toward: string } | null;
  hidden?: boolean;
};

/**
 * Pinned map visual: nodes, character position, highlighted route step,
 * wrong-way flash (09 §10 / T1.13).
 */
export function ConvoMap({
  visual,
  characterNode,
  activeStepId,
  wrongWay,
  hidden,
}: Props) {
  if (hidden) return null;

  const activeStep = visual.route.find((s) => s.step_id === activeStepId);
  const nodeCount = visual.nodes.length;

  return (
    <div
      className="shrink-0 border-b border-v2-line/60 bg-v2-paper-deep/40 px-3 py-3"
      dir="ltr"
      aria-label="خريطة المسار"
    >
      <div className="relative mx-auto flex max-w-[360px] flex-wrap items-center justify-center gap-2">
        {visual.nodes.map((node, i) => {
          const isChar = characterNode === node.id;
          const isWrongFlash =
            wrongWay &&
            (wrongWay.from === node.id || wrongWay.toward === node.id);
          const onActiveEdge =
            activeStep &&
            (activeStep.from === node.id || activeStep.to === node.id);
          return (
            <div key={node.id} className="flex items-center gap-2">
              <div
                className={[
                  'relative flex h-11 min-w-11 flex-col items-center justify-center rounded-full border px-2 transition-transform',
                  isChar
                    ? 'border-v2-action bg-v2-action text-white shadow-md scale-105'
                    : onActiveEdge
                      ? 'border-v2-primary bg-white text-v2-primary ring-2 ring-v2-primary/30'
                      : 'border-v2-line bg-white text-v2-ink-muted',
                  isWrongFlash ? 'animate-pulse border-amber-500 ring-2 ring-amber-400/50' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <span className="font-[family-name:var(--font-v2-target)] text-[10px] font-bold leading-none">
                  {node.label_tl}
                </span>
                {isChar ? (
                  <span className="absolute -top-1 -end-1 flex h-4 w-4 items-center justify-center rounded-full bg-v2-primary text-[8px] text-white">
                    ●
                  </span>
                ) : null}
              </div>
              {i < nodeCount - 1 ? (
                <span
                  className={[
                    'h-0.5 w-3 shrink-0 rounded-full',
                    activeStep &&
                    activeStep.from === node.id &&
                    activeStep.to === visual.nodes[i + 1]?.id
                      ? 'bg-v2-action'
                      : 'bg-v2-line',
                  ].join(' ')}
                  aria-hidden
                />
              ) : null}
            </div>
          );
        })}
      </div>
      {activeStep ? (
        <p className="mt-2 text-center font-[family-name:var(--font-v2-target)] text-[11px] text-v2-ink-muted">
          {activeStep.from} → {activeStep.to}
        </p>
      ) : null}
    </div>
  );
}
