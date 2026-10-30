import { shouldForceNoCard } from '@/lib/v2/content/flashcards';
import { ItemSchema, type Item } from '@/lib/v2/content/items';
import { validateLessonPack } from '@/lib/v2/content/validate';
import type { LessonBrief } from '../brief';
import {
  nonVerbCoreIds,
  verbCoreItems,
  type CoreItem,
} from '../coreItems';
import { runGenerationChecks } from '../generationChecks';
import type { KnownIdTl } from '../hash';
import { checkTlCollisions } from '../registry';
import { getDayPlan } from '../plan';
import { buildItemsSystemPrompt } from '../prompts';
import {
  ItemsJobSchema,
  clozeAppearsInTl,
} from '../schemas/items';
import { normalizeOutlineItems } from '../stages/types';
import {
  fatal,
  fix,
  formatRetryHints,
  warning,
  type JobOutcomeExtras,
  type TierIssue,
} from '../tiers';
import { applySayToItems } from '../../say';
import { splitPlainToRt } from '../coerceRt';
import {
  ensurePatternSkeleton,
  ensurePluralPairItems,
  fillPatternsInBank,
} from '../patternFill';
import {
  resolvePatternKind,
  slotsForKind,
} from '../patternTemplates';
import { ensureHeardReplies } from '../heardReplies';
import { applyEgSayToItems } from '../egSay';
import { normalizeWordMeanings } from '../normalizeAr';
import { callJobTool } from './call';

/** Set has_card explicitly: false for pattern/derived/recycle/set items. */
function applyHasCardFlags(items: Item[], recycleIds: Set<string>): Item[] {
  return items.map((item) => {
    if (shouldForceNoCard(item, { recycleIds })) {
      return { ...item, has_card: false } as Item;
    }
    if (item.type === 'word' || item.type === 'phrase') {
      const existing = (item as { has_card?: boolean }).has_card;
      if (existing === false) return item;
      return { ...item, has_card: true } as Item;
    }
    return { ...item, has_card: false } as Item;
  });
}

const ARABIC_RE = /[\u0600-\u06FF]/
const LATIN_RE = /[A-Za-zÀ-ÿ]/

/**
 * Flatten rt arrays to a plain string, preserving every character.
 * Never delete Latin from mixed Arabic+Latin — keep the full text.
 */
function asPlainArabicString(value: unknown): unknown {
  let text: string | undefined;
  if (typeof value === 'string') {
    text = value;
  } else if (Array.isArray(value)) {
    text = value
      .map((seg) => {
        if (typeof seg === 'string') return seg;
        if (seg && typeof seg === 'object' && 'text' in seg) {
          return String((seg as { text: unknown }).text ?? '');
        }
        return '';
      })
      .join('');
  } else {
    return value;
  }
  if (!(ARABIC_RE.test(text) && LATIN_RE.test(text))) return text;
  const segs = splitPlainToRt(text, 'mixed');
  return segs.map((s) => s.text).join('') || text;
}

function coerceItemMixedFields(item: Item): Item {
  const row = { ...(item as Record<string, unknown>) };
  for (const key of ['ar', 'ar_f', 'eg', 'context_eg', 'tip', 'note'] as const) {
    if (key in row) row[key] = asPlainArabicString(row[key]);
  }
  if (item.type === 'pattern' && Array.isArray(row.slots)) {
    row.slots = (row.slots as unknown[]).map((slot) => {
      if (!slot || typeof slot !== 'object') return slot;
      const s = { ...(slot as Record<string, unknown>) };
      if ('name_eg' in s) s.name_eg = asPlainArabicString(s.name_eg);
      if (!('kind' in s) && 'name_eg' in s) s.kind = 'word';
      return s;
    });
  }
  return row as Item;
}

function coerceBank(items: Item[]): Item[] {
  return items.map((it) => coerceItemMixedFields(it));
}

function plannedPresets(day: number): string[] {
  const plan = getDayPlan(day).generation?.page_plan ?? [];
  return plan.map((p) => p.preset);
}

