import { CHARACTER_IDS } from '@/lib/v2/characters/registry';
import type { Item } from '@/lib/v2/content/items';
import type {
  StoryAfterQuestion,
  StoryCastEntry,
  StoryDoc,
  StoryLine,
  StoryLineOption,
} from '@/lib/v2/content/story';
import type { ImageSpec } from '@/lib/v2/generation/images/templates';
import { hydrateDialogueLine } from './dialogueChecks';
import { learnerLineIndexes, splitSentences } from './storyChecks';

function itemTl(item: Item): string {
  return 'tl' in item && typeof item.tl === 'string' ? item.tl : '';
}

function itemAr(item: Item): string {
  return 'ar' in item && typeof item.ar === 'string' ? item.ar : '';
}

function castRoleForSpeaker(
  cast: StoryCastEntry[],
  speaker: string,
): StoryCastEntry['role'] | null {
  const sp = speaker.trim().toLowerCase();
  if (sp === 'learner') return 'learner';
  if (sp === 'narrator') return 'narrator';
  const hit = cast.find((c) => c.id.toLowerCase() === sp);
  return hit?.role ?? (CAST_FALLBACK.has(sp) ? 'character' : null);
}

const CAST_FALLBACK = new Set(CHARACTER_IDS);

/** Proper-name TL → Arabic (story AR must cover names). */
export const NAME_AR: Record<string, string> = {
  omar: 'عمر',
  inês: 'إينيس',
  ines: 'إينيس',
  rita: 'ريتا',
  manuel: 'مانويل',
  sofia: 'صوفيا',
  carlos: 'كارلوس',
  yassin: 'ياسين',
  tiago: 'تياغو',
  graca: 'غراسا',
  graça: 'غراسا',
  nour: 'نور',
  'dona graça': 'دونيا غراسا',
  'dona graca': 'دونيا غراسا',
};

export function transliterateNameAr(name: string): string {
  const key = name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
  return NAME_AR[name.toLowerCase()] ?? NAME_AR[key] ?? name;
}

