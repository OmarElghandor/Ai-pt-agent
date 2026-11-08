import { readFileSync } from 'node:fs';
import path from 'node:path';
import { itemIntroducedDayMap } from '@/lib/v2/convo/level/itemDays';
import { loadCoreItemsFile } from '@/lib/v2/generation/lesson/coreItems';

let commonWords: Set<string> | null = null;
let tlToItemDay: Map<string, number> | null = null;

function normalizeToken(w: string): string {
  return w
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
}

export function loadCommonWords(): Set<string> {
  if (commonWords) return commonWords;
  const filePath = path.join(
    process.cwd(),
    'content/v2/convo/common-words.pt-PT.json',
  );
  const raw = JSON.parse(readFileSync(filePath, 'utf8')) as {
    words?: string[];
  };
  commonWords = new Set(
    (raw.words ?? []).map((w) => normalizeToken(w)).filter(Boolean),
  );
  return commonWords;
}

function surfaceToDayMap(): Map<string, number> {
  if (tlToItemDay) return tlToItemDay;
  const map = new Map<string, number>();
  const itemDays = itemIntroducedDayMap();
  const file = loadCoreItemsFile();
  for (const day of file.days) {
    for (const item of day.core_items) {
      const introduced = itemDays.get(item.id) ?? day.day;
      for (const surface of [
        item.tl,
        ...(item.variant_tl ?? []),
        item.tl_f,
      ]) {
        if (!surface) continue;
        for (const tok of surface.split(/\s+/)) {
          const n = normalizeToken(tok);
          if (!n) continue;
          const prev = map.get(n);
          if (prev == null || introduced < prev) map.set(n, introduced);
        }
      }
    }
  }
  tlToItemDay = map;
  return map;
}

/** Content-word tokens in a PT reply (skip empties). */
export function tokenizeContentWords(text: string): string[] {
  return text
    .split(/\s+/)
    .map(normalizeToken)
    .filter((t) => t.length > 1 || /[a-záàâãéêíóôõúç]/i.test(t));
}

export type LevelGuardResult = {
  ok: boolean;
  offLevel: string[];
};

/**
 * At most 2 content words outside studied items + common words + extras.
 */
export function checkReplyLevel(opts: {
  text: string;
  level: number;
  /** Extra allowed surfaces (topic required items / goal examples). */
  extraAllowed?: ReadonlyArray<string>;
}): LevelGuardResult {
  const common = loadCommonWords();
  const surfaces = surfaceToDayMap();
  const extra = new Set(
    (opts.extraAllowed ?? [])
      .flatMap((s) => s.split(/\s+/))
      .map(normalizeToken)
      .filter(Boolean),
  );
  const off: string[] = [];
  for (const tok of tokenizeContentWords(opts.text)) {
    if (common.has(tok)) continue;
    if (extra.has(tok)) continue;
    const day = surfaces.get(tok);
    if (day != null && day <= opts.level) continue;
    // Unknown short function-like tokens: allow if ≤3 letters and in common-ish
    if (day == null && tok.length <= 2) continue;
    if (!off.includes(tok)) off.push(tok);
  }
  return { ok: off.length <= 2, offLevel: off };
}

export function resetLevelGuardCaches(): void {
  commonWords = null;
  tlToItemDay = null;
}
