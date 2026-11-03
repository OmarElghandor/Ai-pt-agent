import type { Item } from '@/lib/v2/content/items';
import type { StoryDoc, StoryLine } from '@/lib/v2/content/story';
import type { CoreItem } from './coreItems';
import { resolveGrammarFocusPatternIds } from './grammarFocus';
import { CHARACTERS } from '../lists';
import {
  contentTokensFromTl,
  functionWordSets,
  type FunctionWordSets,
} from './functionWords';
import { resolvePatternKind, type PatternKind } from './patternTemplates';
import { castNameTokens } from './storyAllowed';
import { normToken, tokenizeTl } from './storyTokens';
import type { MustCoverEntry } from './mustCover';
import { fatal, fix, warning, type TierIssue } from './tiers';

const CAST_IDS = new Set(
  CHARACTERS.split('\n')
    .map((line) => line.split('—')[0]?.trim().toLowerCase())
    .filter(Boolean) as string[],
);

const ARTICLE_DEF = new Set(['o', 'a']);
const ARTICLE_INDEF = new Set(['um', 'uma']);
const ARTICLE_PL = new Set(['os', 'as']);
const ARTICLE_PREFIX_RE = /^(o|a|os|as|um|uma|uns|umas)\s+/i;

function parentPatternId(id: string): string | null {
  const m = id.match(/^(pattern\..+)\.ex\.\d+$/);
  return m?.[1] ?? null;
}

function itemTl(item: Item | undefined): string {
  if (!item || !('tl' in item) || typeof item.tl !== 'string') return '';
  return item.tl;
}

function stripArticle(tl: string): string {
  return tl.replace(ARTICLE_PREFIX_RE, '').trim();
}

/** Latin-script speakable tokens (skip Arabic / length-1 articles). */
function speakableTokens(tl: string): string[] {
  return tokenizeTl(tl)
    .map(normToken)
    .filter((t) => t.length > 1 && /^[a-z0-9\-]+$/i.test(t));
}

function nounSurfaces(
  coreItems: CoreItem[],
  itemsById: Map<string, Item>,
): { singular: Set<string>; plural: Set<string> } {
  const singular = new Set<string>();
  const plural = new Set<string>();
  const addWord = (tl: string, pluralTl?: string | null) => {
    const bare = stripArticle(tl);
    for (const t of speakableTokens(bare || tl)) singular.add(t);
    if (pluralTl) {
      for (const t of speakableTokens(stripArticle(pluralTl) || pluralTl)) {
        plural.add(t);
      }
    }
  };
  for (const c of coreItems) {
    if (c.kind !== 'word') continue;
    addWord(c.tl, c.plural_tl);
  }
  for (const item of itemsById.values()) {
    if (item.type !== 'word') continue;
    const tl = itemTl(item);
    if (!tl) continue;
    const pl =
      'plural_tl' in item
        ? (item as { plural_tl?: string | null }).plural_tl
        : undefined;
    addWord(tl, pl);
  }
  return { singular, plural };
}

function patternKindForCore(
  core: CoreItem,
  itemsById: Map<string, Item>,
): PatternKind | null {
  const item = itemsById.get(core.id);
  const kindFromItem =
    item && item.type === 'pattern' && 'kind' in item
      ? (item as { kind?: string }).kind
      : undefined;
  return resolvePatternKind(core.id, core.pattern_kind ?? kindFromItem);
}

/**
 * True when the line uses this pattern via ids, bank examples, or kind surfaces.
 * Does not use mixed Arabic template tl as a speakable needle.
 */
