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
  PROMPT_VERSION as SCRIPT_PROMPT_VERSION,
  buildSystem,
  buildUser,
  estimateTokens,
  type ScriptPromptBrief,
} from './prompts/script';
import {
  callWithRetry,
  defaultCallModel,
  scriptModelId,
  scriptModelLabel,
  usageCost,
  type CallModel,
} from './scriptModel';
import {
  checkScript,
  type ParsedScript,
  type ScriptCheckContext,
  type ScriptWarning,
} from './scriptChecks';
import { clearStale, markStale } from './stages';
import { LIBRARY_LANG, type EpisodeStages } from './types';

export class ScriptError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly extra?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export type EpisodeLine = ParsedScript['lines'][number] & {
  tokens?: unknown[];
  audio_stale?: boolean;
  hand_edited?: boolean;
  tokens_hand_edited?: boolean;
  audio_key?: string | null;
  character_count?: number;
};

function requireMongo() {
  if (!mongoConfigured()) throw new Error('MongoDB not configured');
}

async function loadBriefAndEpisode(slug: string, lang: string) {
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
    .sort({ version: -1 });
  if (!episode) throw new ScriptError('episode not found', 404, 'not_found');
  return { brief, episode };
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

function checkCtx(
  brief: ScriptPromptBrief,
): ScriptCheckContext {
  return {
    cast_keys: brief.cast.map((c) => c.voice_key),
    moments: brief.moments,
    target_level: brief.target_level,
  };
}

export function scriptEstimateForBrief(brief: ScriptPromptBrief) {
  const tokens = estimateTokens(brief);
  return {
    model: scriptModelLabel(),
    ...tokens,
  };
}

export type StartScriptResult =
  | { ok: true; job: JobRecord; estimate: ReturnType<typeof scriptEstimateForBrief> }
  | { ok: false; conflict: true; job: JobRecord };

/**
 * Enqueue a full script generation. Caller fire-and-forgets `runScriptJob`.
 */
export async function startScriptGenerate(
  slug: string,
  opts: {
    lang?: string;
    force?: boolean;
    by?: string;
    store?: JobStore;
  } = {},
): Promise<StartScriptResult> {
  const lang = opts.lang ?? LIBRARY_LANG;
  const { brief } = await loadBriefAndEpisode(slug, lang);
  const promptBrief = await toPromptBrief(
    brief as Parameters<typeof toPromptBrief>[0],
    lang,
  );
  const estimate = scriptEstimateForBrief(promptBrief);
  const store = opts.store ?? mongoJobStore();
  const enq = await enqueueJob(
    'library_script',
    slug,
    {
      lang,
      params: { force: !!opts.force, by: opts.by ?? null, estimate },
    },
    store,
  );
  if (!enq.ok) return { ok: false, conflict: true, job: enq.job };
  return { ok: true, job: enq.job, estimate };
}

export type RunScriptOpts = {
  lang?: string;
  store?: JobStore;
  callModel?: CallModel;
  by?: string;
};

/** Apply a successful script onto the episode document (mutable mongoose doc or plain). */
export function applyScriptToEpisode(
  episode: {
    title_tl?: string | null;
    title_ar?: string | null;
    lines: EpisodeLine[];
    notes: unknown[];
    warnings: ScriptWarning[];
    stages: EpisodeStages;
    prompt_versions?: Record<string, string> | null;
    costs?: Record<string, unknown> | null;
    script_failure?: unknown;
    markModified?: (path: string) => void;
  },
  script: ParsedScript,
  warnings: ScriptWarning[],
  costUsd: number,
  now: Date = new Date(),
): void {
  const hadScript =
    episode.stages.script.status === 'ready' ||
    (Array.isArray(episode.lines) && episode.lines.length > 0);
  episode.title_tl = script.title_tl;
  episode.title_ar = script.title_ar;
  episode.lines = script.lines.map((l) => ({
    ...l,
    audio_stale: true,
    tokens: undefined,
  }));
  episode.notes = script.notes;
  episode.warnings = warnings;
  episode.script_failure = null;
  const pv = { ...(episode.prompt_versions ?? {}), script: SCRIPT_PROMPT_VERSION };
  episode.prompt_versions = pv;
  const costs = { ...(episode.costs ?? {}) } as Record<string, unknown>;
  const prev = typeof costs.script_usd === 'number' ? costs.script_usd : 0;
  costs.script_usd = Math.round((prev + costUsd) * 10000) / 10000;
  episode.costs = costs;

  let stages = clearStale(episode.stages, 'script', now);
  stages = {
    ...stages,
    script: { status: 'ready', stale: false, updated_at: now },
    tokens: { status: 'none', stale: false, updated_at: now },
    review: { status: 'open', stale: false, updated_at: now },
  };
  if (hadScript) {
    stages = markStale(
      stages,
      'script',
      'السكريبت اتغير، الكلمات والصوت محتاجين يتعملوا تاني',
      now,
    );
    // markStale skips script itself; tokens/review/audio that had output get stale.
    // Force tokens/audio stale flags on lines already set above.
  }
  episode.stages = stages;
  episode.markModified?.('lines');
  episode.markModified?.('notes');
  episode.markModified?.('warnings');
  episode.markModified?.('stages');
  episode.markModified?.('prompt_versions');
  episode.markModified?.('costs');
  episode.markModified?.('script_failure');
}

export async function runScriptJob(
  jobId: string,
  slug: string,
  opts: RunScriptOpts = {},
): Promise<void> {
  const lang = opts.lang ?? LIBRARY_LANG;
  const store = opts.store ?? mongoJobStore();
  const callModel = opts.callModel ?? defaultCallModel;
  const now = new Date();

  await markJobRunning(store, jobId, now);

  requireMongo();
  await connectMongo();
  const { brief, episode } = await loadBriefAndEpisode(slug, lang);
  const promptBrief = await toPromptBrief(
    brief as Parameters<typeof toPromptBrief>[0],
    lang,
  );
  const ctx = checkCtx(promptBrief);

  episode.stages = {
    ...episode.stages,
    script: {
      status: 'generating',
      stale: false,
      updated_at: now,
    },
  };
  episode.markModified('stages');
  await episode.save();

  const system = buildSystem({
    target_level: promptBrief.target_level,
    type: promptBrief.type,
  });
  const user = buildUser(promptBrief);

  const result = await callWithRetry({
    callModel,
    system,
    user,
    model: scriptModelId(),
    maxTokens: 16_000,
    label: `library_script:${slug}`,
    parse: (data) => {
      const checked = checkScript(data, ctx);
      if (!checked.ok || !checked.script) {
        return { fatal: checked.fatal };
      }
      return { value: { script: checked.script, warnings: checked.warnings } };
    },
  });

  const cost = usageCost(result.usage, scriptModelLabel());
  const finishedAt = new Date();

  if (!result.ok) {
    episode.stages = {
      ...episode.stages,
      script: { status: 'failed', stale: false, updated_at: finishedAt },
    };
    episode.script_failure = {
      raw_failed: result.attempts,
      at: finishedAt,
    };
    episode.markModified('stages');
    episode.markModified('script_failure');
    await episode.save();
    await finishJob(
      store,
      jobId,
      {
        status: 'failed',
        attempts: result.attempts.length,
        cost,
        error: result.attempts.at(-1)?.errors[0]?.message ?? 'script failed',
        result: { raw_failed: result.attempts },
      },
      finishedAt,
    );
    return;
  }

  applyScriptToEpisode(
    episode,
    result.value.script,
    result.value.warnings,
    cost.usd,
    finishedAt,
  );
  if (opts.by) {
    const audit = Array.isArray(episode.audit) ? [...episode.audit] : [];
    audit.push({
      action: 'script_generate',
      by: opts.by,
      at: finishedAt,
    });
    episode.audit = audit;
    episode.markModified('audit');
  }
  await episode.save();
  await finishJob(
    store,
    jobId,
    {
      status: 'done',
      attempts: result.attempts.length + 1,
      cost,
      result: {
        line_count: result.value.script.lines.length,
        warning_count: result.value.warnings.length,
        prompt_version: SCRIPT_PROMPT_VERSION,
      },
    },
    finishedAt,
  );
}

export async function getScriptView(slug: string, lang: string = LIBRARY_LANG) {
  requireMongo();
  await connectMongo();
  const brief = await V2LibraryBriefModel()
    .findOne({ target_lang: lang, slug })
    .lean();
  if (!brief) return null;
  const episode = await V2LibraryEpisodeModel()
    .findOne({ target_lang: lang, slug })
    .sort({ version: -1 })
    .lean();
  if (!episode) return null;
  const promptBrief = await toPromptBrief(
    brief as Parameters<typeof toPromptBrief>[0],
    lang,
  );
  const store = mongoJobStore();
  const job = await store.latest(lang, slug, 'script');
  return {
    brief_status: brief.status,
    stages: episode.stages,
    title_tl: episode.title_tl ?? null,
    title_ar: episode.title_ar ?? null,
    lines: episode.lines ?? [],
    notes: episode.notes ?? [],
    warnings: episode.warnings ?? [],
    script_failure: episode.script_failure ?? null,
    prompt_versions: episode.prompt_versions ?? null,
    costs: episode.costs ?? {},
    estimate: scriptEstimateForBrief(promptBrief),
    job: job
      ? {
          id: job.id,
          status: job.status,
          kind: job.kind,
          error: job.error ?? null,
          cost: job.cost ?? null,
        }
      : null,
  };
}
