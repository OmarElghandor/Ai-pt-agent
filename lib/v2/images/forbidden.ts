import { SCENE_POSE_AVOID } from './shotPlan';

/** Shared bans for every image kind. */
export const IMAGE_FORBIDDEN_BASE = [
  'symbolic shortcuts (smiling sun, sleeping person for good night)',
  'faces on objects or the sun',
  'icons or symbols inside speech bubbles',
  'speech bubbles',
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

/** Scene/action only — people need a setting (19 §3). */
export const IMAGE_FORBIDDEN_SCENE_EXTRA = [
  'isolated sticker characters with no setting',
] as const;

/** Object only — the thing alone on white paper (19 §3). */
export const IMAGE_FORBIDDEN_OBJECT_EXTRA = [
  'people',
  'hands',
  'faces',
  'background scenery',
  'tabletop scenes',
  'room interiors',
  'writing on packets, jars or labels',
] as const;

/** @deprecated Prefer IMAGE_FORBIDDEN_BASE + kind extras via mergeMustAvoid. */
export const IMAGE_FORBIDDEN = [
  ...IMAGE_FORBIDDEN_BASE,
  ...IMAGE_FORBIDDEN_SCENE_EXTRA,
] as const;

export type MustAvoidKind = 'object' | 'action' | 'scene' | 'story_panel' | 'emotion' | 'place';

export function mergeMustAvoid(
  value: string | string[] | undefined,
  opts?: { scene?: boolean; kind?: MustAvoidKind },
): string[] {
  const base = !value
    ? []
    : Array.isArray(value)
      ? value
      : value.split(',').map((s) => s.trim()).filter(Boolean);
  const out = [...base];

  const kind =
    opts?.kind ??
    (opts?.scene === true
      ? 'scene'
      : opts?.scene === false
        ? 'object'
        : undefined);

  let extra: readonly string[];
  if (kind === 'object') {
    extra = [...IMAGE_FORBIDDEN_BASE, ...IMAGE_FORBIDDEN_OBJECT_EXTRA];
  } else if (
    kind === 'scene' ||
    kind === 'story_panel' ||
    opts?.scene === true
  ) {
    extra = [
      ...IMAGE_FORBIDDEN_BASE,
      ...IMAGE_FORBIDDEN_SCENE_EXTRA,
      ...SCENE_POSE_AVOID,
    ];
  } else if (kind === 'action' || kind === 'emotion' || kind === 'place') {
    extra = [...IMAGE_FORBIDDEN_BASE, ...IMAGE_FORBIDDEN_SCENE_EXTRA];
  } else {
    // Legacy default: full scene-style list (decks / micro that omit opts).
    extra = [...IMAGE_FORBIDDEN_BASE, ...IMAGE_FORBIDDEN_SCENE_EXTRA];
  }

  for (const f of extra) {
    if (!out.some((x) => x.toLowerCase() === f.toLowerCase())) out.push(f);
  }
  return out;
}
