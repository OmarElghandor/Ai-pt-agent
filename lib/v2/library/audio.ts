import { connectMongo, mongoConfigured } from '@/lib/mongo';
import {
  V2LibraryEpisodeModel,
  V2LibrarySettingsModel,
  V2LibraryTtsUsageModel,
  V2LibraryVoiceModel,
} from '@/lib/v2/mongo/libraryModels';
import {
  enqueueJob,
  finishJob,
  markJobRunning,
  mongoJobStore,
  type JobStore,
} from './jobs';
import {
  isPlaceholderVoiceId,
  mapCharTimingsToTokens,
  stubElevenLabsClient,
  type ElevenLabsClient,
} from './elevenlabs';
import { ScriptError } from './scriptGenerate';
import type { LibraryToken } from './tokens';
import { LIBRARY_LANG, type EpisodeStages } from './types';

function requireMongo() {
  if (!mongoConfigured()) throw new Error('MongoDB not configured');
}

export type AudioLineEstimate = {
  line_index: number;
  chars: number;
  ready: boolean;
  cost_chars: number;
};

export function estimateAudioLines(
  lines: {
    tl: string;
    audio_key?: string | null;
    audio_stale?: boolean;
  }[],
): { lines: AudioLineEstimate[]; total_chars: number; build_chars: number } {
  const out: AudioLineEstimate[] = lines.map((l, i) => {
    const chars = l.tl.length;
    const ready = !!l.audio_key && !l.audio_stale;
    return {
      line_index: i,
      chars,
      ready,
      cost_chars: ready ? 0 : chars,
    };
  });
  return {
    lines: out,
    total_chars: out.reduce((a, b) => a + b.chars, 0),
    build_chars: out.reduce((a, b) => a + b.cost_chars, 0),
  };
}

export async function getAudioEstimate(slug: string, lang = LIBRARY_LANG) {
  requireMongo();
  await connectMongo();
  const episode = await V2LibraryEpisodeModel()
    .findOne({ target_lang: lang, slug })
    .sort({ version: -1 })
    .lean();
  if (!episode) throw new ScriptError('not found', 404);
  const settings = await V2LibrarySettingsModel()
    .findOne({ target_lang: lang })
    .lean();
  const estimate = estimateAudioLines(
    (episode.lines ?? []) as {
      tl: string;
      audio_key?: string;
      audio_stale?: boolean;
    }[],
  );
  const cap = Number(settings?.monthly_char_limit);
  const month = new Date().toISOString().slice(0, 7);
  const used = await V2LibraryTtsUsageModel().aggregate([
    {
      $match: {
        target_lang: lang,
        createdAt: {
          $gte: new Date(`${month}-01T00:00:00.000Z`),
        },
      },
    },
    { $group: { _id: null, chars: { $sum: '$chars' } } },
  ]);
  const usedChars = used[0]?.chars ?? 0;
  const speed =
    (settings?.speed_by_level as Record<string, unknown> | undefined)?.[
      String(episode.target_level)
    ] ?? null;
  return {
    ...estimate,
    speed,
    monthly_cap: Number.isFinite(cap) ? cap : null,
    monthly_used: usedChars,
    monthly_left:
      Number.isFinite(cap) ? Math.max(0, cap - usedChars) : null,
  };
}

export async function startAudioBuild(
  slug: string,
  opts: { lang?: string; store?: JobStore; line_index?: number } = {},
) {
  const lang = opts.lang ?? LIBRARY_LANG;
  const store = opts.store ?? mongoJobStore();
  const estimate = await getAudioEstimate(slug, lang);
  if (
    estimate.monthly_cap != null &&
    estimate.build_chars > 0 &&
    estimate.monthly_left != null &&
    estimate.build_chars > estimate.monthly_left
  ) {
    throw new ScriptError('تجاوزت حد الحروف الشهري', 400, 'cap');
  }
  const enq = await enqueueJob(
    opts.line_index != null ? 'library_audio_line' : 'library_stitch',
    slug,
    {
      lang,
      line_index: opts.line_index ?? null,
      params: { estimate },
    },
    store,
  );
  return enq;
}