function formatCoreItemsBlock(core: CoreItem[]): string {
  if (!core.length) return '(none — no_new_items day; return empty items or recycle only)';
  return core
    .map((c) => {
      const role = c.role ? ` | role=${c.role}` : '';
      const fills =
        c.fills?.length ? ` | fills=${c.fills.join(',')}` : '';
      const hint =
        c.kind === 'verb'
          ? `${c.id} | verb | ${c.tl} | eg_hint=${c.eg} (CODE injects — do not write)`
          : `${c.id} | ${c.kind} | ${c.tl} | eg_hint=${c.eg}${role}${fills}`;
      return hint;
    })
    .join('\n');
}

/** Copy role from core phrases onto bank phrases; default said. */
function applyPhraseRolesFromCore(items: Item[], core: CoreItem[]): Item[] {
  const roleById = new Map(
    core
      .filter((c) => c.kind === 'phrase' && c.role)
      .map((c) => [c.id, c.role!] as const),
  );
  return items.map((item) => {
    if (item.type !== 'phrase') return item;
    const fromCore = roleById.get(item.id);
    const role =
      fromCore ??
      (item as { role?: 'said' | 'heard' }).role ??
      'said';
    return { ...item, role } as Item;
  });
}

/** Code-injected verb lemma card (exact core id). Never copy eg into ar. */
function verbLemmaStub(core: CoreItem): Item {
  const lemma = core.tl.split(/\s+/)[0] ?? core.tl;
  return {
    type: 'word',
    id: core.id,
    tl: core.tl,
    lemma,
    gender: 'n',
    ar: '…',
    pos: 'verb',
  };
}

/** Minimal stub so required core ids are always present if the model omits them. */
function coreItemStub(core: CoreItem, _bank: Item[]): Item | null {
  if (core.kind === 'verb') return verbLemmaStub(core);
  if (core.kind === 'word') {
    return {
      type: 'word',
      id: core.id,
      tl: core.tl,
      gender: 'n',
      ar: '…',
    };
  }
  if (core.kind === 'phrase') {
    const token =
      core.tl.replace(/[…!.?]+$/g, '').trim().split(/\s+/)[0] ?? core.tl;
    return {
      type: 'phrase',
      id: core.id,
      tl: core.tl,
      ar: '…',
      context_eg: 'في الشارع',
      cloze: token,
    };
  }
  if (core.kind === 'pattern') {
    const kind = resolvePatternKind(core.id, core.pattern_kind);
    if (kind) {
      return {
        type: 'pattern',
        id: core.id,
        kind,
        slots: slotsForKind(kind),
        examples: [`${core.id}.ex.1`],
      } as Item;
    }
    const head = core.tl.split(/\s+/)[0] ?? '…';
    return {
      type: 'pattern',
      id: core.id,
      slots: [
        { tl: head },
        { name_eg: 'أداة', kind: 'article_um_uma' },
        { name_eg: 'كلمة', kind: 'word' },
      ],
      examples: [`${core.id}.ex.1`],
    } as Item;
  }
  return null;
}

/** Stamp pattern.kind from core / id inference onto bank patterns. */
function applyPatternKindsFromCore(
  items: Item[],
  coreItems: CoreItem[],
): Item[] {
  const coreKind = new Map(
    coreItems
      .filter((c) => c.kind === 'pattern')
      .map((c) => [c.id, resolvePatternKind(c.id, c.pattern_kind)] as const),
  );
  return items.map((it) => {
    if (it.type !== 'pattern') return it;
    const kind =
      resolvePatternKind(
        it.id,
        (it as { kind?: string }).kind ?? coreKind.get(it.id),
      ) ?? null;
    if (!kind) return it;
    return {
      ...it,
      kind,
      slots: slotsForKind(kind),
    } as Item;
  });
}

