import type { ConvoSession } from '@/lib/v2/convo/session/types';
import type { SceneLine } from '@/lib/v2/convo/goals/types';

/** Resolve female learner variants on an authored line. */
export function resolveSceneLineGender(
  line: SceneLine | null | undefined,
  gender: 'm' | 'f' | undefined,
): SceneLine | null {
  if (!line?.tl?.trim()) return null;
  if (gender === 'f') {
    return {
      tl: line.tl_f?.trim() || line.tl,
      ar: line.ar_f?.trim() || line.ar,
    };
  }
  return { tl: line.tl, ar: line.ar };
}

/** Pick the next variant from `lines`, advance the session counter, wrap around. */
export function pickVariantLine(
  session: ConvoSession,
  key: string,
  lines: SceneLine[] | undefined,
  gender?: 'm' | 'f',
): SceneLine | null {
  if (!lines?.length) return null;
  const counters = session.scene_variant_counters ?? {};
  const idx = counters[key] ?? 0;
  const line = lines[idx % lines.length]!;
  session.scene_variant_counters = {
    ...counters,
    [key]: idx + 1,
  };
  return resolveSceneLineGender(line, gender);
}

export function joinLines(
  a: SceneLine | null | undefined,
  b: SceneLine | null | undefined,
): SceneLine | null {
  if (!a?.tl?.trim() && !b?.tl?.trim()) return null;
  if (!a?.tl?.trim()) return b ? { tl: b.tl, ar: b.ar } : null;
  if (!b?.tl?.trim()) return { tl: a.tl, ar: a.ar };
  return {
    tl: `${a.tl.trim()} ${b.tl.trim()}`,
    ar: `${(a.ar ?? '').trim()} ${(b.ar ?? '').trim()}`.trim(),
  };
}
