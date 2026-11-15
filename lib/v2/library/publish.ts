import { connectMongo, mongoConfigured } from '@/lib/mongo';
import {
  V2LibraryBriefModel,
  V2LibraryEpisodeModel,
  V2LibraryVoiceModel,
} from '@/lib/v2/mongo/libraryModels';
import { isPlaceholderVoiceId } from './elevenlabs';
import { ScriptError } from './scriptGenerate';
import { voicesCheckStatus } from './voiceAdmin';
import { LIBRARY_LANG, type EpisodeStages } from './types';

function requireMongo() {
  if (!mongoConfigured()) throw new Error('MongoDB not configured');
}

export type PublishCheck = {
  ok: boolean;
  items: { id: string; label: string; ok: boolean }[];
};

export async function publishChecklist(
  slug: string,
  lang = LIBRARY_LANG,
): Promise<PublishCheck> {
  requireMongo();
  await connectMongo();
  const brief = await V2LibraryBriefModel()
    .findOne({ target_lang: lang, slug })
    .lean();
  const episode = await V2LibraryEpisodeModel()
    .findOne({ target_lang: lang, slug })
    .sort({ version: -1 })
    .lean();
  const voices = await V2LibraryVoiceModel().find({ target_lang: lang }).lean();
  if (!brief || !episode) {
    return {
      ok: false,
      items: [{ id: 'exists', label: 'الحلقة موجودة', ok: false }],
    };
  }
  const stages = episode.stages as EpisodeStages;
  const lines = (episode.lines ?? []) as { audio_stale?: boolean }[];
  const voiceOk =
    voicesCheckStatus(
      (episode.cast as { voice_key: string }[]) ?? [],
      voices as {
        key: string;
        elevenlabs_voice_id?: string | null;
        approved: boolean;
      }[],
    ) === 'ok';
  const noPlaceholders = (
    (episode.cast as { voice_key: string }[]) ?? []
  ).every((c) => {
    const v = voices.find((x) => x.key === c.voice_key);
    return v && !isPlaceholderVoiceId(v.elevenlabs_voice_id);
  });
  const items = [
    {
      id: 'brief',
      label: 'الـ brief معتمد',
      ok: brief.status === 'approved',
    },
    {
      id: 'review',
      label: 'المراجعة معتمدة',
      ok: stages.review.status === 'approved' && !stages.review.stale,
    },
    {
      id: 'audio',
      label: 'الصوت جاهز من غير أسطر stale',
      ok:
        stages.audio.status === 'ready' &&
        !stages.audio.stale &&
        lines.every((l) => !l.audio_stale),
    },
    {
      id: 'voices',
      label: 'مفيش placeholder في الكاست',
      ok: voiceOk && noPlaceholders,
    },
  ];
  return { ok: items.every((i) => i.ok), items };
}

export async function publishEpisode(
  slug: string,
  opts: { lang?: string; by?: string; new_version?: boolean } = {},
) {
  const lang = opts.lang ?? LIBRARY_LANG;
  const check = await publishChecklist(slug, lang);
  if (!check.ok) {
    throw new ScriptError('شروط النشر مش متحققة', 400, 'publish_blocked', {
      checklist: check.items,
    });
  }
  requireMongo();
  await connectMongo();
  const episode = await V2LibraryEpisodeModel()
    .findOne({ target_lang: lang, slug })
    .sort({ version: -1 });
  if (!episode) throw new ScriptError('not found', 404);

  // If already published and editing a draft copy — publish this version.
  const now = new Date();
  if (episode.status === 'published' && opts.new_version) {
    // already the draft that should go live
  }

  // Unpublish older published versions for this slug.
  await V2LibraryEpisodeModel().updateMany(
    { target_lang: lang, slug, status: 'published', _id: { $ne: episode._id } },
    { $set: { status: 'hidden' } },
  );

  episode.status = 'published';
  episode.published_version = episode.version;
  episode.stages = {
    ...episode.stages,
    publish: { status: 'published', stale: false, updated_at: now },
  } as EpisodeStages;
  const audit = Array.isArray(episode.audit) ? [...episode.audit] : [];
  audit.push({ action: 'publish', by: opts.by ?? null, at: now });
  episode.audit = audit;
  episode.markModified('stages');
  episode.markModified('audit');
  await episode.save();
  return { version: episode.version };
}

export async function hideEpisode(
  slug: string,
  opts: { lang?: string; by?: string } = {},
) {
  const lang = opts.lang ?? LIBRARY_LANG;
  requireMongo();
  await connectMongo();
  const episode = await V2LibraryEpisodeModel()
    .findOne({ target_lang: lang, slug, status: 'published' })
    .sort({ version: -1 });
  if (!episode) throw new ScriptError('not found', 404);
  const now = new Date();
  episode.status = 'hidden';
  episode.stages = {
    ...episode.stages,
    publish: { status: 'hidden', stale: false, updated_at: now },
  } as EpisodeStages;
  const audit = Array.isArray(episode.audit) ? [...episode.audit] : [];
  audit.push({ action: 'hide', by: opts.by ?? null, at: now });
  episode.audit = audit;
  episode.markModified('stages');
  episode.markModified('audit');
  await episode.save();
}

/**
 * Editing a published episode forks a new draft version so learners keep
 * seeing the published one until "انشر النسخة الجديدة".
 */
export async function ensureDraftVersion(
  slug: string,
  lang = LIBRARY_LANG,
): Promise<{ version: number; forked: boolean }> {
  requireMongo();
  await connectMongo();
  const latest = await V2LibraryEpisodeModel()
    .findOne({ target_lang: lang, slug })
    .sort({ version: -1 });
  if (!latest) throw new ScriptError('not found', 404);
  if (latest.status !== 'published') {
    return { version: latest.version, forked: false };
  }
  const obj = latest.toObject() as Record<string, unknown>;
  delete obj._id;
  const nextVersion = latest.version + 1;
  await V2LibraryEpisodeModel().create({
    ...obj,
    version: nextVersion,
    status: 'draft',
    draft_version: nextVersion,
    published_version: latest.version,
    stages: {
      ...(latest.stages as object),
      publish: { status: 'draft', stale: false, updated_at: new Date() },
    },
  });
  return { version: nextVersion, forked: true };
}

/** Learner-facing list of published episodes. */
export async function listPublishedEpisodes(lang = LIBRARY_LANG) {
  requireMongo();
  await connectMongo();
  return V2LibraryEpisodeModel()
    .find({ target_lang: lang, status: 'published' })
    .sort({ target_level: 1, sort_order: 1 })
    .select(
      'slug type target_level measured_level title_tl title_ar intro_eg sort_order duration_sec images',
    )
    .lean();
}
