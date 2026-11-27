import { z } from 'zod';
import {
  callClaudeJson,
  zodToolSchema,
} from '@/lib/generation/claudeClient';
import type { Item } from '@/lib/v2/content/items';
import {
  findOfficialItemId,
  resolveOrCreateCustomItem,
} from '@/lib/v2/decks/items';
import type { CustomItemPos } from '@/lib/v2/decks/keys';
import type { OutlineClip, OutlineSeries } from '@/lib/v2/micro/outline';
import { synthesizeMicroImageSpec } from '@/lib/v2/micro/images/main';
import { checkMicroLines, type CheckedMicroLine } from './checks';
import { listRegularVerifiedLemmas } from './highlight';
import {
  MICRO_GENERATE_SYSTEM,
  buildMicroGenerateUser,
  buildMicroTopUpUser,
} from './prompt';
import {
  GenerateClipOutputSchema,
  TopUpClipOutputSchema,
  type GenerateClipOutput,
  type GeneratedLine,
} from './schema';

export type ModelCallArgs = {
  system: string;
  user: string;
  schema: z.ZodType;
  toolName: string;
  label: string;
};

export type ModelCaller = (
  args: ModelCallArgs,
) => Promise<{ data: unknown; latency_ms: number; usage?: { input_tokens?: number; output_tokens?: number } }>;

export type ResolvedMicroLine = CheckedMicroLine & {
  item_id: string;
  icon_key?: string;
};

export type GenerateClipOk = {
  ok: true;
  title_tl: string;
  title_ar: string;
  note?: string;
  image_spec: string;
  rule_card?: GenerateClipOutput['rule_card'];
  lines: ResolvedMicroLine[];
  dropped_count: number;
  top_up_called: boolean;
  model_calls: number;
  latency_ms: number;
  cost_tokens: number;
  authored: boolean;
};

export type GenerateClipFail = {
  ok: false;
  reason: 'too_few_lines' | 'parse_failed' | 'not_enough_regular_verbs';
  message: string;
  lines: ResolvedMicroLine[];
  dropped_count: number;
  top_up_called: boolean;
  model_calls: number;
  latency_ms: number;
  cost_tokens: number;
  authored: boolean;
};

export type GenerateClipResult = GenerateClipOk | GenerateClipFail;

const DEFAULT_MODEL =
  process.env.MICRO_CLIP_MODEL?.trim() ||
  process.env.CUSTOM_DECK_MODEL?.trim() ||
  process.env.CLAUDE_MODEL?.trim() ||
  'claude-sonnet-5-5';

async function defaultCaller(
  args: ModelCallArgs,
): Promise<{ data: unknown; latency_ms: number; usage?: { input_tokens?: number; output_tokens?: number } }> {
  const started = Date.now();
  const result = await callClaudeJson(args.system, args.user, {
    label: args.label,
    model: DEFAULT_MODEL,
    maxTokens: 4096,
    skipProviderFork: true,
    tool: {
      name: args.toolName,
      description: 'Submit the micro clip JSON.',
      inputSchema: zodToolSchema(args.schema),
    },
  });
  return {
    data: result.data,
    latency_ms: Date.now() - started,
    usage: result.usage as { input_tokens?: number; output_tokens?: number } | undefined,
  };
}

function tokensOf(usage?: { input_tokens?: number; output_tokens?: number }): number {
  return (usage?.input_tokens ?? 0) + (usage?.output_tokens ?? 0);
}

function iconKey(concept?: string): string | undefined {
  if (!concept) return undefined;
  return `icon.${concept}`;
}

async function resolveLines(
  kept: CheckedMicroLine[],
  opts: {
    targetLang: string;
    known?: Map<string, Item>;
    memoryStore?: Map<string, unknown>;
  },
): Promise<ResolvedMicroLine[]> {
  const out: ResolvedMicroLine[] = [];
  for (const line of kept) {
    const pos = line.pos as CustomItemPos;
    let itemId: string | null = null;
    if (opts.known) {
      itemId = findOfficialItemId(opts.known, line.tl, pos);
    }
    if (!itemId) {
      const resolved = await resolveOrCreateCustomItem({
        target_lang: opts.targetLang,
        tl: line.tl,
        pos,
        ar: line.ar,
        eg_note: undefined,
        example_tl: line.tl,
        example_ar: line.ar,
        concept_en: line.concept_en,
        known: opts.known,
        memoryStore: opts.memoryStore as never,
      });
      itemId = resolved.item_id;
      // Mark pool items from micro as official when created for published series later;
      // generation stores the id; publish sets status.
    }
    out.push({
      ...line,
      item_id: itemId,
      icon_key: iconKey(line.concept_en),
    });
  }
  return out;
}

