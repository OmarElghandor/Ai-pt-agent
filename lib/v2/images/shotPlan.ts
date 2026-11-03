import { z } from 'zod';

export const SHOT_TYPES = [
  'close_two_shot',
  'over_shoulder',
  'medium',
  'wide',
] as const;

export type ShotType = (typeof SHOT_TYPES)[number];

export const TIME_OF_DAY = [
  'morning',
  'afternoon',
  'evening',
  'daytime',
] as const;

export type TimeOfDay = (typeof TIME_OF_DAY)[number];

export const SPOTS = [
  'entrance',
  'desk',
  'coffee_machine',
  'lift',
  'street_outside',
  'reception',
  'corridor',
  'meeting_door',
] as const;

export const INTERACTIONS = [
  'handshake',
  'wave_distance',
  'hand_on_shoulder',
  'offer_coffee',
  'hold_door',
  'nod_smile',
  'high_five_light',
  'point_badge',
] as const;

export const ShotPlanRowSchema = z.object({
  key: z.string(),
  moment: z.string(),
  spot: z.string(),
  shot: z.enum(SHOT_TYPES),
  interaction: z.string(),
  emotion: z.string(),
  detail_prop: z.string(),
  time_of_day: z.enum(TIME_OF_DAY),
});

export type ShotPlanRow = z.infer<typeof ShotPlanRowSchema>;

export const SCENE_POSE_AVOID = [
  'both people facing the camera',
  'people standing side by side',
  'one person walking past',
  'tiny faces',
  'identical poses',
] as const;

export function lightForTime(time: TimeOfDay, place: string): string {
  switch (time) {
    case 'morning':
      return `bright morning daylight at ${place}`;
    case 'afternoon':
      return `warm afternoon light at ${place}`;
    case 'evening':
      return `soft evening / night street lights outside ${place}, coats on`;
    case 'daytime':
    default:
      return `clear daytime indoor light at ${place}`;
  }
}

export function framingForShot(shot: ShotType): string {
  switch (shot) {
    case 'close_two_shot':
      return 'close two-shot, waist-up, faces large and readable';
    case 'over_shoulder':
      return 'over-the-shoulder, one face large, other person across';
    case 'medium':
      return 'medium shot, waist-up, expressive faces';
    case 'wide':
      return 'wide full-body establishing shot';
  }
}

export function tripleKey(row: Pick<ShotPlanRow, 'spot' | 'shot' | 'interaction'>): string {
  return `${row.spot.trim().toLowerCase()}|${row.shot}|${row.interaction.trim().toLowerCase()}`;
}

export function findShotPlanConflicts(rows: ShotPlanRow[]): string[] {
  const seen = new Map<string, string>();
  const conflicts: string[] = [];
  let wideCount = 0;
  for (const row of rows) {
    if (row.shot === 'wide') {
      wideCount += 1;
      if (wideCount > 1) conflicts.push(`${row.key}:extra_wide`);
    }
    const t = tripleKey(row);
    const prev = seen.get(t);
    if (prev) conflicts.push(`${prev}+${row.key}:${t}`);
    else seen.set(t, row.key);
  }
  return conflicts;
}

function normalizeShot(raw: string | undefined, preferWide: boolean): ShotType {
  const s = (raw ?? '').toLowerCase().replace(/[-\s]+/g, '_');
  if (s.includes('over') && s.includes('shoulder')) return 'over_shoulder';
  if (s.includes('close')) return 'close_two_shot';
  if (s.includes('wide')) return preferWide ? 'wide' : 'medium';
  if (s.includes('medium')) return 'medium';
  return 'close_two_shot';
}

/** Fix conflicts by rotating spot/shot/interaction from fixed lists. Max one wide. */
export function autoRotateShotPlan(
  rows: ShotPlanRow[],
  keysInOrder: string[],
): ShotPlanRow[] {
  const byKey = new Map(rows.map((r) => [r.key, { ...r }]));
  const usedTriples = new Set<string>();
  let wideUsed = false;
  const out: ShotPlanRow[] = [];

  keysInOrder.forEach((key, i) => {
    const base =
      byKey.get(key) ??
      ({
        key,
        moment: 'a greeting moment',
        spot: SPOTS[i % SPOTS.length]!,
        shot: 'close_two_shot' as ShotType,
        interaction: INTERACTIONS[i % INTERACTIONS.length]!,
        emotion: 'warm smile',
        detail_prop: 'visitor badge',
        time_of_day: 'daytime' as TimeOfDay,
      } satisfies ShotPlanRow);

    let shot = normalizeShot(base.shot, !wideUsed);
    if (shot === 'wide') {
      if (wideUsed) shot = i % 2 === 0 ? 'close_two_shot' : 'medium';
      else wideUsed = true;
    }

    let spot = base.spot || SPOTS[i % SPOTS.length]!;
    let interaction = base.interaction || INTERACTIONS[i % INTERACTIONS.length]!;
    let attempts = 0;
    while (usedTriples.has(tripleKey({ spot, shot, interaction })) && attempts < 24) {
      spot = SPOTS[(i + attempts) % SPOTS.length]!;
      interaction = INTERACTIONS[(i + attempts * 3) % INTERACTIONS.length]!;
      if (shot === 'wide' && wideUsed && attempts > 0) {
        shot = attempts % 2 === 0 ? 'over_shoulder' : 'medium';
      }
      attempts += 1;
    }
    usedTriples.add(tripleKey({ spot, shot, interaction }));
    if (shot === 'wide') wideUsed = true;

    out.push({
      ...base,
      key,
      spot,
      shot,
      interaction,
    });
  });

  return out;
}

export function isShotPlanValid(rows: ShotPlanRow[]): boolean {
  return findShotPlanConflicts(rows).length === 0;
}
