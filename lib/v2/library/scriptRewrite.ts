import { connectMongo, mongoConfigured } from '@/lib/mongo';
import {
  V2LibraryBriefModel,
  V2LibraryEpisodeModel,
  V2LibraryVoiceModel,
} from '@/lib/v2/mongo/libraryModels';
import {
  enqueueJob,
  finishJob,
  markJobRunning,
  mongoJobStore,
  type JobStore,
  type JobRecord,
} from './jobs';
import {
  PROMPT_VERSION as REWRITE_PROMPT_VERSION,
  buildSystem,
  buildUser,
  type RewriteContextLine,
} from './prompts/rewrite';
import type { ScriptPromptBrief } from './prompts/script';
import {
  callWithRetry,
  defaultCallModel,
  scriptModelId,
  scriptModelLabel,
  usageCost,
  REWRITE_MAX_TOKENS,
  type CallModel,
} from './scriptModel';
import {
  normalizeLine,
  type ScriptLine,
} from './scriptChecks';
import { LIBRARY_LANG, type EpisodeStages } from './types';
import { ScriptError, type EpisodeLine } from './scriptGenerate';

const CONTEXT_RADIUS = 3;

export type RewriteMode = 'line' | 'moment';

export type RewriteParams = {
  mode: RewriteMode;
  line_index?: number;
  moment_id?: string;
  instruction?: string;
};

function requireMongo() {
  if (!mongoConfigured()) throw new Error('MongoDB not configured');
}

async function toPromptBrief(
  brief: {
    type: string;
    target_level: number;
    intro_eg: string;
    cast: { voice_key: string; role_eg: string; learner: boolean }[];
    places: string[];
    beats: string[];
    must_have_phrases: string[];
    moments: { id: string; eg: string; direction: string; must_say: string }[];
  },
  lang: string,
): Promise<ScriptPromptBrief> {
  const keys = brief.cast.map((c) => c.voice_key);
  const voices = await V2LibraryVoiceModel()
    .find({ target_lang: lang, key: { $in: keys } })
    .select('key gender')
    .lean();
  const gender = new Map(voices.map((v) => [v.key, v.gender as 'm' | 'f' | undefined]));
  return {
    type: brief.type as 'story' | 'podcast',
    target_level: brief.target_level,
    intro_eg: brief.intro_eg,
    cast: brief.cast.map((c) => ({
      voice_key: c.voice_key,
      role_eg: c.role_eg,
      learner: c.learner,
      gender: gender.get(c.voice_key) ?? null,
    })),
    places: brief.places ?? [],
    beats: brief.beats ?? [],
    must_have_phrases: brief.must_have_phrases ?? [],
    moments: (brief.moments ?? []).map((m) => ({
      id: m.id,
      eg: m.eg,
      direction: m.direction,
      must_say: m.must_say ?? '',
    })),
  };
}

/** Pure: which line indices to rewrite for a mode. */
export function targetIndices(
  lines: { moment?: string }[],
  params: RewriteParams,
): number[] {
  if (params.mode === 'line') {
    const i = params.line_index;
    if (typeof i !== 'number' || !Number.isInteger(i) || i < 0 || i >= lines.length) {
      throw new ScriptError('line_index invalid', 400, 'bad_line_index');
    }
    return [i];
  }
  const mid = params.moment_id?.trim();
  if (!mid) throw new ScriptError('moment_id required', 400, 'bad_moment');
  const idx = lines
    .map((l, i) => ((l.moment ?? '') === mid ? i : -1))
    .filter((i) => i >= 0);
  if (idx.length === 0) {
    throw new ScriptError('moment has no lines', 400, 'moment_empty');
  }
  return idx;
}

/** Pure: build the rewrite window (3 before / 3 after the target span). */
export function buildRewriteWindow(
  lines: ScriptLine[],
  targets: number[],
): { context: RewriteContextLine[]; targets: number[] } {
  const lo = Math.min(...targets);
  const hi = Math.max(...targets);
  const from = Math.max(0, lo - CONTEXT_RADIUS);
  const to = Math.min(lines.length - 1, hi + CONTEXT_RADIUS);
  const context: RewriteContextLine[] = [];
  for (let i = from; i <= to; i++) {
    context.push({ ...lines[i], index: i });
  }
  return { context, targets: [...targets].sort((a, b) => a - b) };
}

/**
 * Pure: merge replacement lines into a copy of the script.
 * Keeps scene/moment from the original; marks tokens cleared and audio_stale.
 */