export async function runAudioBuild(
  jobId: string,
  slug: string,
  opts: {
    lang?: string;
    store?: JobStore;
    client?: ElevenLabsClient;
    upload?: (buf: Buffer, id: string) => Promise<string>;
    onlyLine?: number | null;
  } = {},
) {
  const lang = opts.lang ?? LIBRARY_LANG;
  const store = opts.store ?? mongoJobStore();
  const client = opts.client ?? stubElevenLabsClient();
  const upload =
    opts.upload ?? (async (buf, id) => `stub://library/${id}/${buf.length}`);
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
  const settings = await V2LibrarySettingsModel()
    .findOne({ target_lang: lang })
    .lean();
  const modelId = String(
    settings?.model ?? process.env.LIBRARY_TTS_MODEL ?? 'eleven_multilingual_v2',
  );
  const voices = await V2LibraryVoiceModel().find({ target_lang: lang }).lean();
  const voiceByKey = new Map(voices.map((v) => [v.key, v]));

  episode.stages = {
    ...episode.stages,
    audio: { status: 'building', stale: false, updated_at: now },
  } as EpisodeStages;
  episode.markModified('stages');
  await episode.save();

  const lines = [...((episode.lines ?? []) as Record<string, unknown>[])];
  const indexes =
    opts.onlyLine != null
      ? [opts.onlyLine]
      : lines
          .map((l, i) =>
            l.audio_key && !l.audio_stale ? -1 : i,
          )
          .filter((i) => i >= 0);

  let builtChars = 0;
  try {
    for (const i of indexes) {
      const line = lines[i] as {
        tl: string;
        speaker: string;
        tokens?: LibraryToken[];
      };
      const voice = voiceByKey.get(line.speaker);
      if (!voice || isPlaceholderVoiceId(voice.elevenlabs_voice_id)) {
        throw new Error(`voice missing for ${line.speaker}`);
      }
      const prev = i > 0 ? String((lines[i - 1] as { tl: string }).tl) : undefined;
      const next =
        i < lines.length - 1
          ? String((lines[i + 1] as { tl: string }).tl)
          : undefined;
      const result = await client.textToSpeechWithTimestamps({
        voiceId: String(voice.elevenlabs_voice_id),
        text: line.tl,
        modelId,
        previousText: prev,
        nextText: next,
        settings: {
          stability: Number(voice.stability) || 0.5,
          similarity_boost: Number(voice.similarity) || 0.75,
          style: Number(voice.style) || 0,
        },
      });
      const url = await upload(
        result.audio,
        `${slug}/line-${i}`,
      );
      const tokenTimings = mapCharTimingsToTokens(
        line.tl,
        line.tokens ?? line.tl.split(/\s+/).map((surface) => ({ surface })),
        result.characters,
        result.character_start_times_seconds,
        result.character_end_times_seconds,
      );
      const tokens = (line.tokens ?? []).map((t, ti) => ({
        ...t,
        start: tokenTimings[ti]?.start ?? 0,
        end: tokenTimings[ti]?.end ?? 0,
      }));
      // Ensure every token has start/end even without prior tokens
      const ensured =
        tokens.length > 0
          ? tokens
          : tokenTimings.map((t) => ({
              surface: t.surface,
              lemma: t.surface,
              pos: 'other',
              meaning_ar: '',
              start: t.start,
              end: t.end,
            }));
      lines[i] = {
        ...line,
        audio_key: url,
        audio_stale: false,
        character_count: line.tl.length,
        tokens: ensured,
      };
      builtChars += line.tl.length;
      await V2LibraryTtsUsageModel().create({
        target_lang: lang,
        episode_slug: slug,
        line_index: i,
        chars: line.tl.length,
        model: modelId,
        month: new Date().toISOString().slice(0, 7),
        kind: 'line',
      });
    }

    // Stitch placeholder: concatenate keys
    const stitchUrl = await upload(
      Buffer.from(lines.map((l) => String((l as { audio_key?: string }).audio_key ?? '')).join('\n')),
      `${slug}/stitch`,
    );
    (episode as { audio_stitch_url?: string }).set?.('audio_stitch_url', stitchUrl);
    episode.set('images', {
      ...((episode.images as object) ?? {}),
      stitch_url: stitchUrl,
    });

    const finishedAt = new Date();
    episode.lines = lines;
    episode.stages = {
      ...episode.stages,
      audio: { status: 'ready', stale: false, updated_at: finishedAt },
    } as EpisodeStages;
    episode.markModified('lines');
    episode.markModified('stages');
    episode.markModified('images');
    await episode.save();
    await finishJob(
      store,
      jobId,
      {
        status: 'done',
        cost: { calls: indexes.length, input_tokens: 0, output_tokens: 0, usd: 0, model: modelId },
        result: { built_chars: builtChars, lines: indexes },
      },
      finishedAt,
    );
  } catch (e) {
    const finishedAt = new Date();
    episode.lines = lines;
    episode.stages = {
      ...episode.stages,
      audio: {
        status: indexes.some((i) => (lines[i] as { audio_key?: string }).audio_key)
          ? 'partial'
          : 'failed',
        stale: false,
        updated_at: finishedAt,
        stale_reason: e instanceof Error ? e.message : String(e),
      },
    } as EpisodeStages;
    episode.markModified('lines');
    episode.markModified('stages');
    await episode.save();
    await finishJob(
      store,
      jobId,
      {
        status: 'failed',
        error: e instanceof Error ? e.message : String(e),
        result: { built_chars: builtChars },
      },
      finishedAt,
    );
  }
}