function authoredToGenerated(clip: OutlineClip): GenerateClipOutput {
  return {
    title_tl: clip.title_tl,
    title_ar: clip.title_ar,
    note: clip.note,
    image_spec:
      clip.image_spec?.trim() ||
      synthesizeMicroImageSpec({
        title_tl: clip.title_tl,
        layout: clip.layout,
        prompt_guidance: clip.prompt_guidance,
      }),
    rule_card: clip.rule_card,
    lines: (clip.authored_lines ?? []).map((l) => ({
      tl: l.tl,
      ar: l.ar,
      pos: l.pos,
      concept_en: l.concept_en,
      icon_spec: l.icon_spec,
      region_hint: l.region_hint,
      verb_lemma: l.verb_lemma,
    })),
  };
}

function resolveImageSpec(
  raw: GenerateClipOutput,
  clip: OutlineClip,
): string {
  const fromModel = raw.image_spec?.trim();
  if (fromModel) return fromModel;
  return synthesizeMicroImageSpec({
    title_tl: raw.title_tl || clip.title_tl,
    layout: clip.layout,
    prompt_guidance: clip.prompt_guidance,
  });
}

/**
 * Generate one clip from an outline line (19 M2).
 * Authored override → no model call.
 */
export async function generateMicroClip(opts: {
  series: OutlineSeries;
  clip: OutlineClip;
  targetLang?: string;
  callModel?: ModelCaller;
  known?: Map<string, Item>;
  memoryStore?: Map<string, unknown>;
  reuseItemHints?: string[];
}): Promise<GenerateClipResult> {
  const targetLang = opts.targetLang ?? 'pt-PT';
  const callModel = opts.callModel ?? defaultCaller;
  let modelCalls = 0;
  let latency = 0;
  let costTokens = 0;
  let topUp = false;

  let raw: GenerateClipOutput;
  const authored = Boolean(opts.clip.authored_lines?.length);
  const ruleKind = opts.clip.rule_kind ?? 'verb_ending';
  const isVerbEndingRule =
    opts.clip.layout === 'rule' && ruleKind === 'verb_ending';
  const regularLemmas = isVerbEndingRule ? listRegularVerifiedLemmas() : [];

  if (isVerbEndingRule) {
    console.log(
      `[micro-clip:${opts.clip.slug}] regular verified lemmas: ${regularLemmas.length}`,
    );
  }

  if (isVerbEndingRule && !authored && regularLemmas.length < 6) {
    return {
      ok: false,
      reason: 'not_enough_regular_verbs',
      message: 'not enough regular verbs in the table',
      lines: [],
      dropped_count: 0,
      top_up_called: false,
      model_calls: 0,
      latency_ms: 0,
      cost_tokens: 0,
      authored: false,
    };
  }

  const checkOpts = {
    layout: opts.clip.layout,
    requireLemma: undefined as string | undefined,
    ruleKind: opts.clip.layout === 'rule' ? ruleKind : undefined,
    ruleTense: opts.clip.rule_tense,
    rulePerson: opts.clip.rule_person,
    ruleHighlight: opts.clip.rule_highlight,
  };

  if (authored) {
    raw = authoredToGenerated(opts.clip);
  } else {
    const res = await callModel({
      system: MICRO_GENERATE_SYSTEM,
      user: buildMicroGenerateUser({
        clip: opts.clip,
        seriesTitleAr: opts.series.title_ar,
        seriesTitleTl: opts.series.title_tl,
        reuseItemHints: opts.reuseItemHints,
        regularLemmas: isVerbEndingRule ? regularLemmas : undefined,
      }),
      schema: GenerateClipOutputSchema,
      toolName: 'submit_micro_clip',
      label: `micro-clip:${opts.clip.slug}`,
    });
    modelCalls += 1;
    latency += res.latency_ms;
    costTokens += tokensOf(res.usage);
    const parsed = GenerateClipOutputSchema.safeParse(res.data);
    if (!parsed.success) {
      // Soft-accept missing image_spec; synthesize below.
      const soft = GenerateClipOutputSchema.omit({
        image_spec: true,
      }).extend({ image_spec: z.string().optional() }).safeParse(res.data);
      if (!soft.success) {
        return {
          ok: false,
          reason: 'parse_failed',
          message: parsed.error.message,
          lines: [],
          dropped_count: 0,
          top_up_called: false,
          model_calls: modelCalls,
          latency_ms: latency,
          cost_tokens: costTokens,
          authored: false,
        };
      }
      raw = {
        ...soft.data,
        image_spec: soft.data.image_spec?.trim() || '',
      };
    } else {
      raw = parsed.data;
    }
  }

  const requireLemma =
    opts.series.slug === 'daily-verbs' ? opts.clip.slug.replace(/-/g, ' ') : undefined;
  checkOpts.requireLemma =
    requireLemma && lemmaLooksLikeVerb(requireLemma) ? requireLemma : undefined;

  let { kept, dropped } = checkMicroLines(raw.lines, checkOpts);

  if (kept.length < 6 && !authored) {
    topUp = true;
    const need = 6 - kept.length;
    const res = await callModel({
      system: MICRO_GENERATE_SYSTEM,
      user: buildMicroTopUpUser({
        clip: opts.clip,
        keptTls: kept.map((l) => l.tl),
        need,
        regularLemmas: isVerbEndingRule ? regularLemmas : undefined,
      }),
      schema: TopUpClipOutputSchema,
      toolName: 'submit_micro_clip_topup',
      label: `micro-clip-topup:${opts.clip.slug}`,
    });
    modelCalls += 1;
    latency += res.latency_ms;
    costTokens += tokensOf(res.usage);
    const parsed = TopUpClipOutputSchema.safeParse(res.data);
    if (parsed.success) {
      const more = checkMicroLines(parsed.data.lines as GeneratedLine[], checkOpts);
      // Dedupe against already kept
      const have = new Set(kept.map((l) => l.tl.toLowerCase()));
      for (const line of more.kept) {
        if (!have.has(line.tl.toLowerCase())) {
          kept.push(line);
          have.add(line.tl.toLowerCase());
        }
      }
      dropped = [...dropped, ...more.dropped];
    }
  }

  const resolved = await resolveLines(kept.slice(0, 10), {
    targetLang,
    known: opts.known,
    memoryStore: opts.memoryStore,
  });

  // Authored scene plans (§3.2b) may have 3–5 lines tied to planned objects.
  const minLines =
    authored && opts.clip.scene_key ? 3 : authored ? 3 : 6;
  if (resolved.length < minLines) {
    return {
      ok: false,
      reason: 'too_few_lines',
      message: `Only ${resolved.length} good lines after checks`,
      lines: resolved,
      dropped_count: dropped.length,
      top_up_called: topUp,
      model_calls: modelCalls,
      latency_ms: latency,
      cost_tokens: costTokens,
      authored,
    };
  }

  return {
    ok: true,
    title_tl: raw.title_tl,
    title_ar: raw.title_ar,
    note: raw.note ?? opts.clip.note,
    image_spec: resolveImageSpec(raw, opts.clip),
    rule_card: raw.rule_card ?? opts.clip.rule_card,
    lines: resolved,
    dropped_count: dropped.length,
    top_up_called: topUp,
    model_calls: modelCalls,
    latency_ms: latency,
    cost_tokens: costTokens,
    authored,
  };
}

function lemmaLooksLikeVerb(s: string): boolean {
  return /ar$|er$|ir$/.test(s.trim()) || ['ser', 'estar', 'ter', 'ir', 'fazer', 'querer', 'poder', 'saber', 'ver', 'dar'].includes(s.trim());
}

export { checkMicroLines } from './checks';
export {
  findEndingHighlight,
  highlightFormInLine,
  highlightTokensInLine,
  isRegularVerifiedLemma,
  listRegularVerifiedLemmas,
} from './highlight';
