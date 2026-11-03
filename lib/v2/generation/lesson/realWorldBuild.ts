import type { Item } from '@/lib/v2/content/items';
import type { Page } from '@/lib/v2/content/page';
import { modeForPreset } from '@/lib/v2/content/page';
import { transliteratePtToSay } from '@/lib/v2/content/translit/ptPt';
import type { Rt } from '@/lib/v2/content/rt';
import {
  contentTokensFromTl,
  functionWordSets,
  normToken,
} from './functionWords';
import { tokenizeTl } from './storyTokens';

export type RealWorldPhraseRaw = {
  tl: string;
  tl_f?: string;
  ar: string;
  eg_note: string;
  tag: string;
};

export type RealWorldTipRaw = {
  title_eg: string;
  wrong_tl: string;
  right_tl: string;
  body_eg: string;
};

export type RealWorldPhraseBuilt = {
  id: string;
  tl: string;
  tl_f?: string;
  ar: string;
  eg_note: string;
  tag: string;
  category: string;
  say: string;
  cloze: string;
  audio?: string;
};

export type RealWorldHandoff = {
  phrases: RealWorldPhraseBuilt[];
  tip: RealWorldTipRaw;
  hide: boolean;
  issues: string[];
  authored: boolean;
};

const CATEGORY_LABELS: Record<string, string> = {
  order: 'الطلب',
  pay: 'الدفع والحساب',
  polite: 'السؤال والطلب اللطيف',
  tip: 'نصيحة لشبونية',
  ask: 'سؤال',
  other: 'تاني',
};

/** Map an Egyptian tag to a stable category slug. */
export function categoryFromTag(tag: string): string {
  const t = tag.trim().toLowerCase();
  if (/حساب|دفع|conta|فاتورة/.test(t)) return 'pay';
  if (/مهذب|لطيف|polite|أدب|من فضلك/.test(t)) return 'polite';
  if (/طلب|order|كافيه|قهوة|أكل|مشروب/.test(t)) return 'order';
  if (/نصيحة|لشبون|tip|عادة/.test(t)) return 'tip';
  if (/سؤال|ask|\?/.test(t)) return 'ask';
  return 'other';
}

export function categoryLabelEg(id: string): string {
  return CATEGORY_LABELS[id] ?? id;
}

function normTl(tl: string): string {
  return tl
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[…!.?,;:]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function slugFromTl(tl: string): string {
  const base = normTl(tl)
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40);
  return base || 'phrase';
}

function pickCloze(tl: string): string {
  const tokens = tokenizeTl(tl).filter((t) => t.length > 2);
  const fw = functionWordSets();
  for (const t of tokens) {
    if (!fw.tokens.has(normToken(t))) return t.replace(/[….!?]$/, '');
  }
  return tokens[0] ?? tl.split(/\s+/)[0] ?? 'x';
}

function knownTokenSet(
  items: Array<{ tl?: string; id?: string }>,
  coreTls: string[],
): Set<string> {
  const fw = functionWordSets();
  const known = new Set<string>([...fw.tokens]);
  for (const phrase of fw.phrases) {
    for (const t of phrase.split(/\s+/)) {
      if (t) known.add(t);
    }
  }
  for (const item of items) {
    if (!item.tl) continue;
    for (const t of contentTokensFromTl(item.tl, fw)) known.add(t);
    for (const t of tokenizeTl(item.tl).map(normToken)) known.add(t);
  }
  for (const tl of coreTls) {
    for (const t of contentTokensFromTl(tl, fw)) known.add(t);
    for (const t of tokenizeTl(tl).map(normToken)) known.add(t);
  }
  return known;
}

function coreWordHits(
  tl: string,
  coreTls: string[],
  grammarTokens: Set<string>,
): boolean {
  const tokens = new Set(tokenizeTl(tl).map(normToken));
  for (const g of grammarTokens) {
    if (tokens.has(g)) return true;
  }
  for (const core of coreTls) {
    const coreToks = tokenizeTl(core).map(normToken).filter((t) => t.length > 2);
    if (coreToks.some((t) => tokens.has(t))) return true;
  }
  return false;
}