function mergeRecycleAndVerbs(
  modelItems: Item[],
  brief: LessonBrief,
  knownFull: Map<string, Item>,
): Item[] {
  const byId = new Map<string, Item>();
  const recycleSet = new Set(brief.recycle_ids);
  for (const id of brief.recycle_ids) {
    const known = knownFull.get(id);
    const knownAr =
      known && 'ar' in known && typeof known.ar === 'string' ? known.ar : '';
    if (known && knownAr.trim()) {
      byId.set(id, { ...known, extra: undefined } as Item);
    }
  }
  for (const item of modelItems) {
    if (/^verb\.[a-z_]+$/i.test(item.id) && !item.id.includes(':')) continue;
    // Registry/known recycle wins when it has MSA ar; else accept model recycle.
    if (recycleSet.has(item.id) && byId.has(item.id)) continue;
    byId.set(item.id, item);
  }
  for (const v of verbCoreItems(brief.core_items)) {
    byId.set(v.id, verbLemmaStub(v));
  }
  // Guarantee core ids: words/phrases/verbs first, then patterns (need examples).
  let bank = [...byId.values()];
  for (const core of brief.core_items) {
    if (core.kind === 'pattern') continue;
    if (byId.has(core.id)) continue;
    const stub = coreItemStub(core, bank);
    if (stub) {
      byId.set(core.id, stub);
      bank = [...byId.values()];
    }
  }
  for (const core of brief.core_items) {
    if (core.kind !== 'pattern') continue;
    if (byId.has(core.id)) continue;
    const stub = coreItemStub(core, [...byId.values()]);
    if (stub) byId.set(core.id, stub);
  }
  return fillPatternsInBank([...byId.values()], {
    coreItems: brief.core_items,
  });
}

