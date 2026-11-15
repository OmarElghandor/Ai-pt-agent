import { connectMongo, mongoConfigured } from '@/lib/mongo';
import { V2LibraryEpisodeModel } from '@/lib/v2/mongo/libraryModels';
import {
  enqueueJob,
  finishJob,
  markJobRunning,
  mongoJobStore,
  type JobStore,
  type JobRecord,
} from './jobs';
import {
  callWithRetry,
  defaultCallModel,
  emptyUsage,
  usageCost,
  type CallModel,
} from './scriptModel';
import { ScriptError } from './scriptGenerate';
import {
  TOKENS_PROMPT_VERSION,
  buildTokensSystem,
  buildTokensUser,
  parseTokensOutput,
  preserveHandEditedLines,
  editToken,
  mergeTokensIntoChunk,
  splitChunk,
  type LibraryToken,
} from './tokens';
import { clearStale } from './stages';
import { LIBRARY_LANG, type EpisodeStages } from './types';

function requireMongo() {
  if (!mongoConfigured()) throw new Error('MongoDB not configured');
}

export type StartTokensResult =
  | { ok: true; job: JobRecord }
  | { ok: false; conflict: true; job: JobRecord };

export async function startTokensJob(
  slug: string,
  opts: {
    lang?: string;
    line_indexes?: number[];
    by?: string;
    store?: JobStore;
  } = {},
): Promise<StartTokensResult> {
  const lang = opts.lang ?? LIBRARY_LANG;
  requireMongo();
  await connectMongo();
  const episode = await V2LibraryEpisodeModel()
    .findOne({ target_lang: lang, slug })
    .sort({ version: -1 })
    .lean();
  if (!episode) throw new ScriptError('episode not found', 404, 'not_found');
  const lines = (episode.lines ?? []) as { tl?: string }[];
  if (lines.length === 0) {
    throw new ScriptError('مفيش سكريبت لسه', 400, 'no_script');
  }
  const store = opts.store ?? mongoJobStore();
  const enq = await enqueueJob(
    'library_tokens',
    slug,
    {
      lang,
      params: {
        line_indexes: opts.line_indexes ?? null,
        by: opts.by ?? null,
      },
    },
    store,
  );
  if (!enq.ok) return { ok: false, conflict: true, job: enq.job };
  return { ok: true, job: enq.job };
}

/** Split large episodes into scene batches (~60 line threshold). */
export function batchLineIndexes(
  lines: { scene?: number }[],
  only?: number[] | null,
): number[][] {
  const indexes =
    only && only.length
      ? only.filter((i) => i >= 0 && i < lines.length)
      : lines.map((_, i) => i);
  if (indexes.length <= 60) return [indexes];
  const byScene = new Map<number, number[]>();
  for (const i of indexes) {
    const s = lines[i]?.scene ?? 1;
    byScene.set(s, [...(byScene.get(s) ?? []), i]);
  }
  const batches = [...byScene.values()];
  if (batches.length >= 2) return batches;
  const mid = Math.ceil(indexes.length / 2);
  return [indexes.slice(0, mid), indexes.slice(mid)];
}

