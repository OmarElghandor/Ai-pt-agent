import { connectMongo, mongoConfigured } from '@/lib/mongo';
import {
  V2LibraryBriefModel,
  V2LibraryEpisodeModel,
} from '@/lib/v2/mongo/libraryModels';
import { ScriptError } from './scriptGenerate';
import { runTokensJob, startTokensJob } from './tokensGenerate';
import { LIBRARY_LANG, type EpisodeStages } from './types';
import type { LibraryToken } from './tokens';

/** Rough measured level from script features (14 §2.4). */
export function measureLevel(input: {
  lines: { tl: string; speaker: string }[];
  tokens: LibraryToken[][];
  top1000?: Set<string>;
}): {
  measured_level: number;
  parts: {
    sentence_length: number;
    out_of_1000_share: number;
    tenses: string[];
    turns: number;
  };
} {
  const { lines, tokens, top1000 } = input;
  const lengths = lines.map((l) => l.tl.trim().split(/\s+/).filter(Boolean).length);
  const avgLen =
    lengths.length === 0
      ? 0
      : lengths.reduce((a, b) => a + b, 0) / lengths.length;

  let total = 0;
  let out = 0;
  const tenses = new Set<string>();
  for (const row of tokens) {
    for (const t of row) {
      if (t.function) continue;
      total += 1;
      const lemma = (t.lemma || t.surface).toLowerCase();
      if (top1000 && !top1000.has(lemma)) out += 1;
      if (t.tense) tenses.add(t.tense);
    }
  }
  const outShare = total ? out / total : 0;
  const speakers = new Set(lines.map((l) => l.speaker));
  const turns = lines.length;

  let score = 1;
  if (avgLen > 6 || outShare > 0.08 || tenses.has('pret')) score = 2;
  if (avgLen > 9 || outShare > 0.15 || tenses.has('imperf')) score = 3;
  if (avgLen > 12 || outShare > 0.22 || tenses.has('cond')) score = 4;
  if (avgLen > 15 || outShare > 0.3 || speakers.size >= 4 || turns > 55) {
    score = 5;
  }

  return {
    measured_level: score,
    parts: {
      sentence_length: Math.round(avgLen * 10) / 10,
      out_of_1000_share: Math.round(outShare * 1000) / 1000,
      tenses: [...tenses],
      turns,
    },
  };
}

export function momentsCoverage(
  briefMoments: { id: string; eg: string }[],
  lines: { moment?: string }[],
): { id: string; eg: string; covered: boolean; line_numbers: number[] }[] {
  return briefMoments.map((m) => {
    const line_numbers = lines
      .map((l, i) => ((l.moment ?? '') === m.id ? i + 1 : -1))
      .filter((n) => n > 0);
    return {
      id: m.id,
      eg: m.eg,
      covered: line_numbers.length > 0,
      line_numbers,
    };
  });
}

function requireMongo() {
  if (!mongoConfigured()) throw new Error('MongoDB not configured');
}

export async function getReviewView(slug: string, lang = LIBRARY_LANG) {
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
  const lines = (episode.lines ?? []) as {
    tl: string;
    tl_f?: string;
    ar: string;
    speaker: string;
    scene?: number;
    moment?: string;
    tokens?: LibraryToken[];
  }[];
  const measured = measureLevel({
    lines,
    tokens: lines.map((l) => l.tokens ?? []),
  });
  return {
    target_level: brief.target_level,
    measured_level: episode.measured_level ?? measured.measured_level,
    measured_score: episode.measured_score ?? measured.parts,
    computed: measured,
    moments: momentsCoverage(
      (brief.moments as { id: string; eg: string }[]) ?? [],
      lines,
    ),
    lines,
    notes: episode.notes ?? [],
    stages: episode.stages,
    intro_eg: episode.intro_eg ?? brief.intro_eg,
    title_tl: episode.title_tl,
    title_ar: episode.title_ar,
    type: episode.type,
  };
}