export function applyLineReplacements(
  lines: EpisodeLine[],
  targets: number[],
  replacements: ScriptLine[],
  castKeys: readonly string[],
): { lines: EpisodeLine[]; error?: string } {
  if (replacements.length !== targets.length) {
    return {
      lines,
      error: `expected ${targets.length} replacement lines, got ${replacements.length}`,
    };
  }
  const cast = new Set(castKeys);
  const next = lines.map((l) => ({ ...l }));
  for (let k = 0; k < targets.length; k++) {
    const i = targets[k];
    const r = replacements[k];
    if (!cast.has(r.speaker)) {
      return { lines, error: `speaker "${r.speaker}" is not in the cast` };
    }
    if (!r.tl.trim()) return { lines, error: `replacement ${k} has empty tl` };
    if (!r.ar.trim()) return { lines, error: `replacement ${k} has empty ar` };
    const prev = next[i];
    next[i] = {
      ...prev,
      speaker: r.speaker,
      tl: r.tl,
      ...(r.tl_f ? { tl_f: r.tl_f } : { tl_f: undefined }),
      ar: r.ar,
      scene: prev.scene,
      moment: prev.moment,
      tokens: undefined,
      audio_stale: true,
      audio_key: undefined,
      hand_edited: false,
    };
  }
  return { lines: next };
}

function parseReplacementLines(
  data: unknown,
  count: number,
): { lines?: ScriptLine[]; fatal: { code: 'no_parse' | 'bad_line'; message: string }[] } {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { fatal: [{ code: 'no_parse', message: 'Output is not a JSON object' }] };
  }
  const r = data as Record<string, unknown>;
  if (!Array.isArray(r.lines)) {
    return { fatal: [{ code: 'no_parse', message: 'Output has no "lines" array' }] };
  }
  if (r.lines.length !== count) {
    return {
      fatal: [
        {
          code: 'bad_line',
          message: `Expected ${count} lines, got ${r.lines.length}`,
        },
      ],
    };
  }
  const lines: ScriptLine[] = [];
  for (let i = 0; i < r.lines.length; i++) {
    const n = normalizeLine(r.lines[i]);
    if (!n || !n.tl) {
      return {
        fatal: [
          {
            code: 'bad_line',
            message: `Line ${i} is not a valid replacement`,
          },
        ],
      };
    }
    lines.push(n);
  }
  return { lines, fatal: [] };
}

export type StartRewriteResult =
  | { ok: true; job: JobRecord; targets: number[] }
  | { ok: false; conflict: true; job: JobRecord };

export async function startScriptRewrite(
  slug: string,
  params: RewriteParams,
  opts: { lang?: string; by?: string; store?: JobStore } = {},
): Promise<StartRewriteResult> {
  const lang = opts.lang ?? LIBRARY_LANG;
  requireMongo();
  await connectMongo();
  const brief = await V2LibraryBriefModel()
    .findOne({ target_lang: lang, slug })
    .lean();
  if (!brief) throw new ScriptError('brief not found', 404, 'not_found');
  if (brief.status !== 'approved') {
    throw new ScriptError('الـ brief لسه مش معتمد', 400, 'brief_not_approved');
  }
  const episode = await V2LibraryEpisodeModel()
    .findOne({ target_lang: lang, slug })
    .sort({ version: -1 })
    .lean();
  if (!episode) throw new ScriptError('episode not found', 404, 'not_found');
  const lines = (episode.lines ?? []) as EpisodeLine[];
  if (lines.length === 0) {
    throw new ScriptError('مفيش سكريبت لسه', 400, 'no_script');
  }
  const targets = targetIndices(lines, params);
  if (params.mode === 'moment') {
    const mid = params.moment_id!;
    const known = (brief.moments as { id: string }[] | undefined)?.some(
      (m) => m.id === mid,
    );
    if (!known) throw new ScriptError('moment not on brief', 400, 'bad_moment');
  }
  const store = opts.store ?? mongoJobStore();
  const enq = await enqueueJob(
    'library_line_rewrite',
    slug,
    {
      lang,
      line_index: params.mode === 'line' ? targets[0] : null,
      params: {
        mode: params.mode,
        line_index: params.line_index ?? null,
        moment_id: params.moment_id ?? null,
        instruction: params.instruction?.trim() || null,
        targets,
        by: opts.by ?? null,
      },
    },
    store,
  );
  if (!enq.ok) return { ok: false, conflict: true, job: enq.job };
  return { ok: true, job: enq.job, targets };
}

