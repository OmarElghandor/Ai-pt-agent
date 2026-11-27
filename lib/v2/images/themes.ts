import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { TimeOfDay } from './shotPlan';

export type ThemeTime = 'morning' | 'day' | 'evening' | 'night';

export type ImageTheme = {
  id: string;
  name_ar: string;
  colours: string;
  light: string;
  times: ThemeTime[];
};

type ThemesFile = {
  version: number;
  themes: ImageTheme[];
};

let cached: ImageTheme[] | null = null;

function themesPath(): string {
  return path.join(process.cwd(), 'content/v2/image-themes.json');
}

export function loadImageThemes(filePath?: string): ImageTheme[] {
  if (!filePath && cached) return cached;
  const raw = JSON.parse(
    readFileSync(filePath ?? themesPath(), 'utf8'),
  ) as ThemesFile;
  const themes = Array.isArray(raw.themes) ? raw.themes : [];
  if (!filePath) cached = themes;
  return themes;
}

export function resetImageThemesCache(): void {
  cached = null;
}

export function getImageTheme(
  id: string | undefined | null,
  filePath?: string,
): ImageTheme | null {
  if (!id?.trim()) return null;
  return loadImageThemes(filePath).find((t) => t.id === id.trim()) ?? null;
}

/** Map lesson TimeOfDay / prompt cues onto theme `times` slots. */
export function themeTimesForMoment(
  moment: TimeOfDay | ThemeTime | string | undefined,
): ThemeTime[] {
  const m = (moment ?? 'day').toLowerCase();
  if (m === 'morning') return ['morning'];
  if (m === 'afternoon' || m === 'daytime' || m === 'day') return ['day'];
  if (m === 'evening') return ['evening', 'night'];
  if (m === 'night') return ['night'];
  return ['day'];
}

/** Infer theme time slot from prompt / light / item id+tl. */
export function inferThemeTime(opts: {
  prompt?: string;
  light?: string;
  itemId?: string;
  tl?: string;
  timeOfDay?: TimeOfDay | null;
}): ThemeTime {
  const blob = `${opts.itemId ?? ''} ${opts.tl ?? ''} ${opts.prompt ?? ''} ${opts.light ?? ''}`.toLowerCase();
  if (
    /boa\s*noite|good[_\s-]?night|\bnight\b|\bdusk\b|street\s*light|lamp\s*light|about 9\s*pm|9 pm/.test(
      blob,
    )
  ) {
    return 'night';
  }
  if (
    /boa\s*tarde|good[_\s-]?afternoon|\bafternoon\b|\bevening\b|golden-hour|3 pm|leaving work/.test(
      blob,
    )
  ) {
    if (/boa\s*tarde|good[_\s-]?afternoon|\bafternoon\b|3 pm/.test(blob)) {
      return 'day';
    }
    return 'evening';
  }
  if (
    /bom\s*dia|good[_\s-]?morning|\bmorning\b|8:30|early morning|sunrise/.test(
      blob,
    )
  ) {
    return 'morning';
  }
  if (opts.timeOfDay) {
    const mapped = themeTimesForMoment(opts.timeOfDay);
    return mapped[0] ?? 'day';
  }
  return 'day';
}

function themeAllowsTime(theme: ImageTheme, time: ThemeTime): boolean {
  if (theme.times.includes(time)) return true;
  // night moments may use evening-capable themes when night is listed with evening
  if (time === 'night' && theme.times.includes('evening')) return true;
  if (time === 'evening' && theme.times.includes('night')) return true;
  return false;
}

export type PickThemeOpts = {
  /** Authored theme wins when valid for the moment. */
  authored?: string | null;
  /** Already used in this lesson (no duplicates). */
  usedInLesson: ReadonlySet<string>;
  /** Theme of the previous image in flow order (no adjacent dupes). */
  previousTheme?: string | null;
  /** Moment time the theme must allow. */
  time: ThemeTime;
  /** Deterministic seed for stable picks in tests (optional). */
  random?: () => number;
  filePath?: string;
};

/**
 * Pick a colour theme under 19 §4 rules.
 * Returns null only when no theme fits (should not happen with the twelve themes).
 */
export function pickImageTheme(opts: PickThemeOpts): string | null {
  const themes = loadImageThemes(opts.filePath);
  const rnd = opts.random ?? Math.random;

  if (opts.authored?.trim()) {
    const hit = themes.find((t) => t.id === opts.authored!.trim());
    if (hit && themeAllowsTime(hit, opts.time)) return hit.id;
  }

  const eligible = themes.filter((t) => {
    if (!themeAllowsTime(t, opts.time)) return false;
    if (opts.usedInLesson.has(t.id)) return false;
    if (opts.previousTheme && t.id === opts.previousTheme) return false;
    return true;
  });

  const pool =
    eligible.length > 0
      ? eligible
      : themes.filter((t) => themeAllowsTime(t, opts.time));

  if (pool.length === 0) return themes[0]?.id ?? null;
  const idx = Math.floor(rnd() * pool.length);
  return pool[Math.min(idx, pool.length - 1)]!.id;
}

/** One prompt line for scene/action images. */
export function themePromptLine(themeId: string | undefined | null): string | null {
  const theme = getImageTheme(themeId ?? undefined);
  if (!theme) return null;
  return `Colour theme: ${theme.colours}. Light: ${theme.light}.`;
}

/**
 * Assign themes across a lesson's people images (scene/action).
 * Mutates specs that need a theme; keeps existing/authored when set.
 * Objects are left without a theme.
 */
export function assignThemesToSpecs<
  T extends {
    type: string;
    theme?: string;
    light?: string;
    subject?: string;
    intent?: string;
    key?: string;
  },
>(
  specs: T[],
  opts?: {
    timeForSpec?: (spec: T, index: number) => ThemeTime;
    random?: () => number;
    filePath?: string;
  },
): T[] {
  const used = new Set<string>();
  let previous: string | null = null;
  const out: T[] = [];

  for (let i = 0; i < specs.length; i++) {
    const spec = specs[i]!;
    if (spec.type === 'object' || spec.type === 'place') {
      const { theme: _drop, ...rest } = spec as T & { theme?: string };
      out.push(rest as T);
      continue;
    }
    if (spec.type !== 'scene' && spec.type !== 'action' && spec.type !== 'story_panel' && spec.type !== 'emotion') {
      out.push(spec);
      continue;
    }

    const time =
      opts?.timeForSpec?.(spec, i) ??
      inferThemeTime({
        prompt: spec.subject,
        light: spec.light,
        itemId: spec.key,
        tl: spec.intent,
      });

    const existingTheme = spec.theme;
    const pickedTheme: string | null =
      existingTheme && getImageTheme(existingTheme, opts?.filePath)
        ? existingTheme
        : pickImageTheme({
            authored: existingTheme,
            usedInLesson: used,
            previousTheme: previous,
            time,
            random: opts?.random,
            filePath: opts?.filePath,
          });

    if (pickedTheme) {
      used.add(pickedTheme);
      previous = pickedTheme;
      out.push({ ...spec, theme: pickedTheme });
    } else {
      out.push(spec);
    }
  }
  return out;
}