function validateItemsRules(
  items: Item[],
  known: KnownIdTl[],
  presets: string[],
  brief: LessonBrief,
): { fatals: TierIssue[]; fixes: TierIssue[]; warnings: TierIssue[] } {
  const fatals: TierIssue[] = [];
  const fixes: TierIssue[] = [];
  const warnings: TierIssue[] = [];

  for (const msg of checkTlCollisions(items, known)) {
    warnings.push(warning('items', 'tl_collision', msg));
  }

  const bankIds = new Set(items.map((i) => i.id));
  const required = nonVerbCoreIds(brief.core_items);
  for (const id of required) {
    if (!bankIds.has(id)) {
      fatals.push(fatal('items', 'core_id_missing', id));
    }
  }
  for (const v of verbCoreItems(brief.core_items)) {
    if (!bankIds.has(v.id)) {
      fatals.push(fatal('items', 'core_id_missing', `${v.id} (verb stub)`));
    }
  }

  const coreSet = new Set(brief.core_items.map((c) => c.id));
  const recycleSet = new Set(brief.recycle_ids);
  const knownSet = new Set(known.map((k) => k.id));
  for (const id of brief.recycle_ids) {
    const row = items.find((i) => i.id === id);
    if (!row) {
      fatals.push(fatal(id, 'recycle_missing', 'recycle id not in bank'));
      continue;
    }
    const ar = 'ar' in row && typeof row.ar === 'string' ? row.ar.trim() : '';
    if (!ar || ar === '…') {
      fatals.push(fatal(id, 'recycle_ar', 'recycle needs MSA ar (not eg hint)'));
    }
  }
  const extras = items.filter(
    (it) =>
      Boolean((it as { extra?: boolean }).extra) &&
      !(it as { derived?: boolean }).derived,
  );
  if (brief.no_new_items && extras.length > 0) {
    warnings.push(
      warning(
        'items',
        'no_new_items',
        `extras not allowed (${extras.map((e) => e.id).join(', ')})`,
      ),
    );
  } else if (extras.length > 2) {
    warnings.push(
      warning(
        'items',
        'extra_cap',
        `at most 2 extra items, got ${extras.length}`,
      ),
    );
  }

  for (const item of items) {
    if (recycleSet.has(item.id) || knownSet.has(item.id)) continue;
    if (coreSet.has(item.id)) continue;
    if ((item as { extra?: boolean }).extra) continue;
    if ((item as { derived?: boolean }).derived) continue;
    if (/^pattern\..+\.ex\.\d+$/.test(item.id)) continue;
    if (item.id === 'pattern.day' && presets.includes('pattern')) continue;
    warnings.push(
      warning(
        item.id,
        'unplanned_id',
        'not core, recycle, known, or extra=true',
      ),
    );
  }

  for (const [i, item] of items.entries()) {
    const ok = ItemSchema.safeParse(item);
    if (!ok.success) {
      warnings.push(
        warning(
          `items[${i}]`,
          'item_schema',
          `${item.id}: ${ok.error.issues[0]?.message ?? 'invalid'}`,
        ),
      );
    }
  }
  if (presets.includes('pattern') && !brief.no_new_items) {
    const hasPattern = items.some((it) => it.type === 'pattern');
    if (!hasPattern) {
      warnings.push(
        warning('items', 'pattern_missing', 'pattern page planned but no pattern item'),
      );
    }
  }
  for (const item of items) {
    if (item.type === 'phrase') {
      const p = item as { context_eg?: string; cloze?: string; tl: string };
      if (!p.context_eg) {
        warnings.push(warning(item.id, 'phrase_context', 'needs context_eg'));
      }
      if (!p.cloze) {
        warnings.push(warning(item.id, 'phrase_cloze', 'needs cloze'));
      } else if (p.tl && !clozeAppearsInTl(p.tl, p.cloze)) {
        warnings.push(
          warning(item.id, 'phrase_cloze', `cloze "${p.cloze}" not in tl`),
        );
      }
    }
  }
  const stubPack = {
    lesson: {
      id: 'tmp',
      target_lang: 'pt-PT' as const,
      day: brief.day,
      kind: 'lesson' as const,
      pages: ['p1', 'p2', 'p3', 'p4'],
    },
    items,
    pages: [],
    questions: [],
  };
  const packCheck = validateLessonPack(stubPack, {
    mode: 'strict',
    coreIds: [...coreSet],
  });
  for (const iss of packCheck.issues) {
    if (iss.rule === 'core_id_missing') {
      fatals.push(fatal(iss.path, iss.rule, iss.message));
      continue;
    }
    if (iss.path.startsWith('items') && iss.severity === 'error') {
      if (
        iss.rule === 'unknown_item_ref' ||
        iss.rule === 'bad_ref' ||
        iss.rule === 'duplicate_item_id'
      ) {
        fixes.push(fix(iss.path, iss.rule, iss.message));
      } else {
        warnings.push(warning(iss.path, iss.rule, iss.message));
      }
    }
  }
  for (const iss of runGenerationChecks(
    stubPack as Parameters<typeof runGenerationChecks>[0],
  )) {
    if (iss.rule === 'rt_segment_lang' || iss.rule === 'raw_mixed_string') {
      continue; // deleted for model output
    }
    warnings.push(warning(iss.path, iss.rule, iss.message));
  }
  return { fatals, fixes, warnings };
}