export function lineCoversItem(
  line: StoryLine,
  core: CoreItem,
  itemsById: Map<string, Item>,
  coreItems: CoreItem[] = [],
): boolean {
  const ids = line.ids ?? [];
  if (ids.includes(core.id)) return true;
  if (core.kind === 'pattern') {
    if (ids.some((id) => id === core.id || id.startsWith(`${core.id}.ex.`))) {
      return true;
    }
    if (patternSurfaceCovers(line, core, itemsById, coreItems)) return true;
    return false;
  }

  const coreItem = itemsById.get(core.id);
  const needle = normToken(itemTl(coreItem) || core.tl);
  if (!needle) return false;
  const hay = normToken(line.tl);
  if (hay.includes(needle)) return true;
  const surfaces = [itemTl(coreItem) || core.tl];
  if (core.plural_tl) surfaces.push(core.plural_tl);
  for (const s of surfaces) {
    const tokens = tokenizeTl(s).map(normToken);
    if (tokens.some((t) => t.length > 1 && hay.includes(t))) return true;
  }
  return false;
}

function patternSurfaceCovers(
  line: StoryLine,
  core: CoreItem,
  itemsById: Map<string, Item>,
  coreItems: CoreItem[],
): boolean {
  const hay = normToken(line.tl);
  const tokens = new Set(tokenizeTl(line.tl).map(normToken));

  // Bank examples: pattern.<id>.ex.N whose tl appears in the line
  for (const [id, item] of itemsById) {
    if (!id.startsWith(`${core.id}.ex.`)) continue;
    const tl = itemTl(item);
    if (!tl.trim()) continue;
    const exNorm = normToken(tl);
    if (exNorm.length > 2 && hay.includes(exNorm)) return true;
    const exSpeak = speakableTokens(tl);
    if (
      exSpeak.length > 0 &&
      exSpeak.every((t) => tokens.has(t) || hay.includes(t))
    ) {
      return true;
    }
  }

  const kind = patternKindForCore(core, itemsById);
  const { singular, plural } = nounSurfaces(coreItems, itemsById);
  const hasNoun = [...singular].some((n) => tokens.has(n) || hay.includes(n));
  const hasPlural = [...plural].some((n) => tokens.has(n) || hay.includes(n));

  if (kind === 'article_def') {
    return [...ARTICLE_DEF].some((a) => tokens.has(a)) && hasNoun;
  }
  if (kind === 'article_indef') {
    return [...ARTICLE_INDEF].some((a) => tokens.has(a)) && hasNoun;
  }
  if (kind === 'plural_def') {
    return [...ARTICLE_PL].some((a) => tokens.has(a)) && hasPlural;
  }
  if (kind === 'polite_request') {
    return tokens.has('queria') || hay.includes('queria');
  }

  // Unknown kind: Latin tokens from core/item tl (e.g. Chamo-me)
  const coreItem = itemsById.get(core.id);
  const speak = speakableTokens(itemTl(coreItem) || core.tl);
  return speak.some((t) => tokens.has(t) || hay.includes(t));
}

/** Ids whose TL tokens appear in this sentence (surface match). */
function idsForSentence(
  sentence: string,
  ids: string[],
  itemsById: Map<string, Item>,
): string[] {
  const sentTokens = new Set(tokenizeTl(sentence).map(normToken));
  const kept: string[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) continue;
    const item = itemsById.get(id);
    const tokens = tokenizeTl(itemTl(item)).map(normToken);
    if (!tokens.length) {
      // Patterns / unknown: keep on every piece that already had them only if
      // id starts with pattern. — attach to first sentence via caller.
      if (id.startsWith('pattern.')) continue;
      kept.push(id);
      seen.add(id);
      continue;
    }
    const hit = tokens.some(
      (t) =>
        sentTokens.has(t) ||
        [...sentTokens].some((lt) => lt.includes(t) || t.includes(lt)),
    );
    if (hit) {
      kept.push(id);
      seen.add(id);
    }
  }
  return kept;
}

/**
 * Drop unknown / unmatched ids; strip "/"; normalize punct; split multi-sentence;
 * drop invalid replies_to. Promote pattern.*.ex.N → parent; auto-tag covered patterns.
 */
