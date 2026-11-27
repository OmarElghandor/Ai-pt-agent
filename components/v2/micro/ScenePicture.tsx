'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Icon } from '@/components/v2/Icon';
import { toArDigits } from '@/lib/v2/formatAr';
import {
  boxToPixels,
  type RegionBox,
} from '@/lib/v2/micro/images/regions';

export type SceneLineVisual = {
  box?: RegionBox | null;
  /** Short region_label (2–3 words), never the full sentence. */
  label?: string;
  active?: boolean;
  revealed?: boolean;
  /** 1-based index for the marker numeral */
  index?: number;
};

/**
 * 4:3 scene (§3.2b): active ring + pointer + short label only;
 * revealed = small numbered dots; future = nothing.
 * RN-safe: absolute %, opacity/scale/rotate transforms only.
 */
export function ScenePicture({
  src,
  alt,
  width: widthProp = 360,
  lines,
  pointerFrom,
}: {
  src?: string | null;
  alt: string;
  width?: number;
  lines: SceneLineVisual[];
  pointerFrom?: { x: number; y: number } | null;
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

  let pointerStyle: CSSProperties | null = null;
  if (hasActiveBox && active?.box && pointerFrom) {
    const px = boxToPixels(active.box, width, height);
    const x1 = pointerFrom.x * width;
    const y1 = pointerFrom.y * height;
    const x2 = px.left + px.width / 2;
    const y2 = px.top + px.height / 2;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
    pointerStyle = {
      position: 'absolute',
      left: x1,
      top: y1,
      width: len,
      height: 2,
      transformOrigin: '0 50%',
      transform: `rotate(${angle}deg)`,
    };
  }

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

      {pointerStyle ? (
        <div
          className="pointer-events-none absolute z-10 bg-primary"
          style={pointerStyle}
          data-testid="scene-pointer"
          aria-hidden
        />
      ) : null}

      {lines.map((line, i) => {
        if (!line.box) return null;
        const isActive = Boolean(line.active);
        const isRevealed = Boolean(line.revealed);
        // Future lines: draw nothing (§3.2b rule 5).
        if (!isActive && !isRevealed) return null;

        const n = line.index ?? i + 1;
        const px = boxToPixels(line.box, width, height);
        const cxPct = ((px.left + px.width / 2) / width) * 100;
        const cyPct = ((px.top + px.height / 2) / height) * 100;
        const label = line.label?.trim() ?? '';

        if (isRevealed && !isActive) {
          return (
            <div
              key={i}
              className="pointer-events-none absolute z-10 flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-primary/85 text-[9px] font-bold text-on-primary shadow"
              style={{ left: `${cxPct}%`, top: `${cyPct}%` }}
              data-testid="scene-revealed-dot"
            >
              {toArDigits(n)}
            </div>
          );
        }

        return (
          <div
            key={i}
            className="pointer-events-none absolute z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
            style={{ left: `${cxPct}%`, top: `${cyPct}%` }}
            data-testid="scene-active-ring"
          >
            {label ? (
              <div className="mb-1 flex items-center gap-1 rounded-full bg-primary px-3 py-1 text-on-primary shadow-md">
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
              <div className="absolute h-16 w-16 animate-ping rounded-full bg-primary/25" />
              <div className="relative flex h-14 w-14 items-center justify-center rounded-full bg-surface-container-lowest/90 shadow-md">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-sm font-bold text-on-primary">
                  {toArDigits(n)}
                </div>
              </div>
            </div>
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