export async function runTokensJob(
  jobId: string,
  slug: string,
  opts: {
    lang?: string;
    line_indexes?: number[] | null;
    store?: JobStore;
    callModel?: CallModel;
    by?: string;
  } = {},
): Promise<void> {
  const lang = opts.lang ?? LIBRARY_LANG;
  const store = opts.store ?? mongoJobStore();
  const callModel = opts.callModel ?? defaultCallModel;
  const now = new Date();
  await markJobRunning(store, jobId, now);

  requireMongo();
  await connectMongo();
  const episode = await V2LibraryEpisodeModel()
    .findOne({ target_lang: lang, slug })
    .sort({ version: -1 });
  if (!episode) {
    await finishJob(store, jobId, { status: 'failed', error: 'not found' });
    return;
  }

  episode.stages = {
    ...episode.stages,
    tokens: { status: 'generating', stale: false, updated_at: now },
  } as EpisodeStages;
  episode.markModified('stages');
  await episode.save();

  const lines = (episode.lines ?? []) as {
    tl: string;
    ar: string;
    scene?: number;
    tokens?: LibraryToken[];
    tokens_hand_edited?: boolean;
  }[];
  const batches = batchLineIndexes(lines, opts.line_indexes);
  const rebuilt = new Map<number, LibraryToken[]>();
  const usage = emptyUsage();
  const model =
    process.env.LIBRARY_TOKENS_MODEL?.trim() ||
    process.env.CLAUDE_MODEL?.trim() ||
    'claude-haiku-5-5';

  try {
    for (const batch of batches) {
      const payload = batch.map((i) => ({
        index: i,
        tl: lines[i].tl,
        ar: lines[i].ar ?? '',
      }));
      const result = await callWithRetry({
        callModel,
        system: buildTokensSystem(),
        user: buildTokensUser(payload),
        model: process.env.LIBRARY_TOKENS_MODEL?.trim() || undefined,
        maxTokens: 12_000,
        label: `library_tokens:${slug}`,
        parse: (data) => {
          const parsed = parseTokensOutput(data, batch);
          if (parsed.error || !parsed.lines) {
            return {
              fatal: [
                {
                  code: 'no_parse' as const,
                  message: parsed.error ?? 'bad tokens',
                },
              ],
            };
          }
          return { value: parsed.lines };
        },
      });
      usage.calls += result.usage.calls;
      usage.input_tokens += result.usage.input_tokens;
      usage.output_tokens += result.usage.output_tokens;
      if (result.usage.model) usage.model = result.usage.model;
      if (!result.ok) {
        throw new Error(result.attempts.at(-1)?.errors[0]?.message ?? 'tokens failed');
      }
      for (const row of result.value) {
        rebuilt.set(row.line_index, row.tokens);
      }
    }

    const rebuiltIndexes = [...rebuilt.keys()];
    const nextTokens = preserveHandEditedLines(lines, rebuiltIndexes, rebuilt);
    episode.lines = lines.map((l, i) => ({
      ...l,
      tokens: nextTokens[i] ?? l.tokens,
    }));
    const finishedAt = new Date();
    let stages = clearStale(episode.stages as EpisodeStages, 'tokens', finishedAt);
    stages = {
      ...stages,
      tokens: { status: 'ready', stale: false, updated_at: finishedAt },
    };
    episode.stages = stages;
    const pv = {
      ...((episode.prompt_versions as Record<string, string>) ?? {}),
      tokens: TOKENS_PROMPT_VERSION,
    };
    episode.prompt_versions = pv;
    const cost = usageCost(usage, model);
    const costs = { ...((episode.costs as Record<string, unknown>) ?? {}) };
    const prev = typeof costs.tokens_usd === 'number' ? costs.tokens_usd : 0;
    costs.tokens_usd = Math.round((prev + cost.usd) * 10000) / 10000;
    episode.costs = costs;
    episode.markModified('lines');
    episode.markModified('stages');
    episode.markModified('prompt_versions');
    episode.markModified('costs');
    await episode.save();
    await finishJob(
      store,
      jobId,
      {
        status: 'done',
        attempts: 1,
        cost,
        result: { rebuilt: rebuiltIndexes, prompt_version: TOKENS_PROMPT_VERSION },
      },
      finishedAt,
    );
  } catch (e) {
    const finishedAt = new Date();
    episode.stages = {
      ...episode.stages,
      tokens: {
        status: 'failed',
        stale: false,
        updated_at: finishedAt,
      },
    } as EpisodeStages;
    episode.markModified('stages');
    await episode.save();
    await finishJob(
      store,
      jobId,
      {
        status: 'failed',
        error: e instanceof Error ? e.message : String(e),
        cost: usageCost(usage, model),
      },
      finishedAt,
    );
  }
}

export async function patchLineTokens(
  slug: string,
  lineIndex: number,
  action:
    | { type: 'edit'; token_index: number; lemma?: string; meaning_ar?: string }
    | { type: 'merge'; from: number; to: number }
    | { type: 'split'; chunk_id: string },
  opts: { lang?: string; by?: string } = {},
) {
  const lang = opts.lang ?? LIBRARY_LANG;
  requireMongo();
  await connectMongo();
  const episode = await V2LibraryEpisodeModel()
    .findOne({ target_lang: lang, slug })
    .sort({ version: -1 });
  if (!episode) throw new ScriptError('not found', 404);
  const lines = (episode.lines ?? []) as {
    tokens?: LibraryToken[];
    tokens_hand_edited?: boolean;
  }[];
  if (lineIndex < 0 || lineIndex >= lines.length) {
    throw new ScriptError('bad line_index', 400);
  }
  let tokens = [...(lines[lineIndex].tokens ?? [])];
  if (action.type === 'edit') {
    tokens = editToken(tokens, action.token_index, {
      lemma: action.lemma,
      meaning_ar: action.meaning_ar,
    });
  } else if (action.type === 'merge') {
    tokens = mergeTokensIntoChunk(tokens, action.from, action.to);
  } else {
    tokens = splitChunk(tokens, action.chunk_id);
  }
  lines[lineIndex] = {
    ...lines[lineIndex],
    tokens,
    tokens_hand_edited: true,
  };
  episode.lines = lines;
  if (opts.by) {
    const audit = Array.isArray(episode.audit) ? [...episode.audit] : [];
    audit.push({
      action: 'token_hand_edit',
      by: opts.by,
      at: new Date(),
      line_index: lineIndex,
      edit: action.type,
    });
    episode.audit = audit;
    episode.markModified('audit');
  }
  episode.markModified('lines');
  await episode.save();
  return tokens;
}