export async function runItemsJob(opts: {
  brief: LessonBrief;
  known: KnownIdTl[];
  /** Full KNOWN payloads for recycle merge. */
  knownFull?: Map<string, Item>;
}): Promise<{
  items: Item[];
  issues: string[];
  fatals: TierIssue[];
  fixes: TierIssue[];
  warnings: TierIssue[];
  flagged: boolean;
  retries: number;
  auto_fix_count: number;
  timing: Awaited<ReturnType<typeof callJobTool>>['timing'];
  tokens: Awaited<ReturnType<typeof callJobTool>>['tokens'];
  over_budget: boolean;
  model: string;
  provider: Awaited<ReturnType<typeof callJobTool>>['provider'];
  userBody: string;
  systemModules: { name: string; version: string }[];
}> {
  const dayPlan = getDayPlan(opts.brief.day);
  const presets =
    opts.brief.planned_presets.length > 0
      ? opts.brief.planned_presets
      : plannedPresets(opts.brief.day);
  const knownFull = opts.knownFull ?? new Map<string, Item>();
  const knownLines =
    opts.known.length === 0
      ? '(none yet)'
      : opts.known.map((k) => `${k.id} (${k.type}): ${k.tl}`).join('\n');

  const user = `STAGE: ITEMS ONLY
Return { "items": [...] } via submit_items.
Do not write say.
no_new_items: ${opts.brief.no_new_items ? 'yes — return [] or only items you must not invent; code merges recycle' : 'no'}
At most 2 extras with "extra": true (0 when no_new_items).

PAGE_PLAN PRESETS: ${presets.join(', ') || '(none)'}
${presets.includes('pattern') && !opts.brief.no_new_items ? 'REQUIRED: include ≥1 pattern item (use a CORE pattern id when listed).' : ''}

CORE_ITEMS (create exactly these non-verb ids; eg = hint only)
${formatCoreItemsBlock(opts.brief.core_items)}

RECYCLE_IDS (prefer KNOWN payloads; if an id is listed under MISSING_RECYCLE below, CREATE it with MSA ar — never Egyptian eg as ar)
${opts.brief.recycle_ids.join(', ') || '(none)'}

MISSING_RECYCLE (must write these with type + tl + MSA ar; do not copy eg hints)
${opts.brief.recycle_ids.filter((id) => !knownFull.has(id) || !(knownFull.get(id) as { ar?: string })?.ar).join(', ') || '(none)'}

KNOWN_ITEMS (selected matches + recycle only; reuse these ids and tl exactly; do not redefine known ones)
${knownLines}
`;

  const systemModules = [
    { name: 'core', version: '1' },
    { name: 'items', version: '1' },
  ];

  const emptyTiming = {
    label: 'items',
    duration_ms: 0,
    input_tokens: 0,
    output_tokens: 0,
    usd_estimate: 0,
  };

  const finish = (
    items: Item[],
    tiered: ReturnType<typeof validateItemsRules>,
    callMeta: {
      timing: Awaited<ReturnType<typeof callJobTool>>['timing'];
      tokens: Awaited<ReturnType<typeof callJobTool>>['tokens'];
      over_budget: boolean;
      model: string;
      provider: Awaited<ReturnType<typeof callJobTool>>['provider'];
    },
    retries: number,
  ) => {
    const extras: JobOutcomeExtras = {
      fatals: tiered.fatals,
      fixes: tiered.fixes,
      warnings: tiered.warnings,
      flagged: tiered.warnings.length > 0 || tiered.fatals.length > 0,
      retries,
      auto_fix_count: tiered.fixes.length,
    };
    return {
      items,
      issues: tiered.warnings.map(
        (w) => `${w.rule}: ${w.path}: ${w.message}`,
      ),
      ...extras,
      ...callMeta,
      userBody: user,
      systemModules,
    };
  };

  // Story / day 30: skip LLM — bank is recycle + nothing new.
  if (opts.brief.no_new_items) {
    const items = coerceBank(
      applySayToItems(
        mergeRecycleAndVerbs([], opts.brief, knownFull),
      ) as Item[],
    );
    const tiered = validateItemsRules(items, opts.known, presets, opts.brief);
    return finish(
      items,
      tiered,
      {
        timing: emptyTiming as Awaited<ReturnType<typeof callJobTool>>['timing'],
        tokens: { system: 0, input: 0, output: 0 },
        over_budget: false,
        model: 'code',
        provider: 'anthropic' as Awaited<
          ReturnType<typeof callJobTool>
        >['provider'],
      },
      0,
    );
  }

  let call = await callJobTool({
    kind: 'items',
    label: 'items',
    systemPrompt: buildItemsSystemPrompt(),
    brief: opts.brief,
    userBody: user,
    toolName: 'submit_items',
    toolDescription: 'Submit the day item bank.',
    schema: ItemsJobSchema,
    systemModules,
  });

  let retries = 0;
  let parsed = ItemsJobSchema.safeParse(call.data);
  if (!parsed.success || call.data == null) {
    const hints = formatRetryHints([
      fatal(
        'items',
        'schema',
        parsed.success
          ? 'missing top-level items'
          : parsed.error.issues[0]?.message ?? 'schema failed',
      ),
    ]);
    retries = 1;
    call = await callJobTool({
      kind: 'items',
      label: 'items:retry',
      systemPrompt: buildItemsSystemPrompt(),
      brief: opts.brief,
      userBody: `${user}\n\n${hints}\nUse exact CORE_ITEMS ids. No say. Phrases need context_eg+cloze.`,
      toolName: 'submit_items',
      toolDescription: 'Submit the day item bank.',
      schema: ItemsJobSchema,
    });
    parsed = ItemsJobSchema.safeParse(call.data);
    if (!parsed.success || !Array.isArray((call.data as { items?: unknown })?.items)) {
      return finish(
        [],
        {
          fatals: [
            fatal(
              'items',
              'schema',
              'tool/schema failed after retry',
            ),
          ],
          fixes: [],
          warnings: [],
        },
        {
          timing: call.timing,
          tokens: call.tokens,
          over_budget: call.over_budget,
          model: call.model,
          provider: call.provider,
        },
        retries,
      );
    }
  }

  const processPayload = (data: { items: unknown[] }) => {
    const cleaned = data.items.map((raw) => {
      const { say: _drop, ...rest } = raw as Record<string, unknown>;
      return rest;
    });
    let items = coerceBank(
      applySayToItems(
        mergeRecycleAndVerbs(
          normalizeOutlineItems(
            cleaned as { type: string; id: string }[],
          ) as Item[],
          opts.brief,
          knownFull,
        ),
      ) as Item[],
    );
    const coreOpts = { coreItems: opts.brief.core_items };
    items = applyPatternKindsFromCore(items, opts.brief.core_items);
    if (presets.includes('pattern')) {
      items = ensurePatternSkeleton(items, coreOpts);
    }
    items = fillPatternsInBank(items, coreOpts);
    items = ensurePluralPairItems(items).bank;
    items = applyPhraseRolesFromCore(items, opts.brief.core_items);
    // Copy replies_to from core when present
    const repliesById = new Map(
      opts.brief.core_items
        .filter((c) => c.replies_to)
        .map((c) => [c.id, c.replies_to!] as const),
    );
    items = items.map((it) => {
      if (it.type !== 'phrase') return it;
      const rt = repliesById.get(it.id);
      return rt ? ({ ...it, replies_to: rt } as Item) : it;
    });
    const heard = ensureHeardReplies(items, {
      known: [...knownFull.values()],
      maxExtras: 2,
    });
    items = heard.items;
    items = coerceBank(applySayToItems(items) as Item[]);
    items = applyEgSayToItems(items);
    normalizeWordMeanings(items);
    items = applyHasCardFlags(items, new Set(opts.brief.recycle_ids));
    return items;
  };

  let items = processPayload(parsed.data);
  let tiered = validateItemsRules(items, opts.known, presets, opts.brief);

  if (tiered.fatals.length && retries === 0) {
    retries = 1;
    const hints = formatRetryHints([...tiered.fatals, ...tiered.warnings]);
    call = await callJobTool({
      kind: 'items',
      label: 'items:retry',
      systemPrompt: buildItemsSystemPrompt(),
      brief: opts.brief,
      userBody: `${user}\n\n${hints}`,
      toolName: 'submit_items',
      toolDescription: 'Submit the day item bank.',
      schema: ItemsJobSchema,
    });
    parsed = ItemsJobSchema.safeParse(call.data);
    if (parsed.success) {
      items = processPayload(parsed.data);
      tiered = validateItemsRules(items, opts.known, presets, opts.brief);
    }
  }

  return finish(items, tiered, {
    timing: call.timing,
    tokens: call.tokens,
    over_budget: call.over_budget,
    model: call.model,
    provider: call.provider,
  }, retries);
}