/**
 * Validate + enrich raw phrases. Drop failing ones. Hide when <3 remain.
 */
export function processRealWorldPhrases(opts: {
  raw: RealWorldPhraseRaw[];
  tip: RealWorldTipRaw;
  items: Array<{ id: string; tl?: string; type?: string }>;
  coreTls: string[];
  maxWords: number;
  grammarFocusTl?: string;
  authored?: boolean;
}): RealWorldHandoff {
  const issues: string[] = [];
  const maxLen = opts.maxWords + 4;
  const known = knownTokenSet(opts.items, opts.coreTls);
  const coreNorm = new Set(opts.coreTls.map(normTl).filter(Boolean));
  const grammarTokens = new Set(
    opts.grammarFocusTl
      ? tokenizeTl(opts.grammarFocusTl).map(normToken).filter(Boolean)
      : [],
  );
  // Common grammar anchors for polite request days
  for (const g of ['queria', 'um', 'uma', 'pode', 'podia']) {
    grammarTokens.add(g);
  }

  const kept: RealWorldPhraseBuilt[] = [];
  const usedIds = new Set<string>();
  const usedTl = new Set<string>();

  for (const [i, p] of opts.raw.entries()) {
    const path = `phrases[${i}]`;
    let tl = (p.tl ?? '').trim();
    let tl_f = p.tl_f?.trim() || undefined;
    const ar = (p.ar ?? '').trim();
    const eg_note = (p.eg_note ?? '').trim();
    const tag = (p.tag ?? '').trim();

    if (!tl || !ar || !eg_note || !tag) {
      issues.push(`${path}: dropped — missing tl/ar/eg_note/tag`);
      continue;
    }
    if (tl.includes('/')) {
      issues.push(`${path}: dropped — "/" in tl (use tl_f)`);
      continue;
    }
    if (tl_f?.includes('/')) {
      issues.push(`${path}: dropped — "/" in tl_f`);
      tl_f = undefined;
    }

    const wc = tokenizeTl(tl).length;
    if (wc > maxLen) {
      issues.push(`${path}: dropped — ${wc} words > max ${maxLen}`);
      continue;
    }

    const n = normTl(tl);
    if (coreNorm.has(n)) {
      issues.push(`${path}: dropped — duplicates core item`);
      continue;
    }
    if (usedTl.has(n)) {
      issues.push(`${path}: dropped — duplicate tl`);
      continue;
    }

    const fw = functionWordSets();
    const content = contentTokensFromTl(tl, fw);
    const unknown = content.filter((t) => !known.has(t));
    if (unknown.length > 2) {
      issues.push(
        `${path}: dropped — ${unknown.length} unknown words (${unknown.join(', ')})`,
      );
      continue;
    }
    if (unknown.length > 0 && !eg_note) {
      issues.push(`${path}: dropped — unknown words need eg_note gloss`);
      continue;
    }

    let slug = slugFromTl(tl);
    let id = `phrase.rw.${slug}`;
    let n_try = 2;
    while (usedIds.has(id) || opts.items.some((it) => it.id === id)) {
      id = `phrase.rw.${slug}_${n_try++}`;
    }
    usedIds.add(id);
    usedTl.add(n);

    kept.push({
      id,
      tl,
      ...(tl_f ? { tl_f } : {}),
      ar,
      eg_note,
      tag,
      category: categoryFromTag(tag),
      say: transliteratePtToSay(tl),
      cloze: pickCloze(tl),
      audio: `audio:${id}`,
    });
  }

  // Set-level: at least 2 phrases reuse today's grammar or core words
  const hits = kept.filter((p) =>
    coreWordHits(p.tl, opts.coreTls, grammarTokens),
  );
  if (kept.length >= 3 && hits.length < 2) {
    issues.push(
      `set: only ${hits.length} phrases reuse today grammar/core — need ≥2`,
    );
    // Keep phrases that hit; if still <2 hits, hide later via count
    if (hits.length > 0) {
      const hitIds = new Set(hits.map((h) => h.id));
      const dropped = kept.filter((p) => !hitIds.has(p.id));
      for (const d of dropped.slice(0, Math.max(0, kept.length - Math.max(hits.length, 2)))) {
        issues.push(`${d.id}: dropped — set grammar/core coverage`);
      }
      // Prefer keeping hits + enough fillers to try reach 3 only if hits≥2
      if (hits.length < 2) {
        kept.length = 0;
        kept.push(...hits);
      }
    } else {
      kept.length = 0;
    }
  }

  // Cap at 5
  if (kept.length > 5) {
    issues.push(`trimmed ${kept.length - 5} phrases over cap 5`);
    kept.splice(5);
  }

  const hide = kept.length < 3;
  if (hide) {
    issues.push(`hide page — only ${kept.length} phrases remain (need ≥3)`);
  }

  return {
    phrases: hide ? [] : kept,
    tip: opts.tip,
    hide,
    issues,
    authored: Boolean(opts.authored),
  };
}