export function autoFixStoryLines(
  lines: StoryLine[],
  itemsById: Map<string, Item>,
  opts?: {
    allowedTokens?: Set<string>;
    coreItems?: CoreItem[];
    /** Extra ids treated as known (core ids not yet in the bank). */
    knownIds?: Set<string>;
  },
): { lines: StoryLine[]; fixes: TierIssue[] } {
  const fixes: TierIssue[] = [];
  const allowed = opts?.allowedTokens;
  const coreItems = opts?.coreItems ?? [];
  const patternCores = coreItems.filter((c) => c.kind === 'pattern');
  const knownIds = opts?.knownIds ?? new Set<string>();

  const normalized: StoryLine[] = [];
  for (const [i, line] of lines.entries()) {
    let tl = line.tl
      .replace(/\s+/g, ' ')
      .replace(/\s+([,.!?…])/g, '$1')
      .trim();
    if (tl !== line.tl) {
      fixes.push(fix(`lines[${i}].tl`, 'normalize_punct', 'normalized whitespace/punct'));
    }
    // Strip slash alternatives ("Adeus! / Tchau!" → "Adeus!")
    if (tl.includes('/')) {
      const parts = tl
        .split(/\s*\/\s*/)
        .map((p) => p.trim())
        .filter(Boolean);
      const stripped = (parts[0] ?? tl.replace(/\//g, ' ')).replace(/\s+/g, ' ').trim();
      if (stripped && stripped !== tl) {
        fixes.push(
          fix(`lines[${i}].tl`, 'strip_slash', `stripped "/" → "${stripped}"`),
        );
        tl = stripped;
      }
    }
    const lineTokens = new Set(tokenizeTl(tl).map(normToken));
    const keptIds: string[] = [];
    const seen = new Set<string>();

    for (const id of line.ids ?? []) {
      const parent = parentPatternId(id);
      if (parent) {
        if (!seen.has(parent)) {
          keptIds.push(parent);
          seen.add(parent);
          fixes.push(
            fix(`lines[${i}].ids`, 'pattern_ex_promote', `promoted ${id} → ${parent}`),
          );
        }
        continue;
      }
      if (seen.has(id)) continue;
      const item = itemsById.get(id);
      if (!item && !knownIds.has(id) && !coreItems.some((c) => c.id === id)) {
        fixes.push(fix(`lines[${i}].ids`, 'unknown_id', `dropped unknown ${id}`));
        continue;
      }
      const tokens = tokenizeTl(itemTl(item)).map(normToken);
      if (!tokens.length) {
        keptIds.push(id);
        seen.add(id);
        continue;
      }
      // Pattern roots: keep if surface/kind covers (don't require template tl in line)
      if (id.startsWith('pattern.') && item?.type === 'pattern') {
        const core: CoreItem = {
          id,
          kind: 'pattern',
          tl: itemTl(item),
          eg: '',
          pattern_kind:
            'kind' in item
              ? (item as { kind?: CoreItem['pattern_kind'] }).kind
              : undefined,
        };
        const draft = { ...line, tl, ids: keptIds };
        if (lineCoversItem(draft, core, itemsById, coreItems)) {
          keptIds.push(id);
          seen.add(id);
        } else {
          fixes.push(fix(`lines[${i}].ids`, 'id_not_in_line', `dropped ${id}`));
        }
        continue;
      }
      const hit = tokens.some(
        (t) =>
          lineTokens.has(t) ||
          [...lineTokens].some((lt) => lt.includes(t) || t.includes(lt)),
      );
      if (hit) {
        keptIds.push(id);
        seen.add(id);
      } else {
        fixes.push(fix(`lines[${i}].ids`, 'id_not_in_line', `dropped ${id}`));
      }
    }

    const draftLine: StoryLine = { ...line, tl, ids: keptIds };
    for (const core of patternCores) {
      if (seen.has(core.id)) continue;
      if (lineCoversItem(draftLine, core, itemsById, coreItems)) {
        keptIds.push(core.id);
        seen.add(core.id);
        fixes.push(
          fix(`lines[${i}].ids`, 'pattern_auto_tag', `tagged ${core.id}`),
        );
      }
    }

    let extra = line.extra;
    if (extra?.length && allowed) {
      const keptExtra = extra.filter((ex) => {
        const toks = tokenizeTl(ex.tl).map(normToken).filter(Boolean);
        const allAllowed =
          toks.length > 0 && toks.every((t) => allowed.has(t));
        if (allAllowed) {
          fixes.push(
            fix(
              `lines[${i}].extra`,
              'extra_was_allowed',
              `dropped allowed extra "${ex.tl}"`,
            ),
          );
          return false;
        }
        return true;
      });
      extra = keptExtra.length ? keptExtra : undefined;
    }

    const fixed: StoryLine = {
      ...line,
      tl,
      ids: keptIds,
      ...(extra ? { extra } : { extra: undefined }),
    };
    normalized.push(fixed);
  }

  // Split multi-sentence lines (prompt + enrich expect one sentence per line)
  const out: StoryLine[] = [];
  /** old normalized index → index of first piece in `out` */
  const firstPieceIndex: number[] = [];
  for (const [i, line] of normalized.entries()) {
    firstPieceIndex[i] = out.length;
    const parts = splitSentences(line.tl);
    if (parts.length <= 1) {
      out.push(line);
      continue;
    }
    fixes.push(
      fix(
        `lines[${i}].tl`,
        'split_multi_sentence',
        `split into ${parts.length} lines`,
      ),
    );
    const patternIds = (line.ids ?? []).filter((id) => id.startsWith('pattern.'));
    for (const [pi, sent] of parts.entries()) {
      const sentIds = idsForSentence(sent, line.ids ?? [], itemsById);
      // Patterns stay on pieces that cover them; else first piece
      for (const pid of patternIds) {
        if (sentIds.includes(pid)) continue;
        const item = itemsById.get(pid);
        const core = coreItems.find((c) => c.id === pid) ?? {
          id: pid,
          kind: 'pattern' as const,
          tl: itemTl(item),
          eg: '',
        };
        const draft: StoryLine = { ...line, tl: sent, ids: sentIds };
        if (lineCoversItem(draft, core, itemsById, coreItems)) {
          sentIds.push(pid);
        } else if (pi === 0) {
          sentIds.push(pid);
        }
      }
      out.push({
        speaker: line.speaker,
        tl: sent,
        ids: sentIds,
        // replies_to remapped below after all splits
        ...(pi === 0 && line.replies_to != null
          ? { replies_to: line.replies_to }
          : {}),
        ...(pi === 0 && line.extra?.length ? { extra: line.extra } : {}),
      });
    }
  }

  // Remap replies_to from pre-split indexes → first piece in `out`, then drop invalids.
  const remapped = out.map((line, i) => {
    if (line.replies_to == null) return line;
    const mapped = firstPieceIndex[line.replies_to];
    if (mapped == null || mapped >= i) {
      fixes.push(
        fix(
          `lines[${i}].replies_to`,
          'replies_to_invalid',
          `dropped replies_to ${line.replies_to}`,
        ),
      );
      const { replies_to: _drop, ...rest } = line;
      return rest;
    }
    const targetLine = out[mapped];
    if (!targetLine) {
      fixes.push(
        fix(
          `lines[${i}].replies_to`,
          'replies_to_invalid',
          `dropped replies_to ${line.replies_to}`,
        ),
      );
      const { replies_to: _drop, ...rest } = line;
      return rest;
    }
    const sp = line.speaker.trim().toLowerCase();
    const tsp = targetLine.speaker.trim().toLowerCase();
    if (sp === tsp) {
      fixes.push(
        fix(
          `lines[${i}].replies_to`,
          'replies_to_invalid',
          `dropped replies_to ${mapped} (same speaker)`,
        ),
      );
      const { replies_to: _drop, ...rest } = line;
      return rest;
    }
    return { ...line, replies_to: mapped };
  });

  return { lines: remapped, fixes };
}

export type StoryCheckContext = {
  story: Pick<StoryDoc, 'cast' | 'lines' | 'setting' | 'is_weekly' | 'scenes'>;
  coreItems: CoreItem[];
  items: Item[];
  /** Normalized allowed content tokens (prior + today + conjugations). */
  allowedTokens: Set<string>;
  grammarFocusId?: string;
  chatCharacter?: string;
  maxLineWords?: number;
  targetLang?: string;
  /** Code-built MUST_COVER list; coverage warnings check against this only. */
  mustCover?: MustCoverEntry[];
};

/** Structure-only fatals that trigger one retry (00 §4). */
export const STORY_STRUCTURE_FATAL_RULES = new Set([
  'unparseable',
  'line_count_min',
  'empty_tl',
  'invalid_speaker',
]);

export function isStoryStructureFatal(issue: TierIssue): boolean {
  return issue.tier === 'fatal' && STORY_STRUCTURE_FATAL_RULES.has(issue.rule);
}

export type StoryExtrasScan = {
  contentTokenCount: number;
  /** Unique offending surface tokens (normalized). */
  extraTokens: string[];
  /** Occurrence count of extras (drives %). */
  extraOccurrenceCount: number;
  extraPercent: number;
};

/** Scan line TLs: content tokens vs allowed; function words excluded from both. */
export function scanStoryExtras(opts: {
  lines: { tl: string }[];
  allowedTokens: Set<string>;
  castNames?: Set<string>;
  fw?: FunctionWordSets;
  lang?: string;
}): StoryExtrasScan {
  const fw = opts.fw ?? functionWordSets(opts.lang ?? 'pt-PT');
  const names = opts.castNames ?? new Set<string>();
  const extrasList: string[] = [];
  let content = 0;
  let extraOcc = 0;
  for (const line of opts.lines) {
    const toks = contentTokensFromTl(line.tl, fw, { excludeNames: names });
    for (const t of toks) {
      content += 1;
      if (!opts.allowedTokens.has(t)) {
        extraOcc += 1;
        extrasList.push(t);
      }
    }
  }
  return {
    contentTokenCount: content,
    extraTokens: [...new Set(extrasList)],
    extraOccurrenceCount: extraOcc,
    extraPercent: content > 0 ? extraOcc / content : 0,
  };
}

function maxLinesForDay(opts: {
  weekly: boolean;
  coreWordCount: number;
}): { min: number; max: number } {
  if (opts.weekly) return { min: 12, max: 20 };
  return { min: 6, max: opts.coreWordCount > 8 ? 12 : 10 };
}

/** Split TL/AR into sentence-like units on Latin or Arabic terminators. */
export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?…؟۔])\s+/u)
    .map((s) => s.trim())
    .filter(Boolean);
}

