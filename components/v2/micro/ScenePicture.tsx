'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/v2/Icon';
import { toArDigits } from '@/lib/v2/formatAr';
import {
  boxToPixels,
  type RegionBox,
} from '@/lib/v2/micro/images/regions';

export type SceneLineVisual = {
  box?: RegionBox | null;
  label?: string;
  active?: boolean;
  revealed?: boolean;
  /** 1-based index for the marker numeral */
  index?: number;
};

function shortLabel(label?: string): string {
  if (!label?.trim()) return '';
  return label.trim().split(/\s+/).slice(0, 3).join(' ');
}

/**
 * 4:3 scene with circular numbered markers (Stitch 23).
 * Dim = full overlay; markers above. No SVG masks / clip-path.
 */
export function ScenePicture({
  src,
  alt,
  width: widthProp = 360,
  lines,
}: {
  src?: string | null;
  alt: string;
  width?: number;
  lines: SceneLineVisual[];
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(widthProp);
  const height = (width * 3) / 4;
  const active = lines.find((l) => l.active);
  const hasActiveBox = Boolean(active?.box);

  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) setWidth(w);
    });
    ro.observe(el);
    setWidth(el.clientWidth || widthProp);
    return () => ro.disconnect();
  }, [widthProp]);

  return (
    <div
      ref={rootRef}
      className={`relative h-full w-full overflow-hidden bg-surface-container-lowest ${
        active && !hasActiveBox ? 'ring-2 ring-primary ring-offset-2' : ''
      }`}
      style={{ aspectRatio: '4 / 3' }}
      data-testid="scene-picture"
      data-has-active-box={hasActiveBox ? '1' : '0'}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          className="absolute inset-0 h-full w-full object-fill"
          draggable={false}
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-surface-container-high">
          <div className="h-10 w-10 animate-pulse rounded-full bg-surface-container" />
          <p
            className="font-[family-name:var(--font-v2-arabic)] text-sm text-on-surface-variant"
            dir="rtl"
          >
            الصورة بتيتجّهز…
          </p>
        </div>
      )}

      {hasActiveBox ? (
        <div className="pointer-events-none absolute inset-0 bg-on-surface/20" aria-hidden />
      ) : null}

      {lines.map((line, i) => {
        if (!line.box) return null;
        const n = line.index ?? i + 1;
        const px = boxToPixels(line.box, width, height);
        const cxPct = ((px.left + px.width / 2) / width) * 100;
        const cyPct = ((px.top + px.height / 2) / height) * 100;
        const isActive = Boolean(line.active);
        const isRevealed = Boolean(line.revealed);
        const label = shortLabel(line.label);

        return (
          <div
            key={i}
            className="pointer-events-none absolute z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
            style={{ left: `${cxPct}%`, top: `${cyPct}%` }}
            data-testid={
              isActive
                ? 'scene-active-ring'
                : isRevealed
                  ? 'scene-ring'
                  : 'scene-future-marker'
            }
          >
            {isActive && label ? (
              <div className="mb-1 flex animate-bounce items-center gap-1 rounded-full bg-primary px-3 py-1 text-on-primary shadow-md">
                <span
                  className="font-[family-name:var(--font-v2-target)] text-[12px] font-bold"
                  dir="ltr"
                >
                  {label}
                </span>
                <Icon name="touch_app" size={20} className="!text-[14px]" />
              </div>
            ) : null}

            <div className="relative flex items-center justify-center">
              {isActive ? (
                <div className="absolute h-16 w-16 animate-ping rounded-full bg-primary/25" />
              ) : null}
              <div
                className={`relative flex items-center justify-center rounded-full shadow-md ${
                  isActive
                    ? 'h-14 w-14 bg-surface-container-lowest/90'
                    : isRevealed
                      ? 'h-9 w-9 bg-surface-container-lowest/90'
                      : 'h-8 w-8 bg-surface-container-lowest/70'
                }`}
              >
                <div
                  className={`flex items-center justify-center rounded-full font-bold ${
                    isActive
                      ? 'h-10 w-10 bg-primary text-on-primary text-sm'
                      : isRevealed
                        ? 'h-7 w-7 bg-primary/80 text-on-primary text-xs'
                        : 'h-6 w-6 text-outline text-[10px] font-semibold'
                  }`}
                >
                  {toArDigits(n)}
                </div>
              </div>
            </div>

            {isRevealed && !isActive && label ? (
              <span
                className="mt-1 max-w-[8rem] truncate rounded-full bg-on-surface/85 px-2 py-0.5 text-[10px] text-surface"
                dir="ltr"
              >
                {label}
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/** Pure helper for tests — pixel left at a given width. */
export function sceneBoxLeftAtWidth(box: RegionBox, width: number): number {
  return boxToPixels(box, width, (width * 3) / 4).left;
}