export function tipToRt(tip: RealWorldTipRaw): {
  title: Rt;
  body: Rt;
} {
  const title: Rt = [{ text: tip.title_eg || 'نصيحة', lang: 'eg' }];
  const body: Rt = [];
  if (tip.wrong_tl && tip.right_tl) {
    body.push({ text: 'متقولش ', lang: 'eg' });
    body.push({ text: tip.wrong_tl, lang: 'tl', bold: true });
    body.push({ text: ' — قول ', lang: 'eg' });
    body.push({ text: tip.right_tl, lang: 'tl', bold: true });
    if (tip.body_eg?.trim()) {
      body.push({ text: ' — ' + tip.body_eg.trim(), lang: 'eg' });
    }
  } else if (tip.body_eg?.trim()) {
    body.push({ text: tip.body_eg.trim(), lang: 'eg' });
  } else {
    body.push({ text: 'قولها زي الناس هنا.', lang: 'eg' });
  }
  return { title, body };
}

/** Build phrase Item records for the lesson bank. */
export function realWorldPhrasesToItems(
  phrases: RealWorldPhraseBuilt[],
): Item[] {
  return phrases.map((p) => ({
    type: 'phrase' as const,
    id: p.id,
    tl: p.tl,
    ...(p.tl_f ? { tl_f: p.tl_f } : {}),
    ar: p.ar,
    say: p.say,
    context_eg: p.eg_note,
    cloze: p.cloze,
    tag: p.tag,
    category: p.category,
    has_card: false,
    real_world: true,
    audio: p.audio,
  }));
}

/** Code-built real_world page object. */
export function buildRealWorldPage(opts: {
  index: number;
  pageId: string;
  titleEg?: string;
  situationEg?: string;
  situationTl?: string;
  handoff: RealWorldHandoff;
}): Page | null {
  if (opts.handoff.hide || opts.handoff.phrases.length < 3) return null;

  const cats = new Map<string, string>();
  for (const p of opts.handoff.phrases) {
    if (!cats.has(p.category)) {
      cats.set(p.category, categoryLabelEg(p.category));
    }
  }
  const categories =
    cats.size >= 2
      ? [...cats.entries()].map(([id, label_eg]) => ({ id, label_eg }))
      : undefined;

  const tipRt = tipToRt(opts.handoff.tip);
  const pillParts = [
    opts.situationTl?.trim(),
    opts.situationEg?.trim(),
  ].filter(Boolean);
  const pill =
    pillParts.length === 2
      ? `${pillParts[0]!.toUpperCase()} · ${pillParts[1]}`
      : pillParts[0];

  return {
    id: opts.pageId,
    preset: 'real_world',
    mode: modeForPreset('real_world'),
    cover: 'meaning',
    ...(pill ? { pill } : {}),
    title: [
      {
        text: opts.titleEg?.trim() || 'بيقولوها كده',
        lang: 'eg' as const,
      },
    ],
    subtitle: opts.situationEg
      ? [{ text: opts.situationEg, lang: 'eg' as const }]
      : undefined,
    blocks: [
      {
        id: 'tip_rw',
        type: 'tip',
        kind: 'culture',
        title: tipRt.title,
        body: tipRt.body,
      },
    ],
    real_world: {
      phrase_ids: opts.handoff.phrases.map((p) => p.id),
      ...(categories ? { categories } : {}),
    },
  };
}
