import { SCENE_POSE_AVOID } from './shotPlan';

/** Always appended to must_avoid and the image prompt. */
export const IMAGE_FORBIDDEN = [
  'symbolic shortcuts (smiling sun, sleeping person for good night)',
  'faces on objects or the sun',
  'icons or symbols inside speech bubbles',
  'speech bubbles',
  'isolated sticker characters with no setting',
  'text',
  'letters',
  'numbers',
  'watermarks',
  'logos',
  'recognisable landmarks',
  'city skylines',
  'trams',
  'decorative tiles',
  'flags',
  'national symbols',
  'readable signage',
] as const;

export function mergeMustAvoid(
  value: string | string[] | undefined,
  opts?: { scene?: boolean },
): string[] {
  const base = !value
    ? []
    : Array.isArray(value)
      ? value
      : value.split(',').map((s) => s.trim()).filter(Boolean);
  const out = [...base];
  const extra = opts?.scene
    ? [...IMAGE_FORBIDDEN, ...SCENE_POSE_AVOID]
    : [...IMAGE_FORBIDDEN];
  for (const f of extra) {
    if (!out.some((x) => x.toLowerCase() === f.toLowerCase())) out.push(f);
  }
  return out;
}