/** Normalize option/meaning text for dedupe. */
export function normalizeOptionText(tl: string): string {
  return tl
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Bubble side from speaker role. */
export function sideForSpeaker(
  cast: StoryCastEntry[],
  speaker: string,
): 'left' | 'right' | 'center' {
  const role = castRoleForSpeaker(cast, speaker);
  if (role === 'learner') return 'left';
  if (role === 'narrator') return 'center';
  return 'right';
}

/** Trailing `.!?…` on a TL sentence (for mirroring onto AR). */
function trailingTerminator(sentence: string): string {
  const m = sentence.trim().match(/[.!?…]+$/);
  return m?.[0] ?? '.';
}

/** Map Latin terminator → Arabic punctuation where appropriate. */
function arabicTerminator(terminator: string): string {
  if (terminator.includes('?')) return '؟';
  if (terminator.includes('!')) return '!';
  if (terminator.includes('…')) return '…';
  return '۔';
}

/**
 * Strip AR/Latin trailing punct then append the Arabic terminator.
 * Keep vocatives inside the sentence (no split before يا).
 */
function withTerminator(ar: string, terminator: string): string {
  const stripped = ar.trim().replace(/[.!?…؟۔]+$/u, '');
  if (!stripped) return stripped;
  return `${stripped}${arabicTerminator(terminator)}`;
}

/** Prefer full known-item AR when TL matches (never word-by-word fragments). */
function matchKnownItemAr(
  sentence: string,
  pool: Item[],
): string | null {
  const norm = normalizeOptionText(sentence);
  if (!norm) return null;
  let best: { ar: string; len: number } | null = null;
  for (const item of pool) {
    if (item.type !== 'phrase' && item.type !== 'word' && item.type !== 'sentence') {
      continue;
    }
    const tl = itemTl(item);
    const ar = itemAr(item);
    if (!tl || !ar) continue;
    const ntl = normalizeOptionText(tl);
    if (!ntl) continue;
    if (ntl === norm || norm.includes(ntl) || ntl.includes(norm)) {
      if (!best || ntl.length > best.len) {
        best = { ar, len: ntl.length };
      }
    }
  }
  return best?.ar ?? null;
}

/**
 * Build Arabic for a full line: item AR + name transliteration so every
 * TL sentence has an AR counterpart (incl. Chamo-me Inês → اسمي إينيس).
 * Empty-id lines that match known items (other days) get that item's full ar —
 * never word-by-word fragments.
 */
export function buildLineArabic(
  line: StoryLine,
  items: Item[],
  knownItems?: Item[],
): string {
  const existing = line.ar?.trim();
  // Reject fragmented/placeholder AR so we can rebuild from known items
  const looksFragment =
    existing &&
    existing.length <= 6 &&
    !/[؟!۔]/.test(existing) &&
    !(line.ids?.length);
  if (existing && !looksFragment) {
    return existing.replace(/\?/g, '؟');
  }

  const pool = [...items, ...(knownItems ?? [])];
  const hydrated = hydrateDialogueLine(line.ids ?? [], items);
  const extras = (line.extra ?? [])
    .map((e) => e.ar?.trim())
    .filter(Boolean) as string[];

  // Prefer sentence-aligned build when tl has names not in item bank
  const sentences = splitSentences(line.tl);
  if (sentences.length) {
    const arParts: string[] = [];
    for (const sent of sentences) {
      const fromIds = matchSentenceAr(sent, line.ids ?? [], items);
      const fromKnown = matchKnownItemAr(sent, pool);
      // Prefer id-aligned or full known-item gloss — never word-by-word first
      const raw =
        fromIds ?? fromKnown ?? translateSentenceHeuristic(sent, pool);
      arParts.push(raw);
    }
    if (arParts.every(Boolean)) {
      return arParts
        .map((ar, i) => withTerminator(ar, trailingTerminator(sentences[i]!)))
        .join(' ');
    }
    // Incomplete per-sentence AR on multi-sentence TL: do not collapse to one
    // hydrated blob (that triggers ar_sentence_mismatch). Leave empty so
    // ar_missing fires clearly; autofix should have split lines already.
    if (sentences.length > 1) return '';
  }

  const parts = [hydrated.ar, ...extras].filter(Boolean);
  return parts.join(' ').trim().replace(/\?/g, '؟');
}

function matchSentenceAr(
  sentence: string,
  ids: string[],
  items: Item[],
): string | null {
  const norm = normalizeOptionText(sentence);
  for (const id of ids) {
    const item = items.find((i) => i.id === id);
    if (!item) continue;
    const tl = itemTl(item);
    const ar = itemAr(item);
    if (!tl || !ar) continue;
    if (normalizeOptionText(tl) === norm || norm.includes(normalizeOptionText(tl))) {
      // Replace / append names in the sentence that aren't in the item tl
      return injectNamesIntoAr(sentence, tl, ar);
    }
  }
  return null;
}

function injectNamesIntoAr(sentence: string, itemTl: string, itemAr: string): string {
  const nameRe = /\b([A-ZÁÉÍÓÚÂÊÔÃÕÀÜ][a-zàáâãäåèéêëìíîïòóôõöùúûüçñ]+)\b/g;
  const itemNames = new Set(
    [...itemTl.matchAll(nameRe)].map((m) => m[1]!.toLowerCase()),
  );
  let ar = itemAr.replace(/[.!?…؟۔]+$/u, '').trim();
  for (const m of sentence.matchAll(nameRe)) {
    const name = m[1]!;
    if (itemNames.has(name.toLowerCase())) continue;
    // Item may be "Chamo-me Omar." while sentence is "Chamo-me Inês."
    const itemName = [...itemNames][0];
    const nameAr = transliterateNameAr(name);
    if (itemName && ar.includes(transliterateNameAr(itemName))) {
      ar = ar.replace(transliterateNameAr(itemName), nameAr);
    } else if (!ar.includes(nameAr)) {
      // Keep vocative inside the sentence: تشرفنا يا عمر!
      ar = `${ar} يا ${nameAr}`.trim();
    }
  }
  return ar;
}

function translateSentenceHeuristic(sentence: string, items: Item[]): string {
  let remaining = sentence.trim();
  const arBits: string[] = [];

  // Sort phrases longest-first
  const phrases = items
    .filter((i) => i.type === 'phrase' || i.type === 'word')
    .map((i) => ({ tl: itemTl(i), ar: itemAr(i) }))
    .filter((x) => x.tl && x.ar)
    .sort((a, b) => b.tl.length - a.tl.length);

  for (const p of phrases) {
    const bare = p.tl.replace(/[.!?]+$/, '').trim();
    if (!bare) continue;
    const re = new RegExp(bare.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    if (re.test(remaining)) {
      arBits.push(p.ar);
      remaining = remaining.replace(re, ' ').replace(/\s+/g, ' ').trim();
    }
  }

  // Leftover proper names
  const nameRe = /\b([A-ZÁÉÍÓÚÂÊÔÃÕÀÜ][a-zàáâãäåèéêëìíîïòóôõöùúûüçñ]+)\b/g;
  for (const m of remaining.matchAll(nameRe)) {
    arBits.push(transliterateNameAr(m[1]!));
  }

  return arBits.join(' ').trim();
}

/** Arabic from item bank ids + names; keep explicit ar if present. */
export function enrichLineArabic(
  line: StoryLine,
  items: Item[],
  knownItems?: Item[],
): StoryLine {
  const ar = buildLineArabic(line, items, knownItems);
  if (!ar) return line;
  return { ...line, ar };
}

function isSaidPhrase(item: Item): boolean {
  if (item.type !== 'phrase') return false;
  if ((item as { derived?: boolean }).derived) return false;
  return (item as { role?: string }).role !== 'heard';
}

function characterNameEg(cast: StoryCastEntry[]): string {
  const ch = cast.find((c) => c.role === 'character');
  return ch?.name?.trim() || 'الشخصية';
}

function characterLineIndexes(story: Pick<StoryDoc, 'cast' | 'lines'>): number[] {
  const charIds = new Set(
    story.cast
      .filter((c) => c.role === 'character')
      .map((c) => c.id.toLowerCase()),
  );
  const out: number[] = [];
  for (const [i, line] of story.lines.entries()) {
    if (charIds.has(line.speaker.trim().toLowerCase())) out.push(i);
  }
  return out;
}

function cleanLabel(tl: string): string {
  return tl.trim().replace(/\s*\/\s*/g, ' ').trim();
}

function pickDistractorLabels(
  correct: string,
  pool: { id: string; label: string }[],
  seed: number,
): StoryLineOption[] {
  const correctNorm = normalizeOptionText(correct);
  const used = new Set<string>([correctNorm]);
  const distractors: { id: string; label: string }[] = [];
  const ordered = [...pool].sort(
    (a, b) =>
      ((a.id.charCodeAt(0) + seed) % 7) - ((b.id.charCodeAt(0) + seed) % 7),
  );
  for (const cand of ordered) {
    if (distractors.length >= 2) break;
    const label = cleanLabel(cand.label);
    if (!label || label.includes('/')) continue;
    const n = normalizeOptionText(label);
    if (!n || used.has(n)) continue;
    used.add(n);
    distractors.push({ id: cand.id, label });
  }
  const options: StoryLineOption[] = [
    { id: 'correct', label: cleanLabel(correct), correct: true },
    ...distractors.map((d, di) => ({
      id: `d${di}`,
      label: d.label,
      correct: false,
    })),
  ];
  return [...options].sort(
    (a, b) =>
      ((a.id.charCodeAt(0) + seed) % 3) - ((b.id.charCodeAt(0) + seed) % 3),
  );
}

/**
 * Build 3–4 after-story questions from the lines (code-owned).
 * Kinds: what the character asked, what the learner replied, one line meaning.
 */
export function buildAfterQuestions(opts: {
  story: Pick<StoryDoc, 'cast' | 'lines'>;
  items: Item[];
  recycleIds?: string[];
}): StoryAfterQuestion[] {
  void opts.recycleIds;
  const saidBank = opts.items
    .filter(isSaidPhrase)
    .map((i) => ({ id: i.id, label: itemTl(i) }))
    .filter((x) => x.label && !x.label.includes('/'));

  const learnerIdx = learnerLineIndexes(opts.story);
  const charIdx = characterLineIndexes(opts.story);
  const name = characterNameEg(opts.story.cast);
  const questions: StoryAfterQuestion[] = [];
  const usedLines = new Set<number>();

  const askCandidates = [
    ...charIdx.filter((i) => opts.story.lines[i]!.tl.includes('?')),
    ...charIdx,
  ];
  const askLine = askCandidates.find((i) => !usedLines.has(i));
  if (askLine != null) {
    usedLines.add(askLine);
    const line = opts.story.lines[askLine]!;
    const pool = [
      ...charIdx
        .filter((i) => i !== askLine)
        .map((i) => ({
          id: `story_L${i}`,
          label: opts.story.lines[i]!.tl,
        })),
      ...saidBank,
    ];
    questions.push({
      id: `aq.ask.${askLine}`,
      kind: 'character_asked',
      prompt_eg: `${name} سألتك إيه؟`,
      options: pickDistractorLabels(line.tl, pool, askLine),
      line_index: askLine,
    });
  }

  const replyCandidates = [
    ...learnerIdx.filter((i) => opts.story.lines[i]!.replies_to != null),
    ...learnerIdx,
  ];
  const replyLine = replyCandidates.find((i) => !usedLines.has(i));
  if (replyLine != null) {
    usedLines.add(replyLine);
    const line = opts.story.lines[replyLine]!;
    const heardIdx =
      line.replies_to != null && line.replies_to < opts.story.lines.length
        ? line.replies_to
        : null;
    const heardTl =
      heardIdx != null ? cleanLabel(opts.story.lines[heardIdx]!.tl) : '';
    const prompt_eg = heardTl
      ? `إنت رديت بإيه لما سألتك ${heardTl}؟`
      : `إنت رديت بإيه؟`;
    const pool = [
      ...learnerIdx
        .filter((i) => i !== replyLine)
        .map((i) => ({
          id: `story_L${i}`,
          label: opts.story.lines[i]!.tl,
        })),
      ...saidBank,
    ];
    questions.push({
      id: `aq.reply.${replyLine}`,
      kind: 'learner_replied',
      prompt_eg,
      options: pickDistractorLabels(line.tl, pool, replyLine + 1),
      line_index: replyLine,
    });
  }

  const meaningCandidates = [
    ...[...charIdx, ...learnerIdx].filter(
      (i) => !usedLines.has(i) && Boolean(opts.story.lines[i]!.ar?.trim()),
    ),
    ...[...charIdx, ...learnerIdx].filter((i) => !usedLines.has(i)),
  ];
  const meaningLine = meaningCandidates[0];
  if (meaningLine != null) {
    usedLines.add(meaningLine);
    const line = opts.story.lines[meaningLine]!;
    const fromIds = (line.ids ?? [])
      .map((id) => opts.items.find((i) => i.id === id))
      .map((i) => (i ? itemAr(i) : ''))
      .find(Boolean);
    const correctAr = line.ar?.trim() || fromIds || cleanLabel(line.tl);
    const arPool = opts.items
      .map((i) => ({ id: i.id, label: itemAr(i) }))
      .filter((x) => x.label);
    for (const [j, other] of opts.story.lines.entries()) {
      if (j === meaningLine || !other.ar?.trim()) continue;
      arPool.push({ id: `story_ar_${j}`, label: other.ar.trim() });
    }
    questions.push({
      id: `aq.meaning.${meaningLine}`,
      kind: 'line_meaning',
      prompt_eg: `إيه معنى: ${cleanLabel(line.tl)}؟`,
      options: pickDistractorLabels(correctAr, arPool, meaningLine + 2),
      line_index: meaningLine,
    });
  }

  if (questions.length < 4) {
    const extraAsk = askCandidates.find((i) => !usedLines.has(i));
    if (extraAsk != null) {
      usedLines.add(extraAsk);
      const line = opts.story.lines[extraAsk]!;
      const pool = [
        ...charIdx
          .filter((i) => i !== extraAsk)
          .map((i) => ({
            id: `story_L${i}`,
            label: opts.story.lines[i]!.tl,
          })),
        ...saidBank,
      ];
      questions.push({
        id: `aq.ask2.${extraAsk}`,
        kind: 'character_asked',
        prompt_eg: `${name} قالت إيه كمان؟`,
        options: pickDistractorLabels(line.tl, pool, extraAsk + 3),
        line_index: extraAsk,
      });
    }
  }

  return questions.slice(0, 4);
}

export function enrichStorySides(story: StoryDoc): StoryDoc {
  return {
    ...story,
    lines: story.lines.map((line) => ({
      ...line,
      side: sideForSpeaker(story.cast, line.speaker),
    })),
  };
}

export function buildSceneImageSpec(opts: {
  setting: string;
  cast: StoryCastEntry[];
  subject?: string;
}): ImageSpec {
  const learner =
    opts.cast.find((c) => c.role === 'learner')?.id ?? 'yassin';
  const character =
    opts.cast.find((c) => c.role === 'character')?.id ?? 'ines';
  return {
    type: 'scene',
    subject:
      opts.subject ??
      `a conversation between ${learner} and ${character} in ${opts.setting}`,
    characters: [learner, character],
    pose: 'facing each other mid-conversation, learner on the left, character on the right',
    setting: opts.setting,
    framing: '16:9 wide scene',
    light: 'warm natural light',
    must_show: [
      'both people clearly visible',
      'recognizable place',
      'learner on the left',
      'character on the right',
    ],
    must_avoid: ['text', 'letters', 'numbers', 'signs with writing', 'logos'],
  };
}

/** Full code enrichment after model output + checks. */
export function enrichStoryDocument(
  story: StoryDoc,
  items: Item[],
  recycleIds?: string[],
  opts?: {
    onDuplicateOptions?: (lineIndex: number, labels: string[]) => void;
    /** Prior-day / registry items for empty-id TL → AR lookup. */
    knownItems?: Item[];
  },
): StoryDoc {
  void opts?.onDuplicateOptions;
  const knownItems = opts?.knownItems ?? [];
  let next: StoryDoc = {
    ...story,
    lines: story.lines.map((line) => {
      const { options: _drop, ...rest } = line;
      return enrichLineArabic(rest, items, knownItems);
    }),
  };
  next = enrichStorySides(next);
  next = {
    ...next,
    after_questions: buildAfterQuestions({
      story: next,
      items,
      recycleIds,
    }),
  };
  if (!next.image_spec) {
    next = {
      ...next,
      image_spec: buildSceneImageSpec({
        setting: next.setting,
        cast: next.cast,
      }),
    };
  }
  if (next.scenes?.length) {
    next = {
      ...next,
      scenes: next.scenes.map((scene) => ({
        ...scene,
        image_spec:
          scene.image_spec ??
          buildSceneImageSpec({
            setting: next.setting,
            cast: next.cast,
            subject: scene.title_eg
              ? `${scene.title_eg} in ${next.setting}`
              : undefined,
          }),
      })),
    };
  }
  return next;
}