export async function runScriptRewriteJob(
  jobId: string,
  slug: string,
  params: RewriteParams,
  opts: {
    lang?: string;
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
  const brief = await V2LibraryBriefModel()
    .findOne({ target_lang: lang, slug })
    .lean();
  if (!brief) {
    await finishJob(store, jobId, {
      status: 'failed',
      error: 'brief not found',
    });
    return;
  }
  const episode = await V2LibraryEpisodeModel()
    .findOne({ target_lang: lang, slug })
    .sort({ version: -1 });
  if (!episode) {
    await finishJob(store, jobId, {
      status: 'failed',
      error: 'episode not found',
    });
    return;
  }

  const lines = (episode.lines ?? []) as EpisodeLine[];
  const targets = targetIndices(lines, params);
  const promptBrief = await toPromptBrief(
    brief as Parameters<typeof toPromptBrief>[0],
    lang,
  );
  const { context } = buildRewriteWindow(lines, targets);
  const momentMeta =
    params.mode === 'moment'
      ? promptBrief.moments.find((m) => m.id === params.moment_id) ?? null
      : null;

  episode.stages = {
    ...episode.stages,
    script: {
      ...(episode.stages as EpisodeStages).script,
      status: 'generating',
      updated_at: now,
    },
  } as EpisodeStages;
  episode.markModified('stages');
  await episode.save();

  const system = buildSystem({ target_level: promptBrief.target_level });
  const user = buildUser({
    brief: promptBrief,
    context,
    targets,
    mode: params.mode,
    moment: momentMeta,
    instruction: params.instruction,
  });

  const result = await callWithRetry<ScriptLine[]>({
    callModel,
    system,
    user,
    model: scriptModelId(),
    maxTokens: REWRITE_MAX_TOKENS,
    label: `library_rewrite:${slug}`,
    parse: (data) => {
      const parsed = parseReplacementLines(data, targets.length);
      if (parsed.fatal.length || !parsed.lines) {
        return { fatal: parsed.fatal };
      }
      return { value: parsed.lines };
    },
  });

  const cost = usageCost(result.usage, scriptModelLabel());
  const finishedAt = new Date();

  if (!result.ok) {
    episode.stages = {
      ...episode.stages,
      script: {
        status: 'ready',
        stale: false,
        updated_at: finishedAt,
        stale_reason: undefined,
      },
    } as EpisodeStages;
    episode.markModified('stages');
    await episode.save();
    await finishJob(
      store,
      jobId,
      {
        status: 'failed',
        attempts: result.attempts.length,
        cost,
        error: result.attempts.at(-1)?.errors[0]?.message ?? 'rewrite failed',
        result: { raw_failed: result.attempts, targets },
      },
      finishedAt,
    );
    return;
  }

  const castKeys = promptBrief.cast.map((c) => c.voice_key);
  const merged = applyLineReplacements(lines, targets, result.value, castKeys);
  if (merged.error) {
    episode.stages = {
      ...episode.stages,
      script: { status: 'ready', stale: false, updated_at: finishedAt },
    } as EpisodeStages;
    episode.markModified('stages');
    await episode.save();
    await finishJob(
      store,
      jobId,
      {
        status: 'failed',
        attempts: result.attempts.length + 1,
        cost,
        error: merged.error,
        result: { targets },
      },
      finishedAt,
    );
    return;
  }

  episode.lines = merged.lines;
  episode.stages = {
    ...episode.stages,
    script: { status: 'ready', stale: false, updated_at: finishedAt },
    tokens: {
      ...(episode.stages as EpisodeStages).tokens,
      stale: true,
      stale_reason: 'سطر اتعدل، الكلمات محتاجة تتحدث',
      updated_at: finishedAt,
    },
    review: {
      status: 'open',
      stale: true,
      stale_reason: 'سطر اتعدل، المراجعة محتاجة تتأكد تاني',
      updated_at: finishedAt,
    },
    audio: {
      ...(episode.stages as EpisodeStages).audio,
      stale: true,
      stale_reason: 'سطر اتعدل، الصوت محتاج يتعمل تاني',
      updated_at: finishedAt,
    },
  } as EpisodeStages;
  const pv = {
    ...((episode.prompt_versions as Record<string, string> | null) ?? {}),
    rewrite: REWRITE_PROMPT_VERSION,
  };
  episode.prompt_versions = pv;
  const costs = {
    ...((episode.costs as Record<string, unknown> | null) ?? {}),
  };
  const prev =
    typeof costs.script_usd === 'number' ? (costs.script_usd as number) : 0;
  costs.script_usd = Math.round((prev + cost.usd) * 10000) / 10000;
  episode.costs = costs;
  if (opts.by) {
    const audit = Array.isArray(episode.audit) ? [...episode.audit] : [];
    audit.push({
      action: 'script_rewrite',
      by: opts.by,
      at: finishedAt,
      targets,
      mode: params.mode,
    });
    episode.audit = audit;
    episode.markModified('audit');
  }
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
      attempts: result.attempts.length + 1,
      cost,
      result: {
        targets,
        mode: params.mode,
        prompt_version: REWRITE_PROMPT_VERSION,
      },
    },
    finishedAt,
  );
}