const TOD_GREETING_GROUP = 'greeting.time_of_day';

/**
 * Warning: two different time-of-day greetings as hellos in the same scene.
 * A greeting in the last two lines (farewell) is allowed and ignored.
 */
export function checkGreetingHelloCollision(
  lines: StoryLine[],
  coreItems: CoreItem[],
  itemsById: Map<string, Item>,
): TierIssue[] {
  const members = coreItems.filter(
    (c) => c.kind === 'phrase' && c.variant_group === TOD_GREETING_GROUP,
  );
  if (members.length < 2) return [];
  const farewellStart = Math.max(0, lines.length - 2);
  const helloIds = new Set<string>();
  const issues: TierIssue[] = [];
  for (const [i, line] of lines.entries()) {
    if (i >= farewellStart) continue;
    for (const m of members) {
      if (!lineCoversItem(line, m, itemsById, coreItems)) continue;
      if (helloIds.has(m.id)) continue;
      if (helloIds.size > 0 && ![...helloIds].includes(m.id)) {
        issues.push(
          warning(
            `lines[${i}]`,
            'greeting_hello_collision',
            `two time-of-day greetings as hellos: ${[...helloIds].join(', ')} and ${m.id}`,
          ),
        );
      }
      helloIds.add(m.id);
    }
  }
  return issues;
}