export async function acceptMeasuredLevel(
  slug: string,
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
    tl: string;
    speaker: string;
    tokens?: LibraryToken[];
  }[];
  const measured = measureLevel({
    lines,
    tokens: lines.map((l) => l.tokens ?? []),
  });
  episode.measured_level = measured.measured_level;
  episode.measured_score = measured.parts;
  if (opts.by) {
    const audit = Array.isArray(episode.audit) ? [...episode.audit] : [];
    audit.push({
      action: 'accept_measured_level',
      by: opts.by,
      at: new Date(),
      measured_level: measured.measured_level,
    });
    episode.audit = audit;
    episode.markModified('audit');
  }
  episode.markModified('measured_score');
  await episode.save();
  return measured;
}

export async function approveReview(
  slug: string,
  opts: { lang?: string; by?: string } = {},
) {
  const lang = opts.lang ?? LIBRARY_LANG;
  requireMongo();
  await connectMongo();
  const episode = await V2LibraryEpisodeModel()
    .findOne({ target_lang: lang, slug })
    .sort({ version: -1 });
  if (!episode) throw new ScriptError('not found', 404);
  if ((episode.stages as EpisodeStages).tokens.status !== 'ready') {
    throw new ScriptError('حلّل الكلمات الأول', 400, 'tokens_not_ready');
  }
  const now = new Date();
  episode.stages = {
    ...episode.stages,
    review: { status: 'approved', stale: false, updated_at: now },
  } as EpisodeStages;
  if (opts.by) {
    const audit = Array.isArray(episode.audit) ? [...episode.audit] : [];
    audit.push({ action: 'review_approve', by: opts.by, at: now });
    episode.audit = audit;
    episode.markModified('audit');
  }
  episode.markModified('stages');
  await episode.save();
}

/**
 * Hand-edit one line: update fields, mark audio_stale, reopen review for that
 * line only (stage open), and kick tokens for that line only.
 */
export async function handEditLine(
  slug: string,
  lineIndex: number,
  patch: { tl?: string; tl_f?: string; ar?: string; speaker?: string },
  opts: { lang?: string; by?: string; runTokens?: boolean } = {},
) {
  const lang = opts.lang ?? LIBRARY_LANG;
  requireMongo();
  await connectMongo();
  const episode = await V2LibraryEpisodeModel()
    .findOne({ target_lang: lang, slug })
    .sort({ version: -1 });
  if (!episode) throw new ScriptError('not found', 404);
  const lines = [...((episode.lines ?? []) as Record<string, unknown>[])];
  if (lineIndex < 0 || lineIndex >= lines.length) {
    throw new ScriptError('bad line_index', 400);
  }
  const prev = lines[lineIndex] as Record<string, unknown>;
  lines[lineIndex] = {
    ...prev,
    ...patch,
    hand_edited: true,
    audio_stale: true,
    tokens: undefined,
    tokens_hand_edited: false,
  };
  const now = new Date();
  episode.lines = lines;
  episode.stages = {
    ...episode.stages,
    review: {
      status: 'open',
      stale: true,
      stale_reason: `السطر ${lineIndex} اتعدل، المراجعة مفتوحة تاني`,
      updated_at: now,
    },
    tokens: {
      ...(episode.stages as EpisodeStages).tokens,
      stale: true,
      stale_reason: 'سطر اتعدل بالإيد',
      updated_at: now,
    },
    audio: {
      ...(episode.stages as EpisodeStages).audio,
      stale: true,
      stale_reason: 'سطر اتعدل، الصوت محتاج يتعمل تاني',
      updated_at: now,
    },
  } as EpisodeStages;
  if (opts.by) {
    const audit = Array.isArray(episode.audit) ? [...episode.audit] : [];
    audit.push({
      action: 'line_hand_edit',
      by: opts.by,
      at: now,
      line_index: lineIndex,
    });
    episode.audit = audit;
    episode.markModified('audit');
  }
  episode.markModified('lines');
  episode.markModified('stages');
  await episode.save();

  let tokensJobId: string | null = null;
  if (opts.runTokens !== false) {
    const started = await startTokensJob(slug, {
      lang,
      line_indexes: [lineIndex],
      by: opts.by,
    });
    if (started.ok) {
      tokensJobId = started.job.id;
      void runTokensJob(started.job.id, slug, {
        lang,
        line_indexes: [lineIndex],
        by: opts.by,
      }).catch((err) => console.error('[library_tokens:line]', slug, err));
    }
  }
  return { line_index: lineIndex, tokens_job_id: tokensJobId };
}
