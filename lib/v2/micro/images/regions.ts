/**
 * Scene region boxes as fractions of the image (19 §3.3b / M3).
 */

export type RegionBox = { x: number; y: number; w: number; h: number };

export type RegionVisionResult = {
  hint: string;
  box: RegionBox | null;
  flagged: boolean;
};

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

export function normaliseBox(raw: {
  x: number;
  y: number;
  w: number;
  h: number;
}): RegionBox {
  const x = clamp01(raw.x);
  const y = clamp01(raw.y);
  const w = clamp01(raw.w);
  const h = clamp01(raw.h);
  return {
    x,
    y,
    w: Math.min(w, 1 - x),
    h: Math.min(h, 1 - y),
  };
}

export function isValidFractionBox(box: RegionBox): boolean {
  return (
    box.x >= 0 &&
    box.y >= 0 &&
    box.w > 0 &&
    box.h > 0 &&
    box.x + box.w <= 1.0001 &&
    box.y + box.h <= 1.0001
  );
}

/** Pixel placement from fractions — same spot at any container width. */
export function boxToPixels(
  box: RegionBox,
  width: number,
  height: number,
): { left: number; top: number; width: number; height: number } {
  return {
    left: box.x * width,
    top: box.y * height,
    width: box.w * width,
    height: box.h * height,
  };
}

export type VisionCaller = (args: {
  imageUrl: string;
  hints: string[];
}) => Promise<Array<{ hint: string; box?: RegionBox | null }>>;

/**
 * Map vision output to boxes; missing → flagged (blocks publish).
 */
export function applyVisionBoxes(
  hints: string[],
  vision: Array<{ hint: string; box?: RegionBox | null }>,
): RegionVisionResult[] {
  return hints.map((hint) => {
    const hit = vision.find(
      (v) => v.hint.trim().toLowerCase() === hint.trim().toLowerCase(),
    );
    if (!hit?.box) {
      return { hint, box: null, flagged: true };
    }
    const box = normaliseBox(hit.box);
    if (!isValidFractionBox(box)) {
      return { hint, box: null, flagged: true };
    }
    return { hint, box, flagged: false };
  });
}

/** Publish blocked if any scene line lacks a valid box. */
export function canPublishSceneLines(
  lines: Array<{ box?: RegionBox | null; box_flagged?: boolean }>,
): boolean {
  return lines.every((l) => l.box && !l.box_flagged && isValidFractionBox(l.box));
}