/**
 * High (review): character asks for info the learner already gave
 * (e.g. name after learner said Chamo-me …).
 */
export function checkInfoAlreadyGiven(
  lines: StoryLine[],
  story: Pick<StoryDoc, 'cast'>,
): TierIssue[] {
  const issues: TierIssue[] = [];
  let learnerNamed = false;
  const nameAskRe = /como\s+se\s+chama/i;
  const nameSayRe = /chamo-?me\s+\S+/i;

  for (const [i, line] of lines.entries()) {
    const sp = line.speaker.trim().toLowerCase();
    const isLearner =
      sp === 'learner' ||
      story.cast.some((c) => c.id.toLowerCase() === sp && c.role === 'learner');
    if (isLearner && nameSayRe.test(line.tl)) {
      learnerNamed = true;
      continue;
    }
    if (!isLearner && learnerNamed && nameAskRe.test(line.tl)) {
      issues.push(
        warning(
          `lines[${i}].tl`,
          'info_already_given',
          `[high] character asks for name after the learner already said it`,
        ),
      );
    }
  }
  return issues;
}

/**
 * Story checks after autofix.
 * Structure fatals (retry once): <4 lines, empty tl, unknown speaker.
 * Everything else is a warning in the review report (00 §4).
 */
export function checkStory(ctx: StoryCheckContext): TierIssue[] {
  const issues: TierIssue[] = [];
  const { story, coreItems, items, allowedTokens } = ctx;
  const itemsById = new Map(items.map((i) => [i.id, i]));
  const lines = story.lines;
  const weekly = Boolean(story.is_weekly);
  const coreWordCount = coreItems.filter((c) => c.kind === 'word').length;
  const { min: minLines, max: maxLines } = maxLinesForDay({
    weekly,
    coreWordCount,
  });

  // Structure fatal: fewer than 4 lines (hard floor). Soft band is 6–10 / weekly 12–20.
  if (lines.length < 4) {
    issues.push(
      fatal(
        'lines',
        'line_count_min',
        `need ≥4 lines, got ${lines.length}`,
      ),
    );
  } else if (lines.length < minLines || lines.length > maxLines) {
    issues.push(
      warning(
        'lines',
        'line_count',
        `aim ${minLines}–${maxLines} lines, got ${lines.length}`,
      ),
    );
  }

  const castIds = new Set(story.cast.map((c) => c.id.toLowerCase()));
  const speakerSet = new Set(
    ['learner', 'narrator', ...CAST_IDS, ...castIds].map((s) => s.toLowerCase()),
  );
  if (ctx.chatCharacter) speakerSet.add(ctx.chatCharacter.toLowerCase());

  if (!weekly) {
    const learners = story.cast.filter((c) => c.role === 'learner');
    const characters = story.cast.filter((c) => c.role === 'character');
    if (learners.length !== 1 || characters.length !== 1) {
      issues.push(
        warning(
          'cast',
          'cast_shape',
          'normal days need exactly one learner and one character',
        ),
      );
    }
    const people = story.cast.filter((c) => c.role !== 'narrator');
    if (people.length !== 2) {
      issues.push(
        warning(
          'cast',
          'speaker_count',
          'need exactly 2 speakers (plus optional narrator)',
        ),
      );
    }
  }

  for (const [i, line] of lines.entries()) {
    if (!line.tl?.trim()) {
      issues.push(
        fatal(`lines[${i}].tl`, 'empty_tl', `line ${i} has empty tl`),
      );
    }
    const sp = line.speaker.trim().toLowerCase();
    if (!speakerSet.has(sp) && !castIds.has(sp)) {
      issues.push(
        fatal(
          `lines[${i}].speaker`,
          'invalid_speaker',
          `unknown speaker ${line.speaker}`,
        ),
      );
    }
  }

  // Bare nouns — warning
  const fw = functionWordSets(ctx.targetLang ?? 'pt-PT');
  const wordTls = new Set(
    items
      .filter((i) => i.type === 'word')
      .map((i) => normToken(itemTl(i)))
      .filter(Boolean),
  );
  for (const [i, line] of lines.entries()) {
    const tokens = contentTokensFromTl(line.tl, fw);
    if (tokens.length === 1 && wordTls.has(tokens[0]!)) {
      issues.push(
        warning(
          `lines[${i}].tl`,
          'bare_noun',
          `"${line.tl}" is a bare noun — need a phrase or sentence`,
        ),
      );
    }
  }

  const maxWords = ctx.maxLineWords;
  if (maxWords != null) {
    for (const [i, line] of lines.entries()) {
      const n = tokenizeTl(line.tl).length;
      if (n > maxWords) {
        issues.push(
          warning(
            `lines[${i}].tl`,
            'line_too_long',
            `line has ${n} words (max ${maxWords}) — shorten`,
          ),
        );
      }
    }
  }

  // Slash should already be autofixed; leftover is a warning
  for (const [i, line] of lines.entries()) {
    if (line.tl.includes('/')) {
      issues.push(
        warning(
          `lines[${i}].tl`,
          'slash_in_tl',
          `story line still contains "/"`,
        ),
      );
    }
  }

  // AR: code owns it — missing / mismatch are warnings
  for (const [i, line] of lines.entries()) {
    const tlSentences = splitSentences(line.tl);
    const ar = (line.ar ?? '').trim();
    if (!ar) {
      issues.push(
        warning(
          `lines[${i}].ar`,
          'ar_missing',
          `line ${i} missing Arabic for "${line.tl}"`,
        ),
      );
      continue;
    }
    const arSentences = splitSentences(ar);
    if (arSentences.length < tlSentences.length) {
      issues.push(
        warning(
          `lines[${i}].ar`,
          'ar_sentence_mismatch',
          `line ${i}: tl has ${tlSentences.length} sentence(s) but ar has ${arSentences.length}`,
        ),
      );
    }
  }

  issues.push(...checkGreetingHelloCollision(lines, coreItems, itemsById));
  issues.push(...checkInfoAlreadyGiven(lines, story));

  // MUST_COVER coverage — warnings only
  const mustCover = ctx.mustCover;
  const missingIds: string[] = [];
  if (mustCover?.length) {
    for (const entry of mustCover) {
      const core =
        coreItems.find((c) => c.id === entry.id) ??
        ({
          id: entry.id,
          kind: entry.kind,
          tl: entry.tl,
          eg: '',
        } as CoreItem);
      const hit = lines.some((line) =>
        lineCoversItem(line, core, itemsById, coreItems),
      );
      if (!hit) {
        missingIds.push(entry.id);
        issues.push(
          warning(
            `coverage.${entry.id}`,
            'must_cover_missing',
            `missing must-cover: ${entry.id}`,
          ),
        );
      }
    }
  } else {
    // Fallback when caller didn't pass mustCover: phrases/patterns as warnings
    const coveredGroups = new Set<string>();
    for (const core of coreItems) {
      if (core.kind !== 'phrase' || !core.variant_group) continue;
      const hit = lines.some((line) =>
        lineCoversItem(line, core, itemsById, coreItems),
      );
      if (hit) coveredGroups.add(core.variant_group);
    }
    for (const core of coreItems) {
      if (core.kind !== 'word' && core.kind !== 'phrase' && core.kind !== 'pattern') {
        continue;
      }
      if (core.kind === 'phrase' && core.variant_group) {
        if (coveredGroups.has(core.variant_group)) continue;
        if (missingIds.includes(`group:${core.variant_group}`)) continue;
        missingIds.push(`group:${core.variant_group}`);
        issues.push(
          warning(
            `coverage.${core.variant_group}`,
            'must_cover_missing',
            `missing variant_group ${core.variant_group} (need ≥1 member)`,
          ),
        );
        continue;
      }
      const hit = lines.some((line) =>
        lineCoversItem(line, core, itemsById, coreItems),
      );
      if (!hit) {
        missingIds.push(core.id);
        issues.push(
          warning(
            `coverage.${core.id}`,
            core.kind === 'word' ? 'core_word_not_in_story' : 'must_cover_missing',
            core.kind === 'word' ? `missing word: ${core.id}` : `missing: ${core.id}`,
          ),
        );
      }
    }
  }

  // Grammar focus ≥ 2 lines — warning
  if (ctx.grammarFocusId) {
    const focus = ctx.grammarFocusId;
    const focusPatterns = resolveGrammarFocusPatternIds(focus, coreItems);
    const hits = lines.filter((line) => {
      const ids = line.ids ?? [];
      if (
        ids.includes(focus) ||
        ids.some((id) => id.startsWith(`${focus}.`) || parentPatternId(id) === focus)
      ) {
        return true;
      }
      return focusPatterns.some((pid) => {
        if (ids.includes(pid) || ids.some((id) => id.startsWith(`${pid}.ex.`))) {
          return true;
        }
        const core = coreItems.find((c) => c.id === pid) ?? {
          id: pid,
          kind: 'pattern' as const,
          tl: '',
          eg: '',
        };
        return lineCoversItem(line, core, itemsById, coreItems);
      });
    }).length;

    if (hits < 2) {
      issues.push(
        warning(
          'grammar_focus',
          'grammar_focus_twice',
          `grammar focus ${focus} used in ${hits} line(s), aim ≥2`,
        ),
      );
    }
  }

  for (const [i, line] of lines.entries()) {
    for (const [j, ex] of (line.extra ?? []).entries()) {
      if (!ex.ar?.trim()) {
        issues.push(
          warning(
            `lines[${i}].extra[${j}]`,
            'extra_unglossed',
            `extra "${ex.tl}" needs an Arabic gloss`,
          ),
        );
      }
    }
  }

  const castNames = castNameTokens(story.cast);
  const scan = scanStoryExtras({
    lines,
    allowedTokens,
    castNames,
    fw,
    lang: ctx.targetLang,
  });
  if (scan.contentTokenCount > 0 && scan.extraPercent > 0.15) {
    const listed = scan.extraTokens.slice(0, 20).join(', ');
    issues.push(
      warning(
        'extra',
        'extra_over_budget',
        `extra tokens: ${listed}${scan.extraTokens.length > 20 ? ', …' : ''} (${(scan.extraPercent * 100).toFixed(0)}% of content tokens, max 15%)${
          missingIds.length ? `; missing: ${missingIds.join(', ')}` : ''
        }`,
      ),
    );
  }

  if (weekly) {
    const scenes = story.scenes ?? [];
    if (scenes.length < 2 || scenes.length > 3) {
      issues.push(
        warning('scenes', 'scene_count', 'weekly stories need 2–3 scenes'),
      );
    }
  }

  return issues;
}

export function learnerLineIndexes(story: Pick<StoryDoc, 'cast' | 'lines'>): number[] {
  const learnerIds = new Set(
    story.cast
      .filter((c) => c.role === 'learner')
      .map((c) => c.id.toLowerCase()),
  );
  learnerIds.add('learner');
  const out: number[] = [];
  for (const [i, line] of story.lines.entries()) {
    if (learnerIds.has(line.speaker.trim().toLowerCase())) out.push(i);
  }
  return out;
}

/** Retry hints for structure fatals only (content never retries). */
export function formatStoryRetryHints(issues: TierIssue[]): string {
  const structure = issues.filter(isStoryStructureFatal);
  if (!structure.length) return '';
  const lines: string[] = ['FIX (structure only):'];
  for (const o of structure.slice(0, 5)) {
    lines.push(`${o.path}: ${o.message}`);
  }
  return lines.join('\n');
}
