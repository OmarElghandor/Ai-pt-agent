import { connectMongo, mongoConfigured } from '@/lib/mongo';
import {
  V2LibraryBriefModel,
  V2LibraryEpisodeModel,
  V2LibraryVoiceModel,
} from '@/lib/v2/mongo/libraryModels';
import {
  approveRefusalMessage,
  checkApprovable,
  momentMinimum,
  normalizeBriefInput,
  stagesAfterApprove,
  stagesAfterBriefSave,
  markScriptStaleOnBriefEdit,
  type BriefInput,
} from './briefRules';
import { defaultStages } from './stages';
import { LIBRARY_LANG, type EpisodeStages } from './types';

export { momentMinimum, markScriptStaleOnBriefEdit };

export class BriefError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly extra?: Record<string, unknown>,
  ) {
    super(message);
  }
}

function requireMongo() {
  if (!mongoConfigured()) throw new Error('MongoDB not configured');
}

async function latestEpisode(slug: string, lang: string) {
  return V2LibraryEpisodeModel()
    .findOne({ target_lang: lang, slug })
    .sort({ version: -1 });
}

function plain<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

export async function getBrief(slug: string, lang: string = LIBRARY_LANG) {
  requireMongo();
  await connectMongo();
  const brief = await V2LibraryBriefModel().findOne({ target_lang: lang, slug }).lean();
  if (!brief) return null;
  const episode = await V2LibraryEpisodeModel()
    .findOne({ target_lang: lang, slug })
    .sort({ version: -1 })
    .select('slug version status stages title_ar title_tl')
    .lean();
  return plain({
    brief,
    stages: (episode?.stages as EpisodeStages | undefined) ?? defaultStages(),
    episode: episode
      ? {
          slug: episode.slug,
          version: episode.version,
          status: episode.status,
          title_ar: episode.title_ar ?? null,
          title_tl: episode.title_tl ?? null,
        }
      : null,
    moment_minimum: momentMinimum(brief.target_level),
  });
}

async function genderByKey(keys: string[], lang: string) {
  const voices = await V2LibraryVoiceModel()
    .find({ target_lang: lang, key: { $in: keys } })
    .select('key gender')
    .lean();
  return new Map(voices.map((v) => [v.key, v.gender as 'm' | 'f' | undefined]));
}

/**
 * Save the brief (slug is fixed: the brief must already exist).
 * Editing an approved brief needs `confirmEditApproved`; it then goes back to draft
 * and Script (and later stages with output) are marked stale.
 */
export async function saveBrief(
  slug: string,
  raw: unknown,
  opts: { confirmEditApproved?: boolean; by?: string; lang?: string; now?: Date } = {},
) {
  requireMongo();
  await connectMongo();
  const lang = opts.lang ?? LIBRARY_LANG;
  const now = opts.now ?? new Date();
  const input: BriefInput = normalizeBriefInput(raw);
  const current = await V2LibraryBriefModel().findOne({ target_lang: lang, slug });
  if (!current) throw new BriefError('not found', 404);
  const wasApproved = current.status === 'approved';
  if (wasApproved && !opts.confirmEditApproved) {
    throw new BriefError('confirm required', 409, 'confirm_edit_approved');
  }

  const set: Record<string, unknown> = {
    type: input.type,
    target_level: input.target_level,
    intro_eg: input.intro_eg,
    cast: input.cast,
    places: input.places,
    beats: input.beats,
    must_have_phrases: input.must_have_phrases,
    moments: input.moments,
    linked_episode: input.linked_episode,
    admin_edited: true,
  };
  if (input.notes_admin !== undefined) set.notes_admin = input.notes_admin;
  const update: Record<string, unknown> = { $set: set };
  if (wasApproved) {
    set.status = 'draft';
    update.$unset = { approved_by: '', approved_at: '' };
  }
  await V2LibraryBriefModel().updateOne({ target_lang: lang, slug }, update);

  // Mirror into the latest episode version and move its stages.
  const episode = await latestEpisode(slug, lang);
  if (episode) {
    const genders = await genderByKey(
      input.cast.map((c) => c.voice_key),
      lang,
    );
    const stages = stagesAfterBriefSave(
      episode.stages as unknown as EpisodeStages,
      wasApproved,
      now,
    );
    const epSet: Record<string, unknown> = { stages };
    if (episode.status !== 'published') {
      epSet.type = input.type;
      epSet.target_level = input.target_level;
      epSet.intro_eg = input.intro_eg;
      epSet.cast = input.cast.map((c) => ({
        role: c.role_eg,
        voice_key: c.voice_key,
        gender: genders.get(c.voice_key) ?? null,
        learner: c.learner,
      }));
    }
    if (wasApproved) {
      epSet.audit = [
        ...((episode.audit as unknown[]) ?? []),
        { action: 'brief_edit_after_approve', by: opts.by ?? null, at: now },
      ];
    }
    await V2LibraryEpisodeModel().updateOne({ _id: episode._id }, { $set: epSet });
  }
  return getBrief(slug, lang);
}

/** Approve the brief; refused below the moment minimum (14 §2.3b). */
export async function approveBrief(
  slug: string,
  opts: { by?: string; lang?: string; now?: Date } = {},
) {
  requireMongo();
  await connectMongo();
  const lang = opts.lang ?? LIBRARY_LANG;
  const now = opts.now ?? new Date();
  const current = await V2LibraryBriefModel().findOne({ target_lang: lang, slug }).lean();
  if (!current) throw new BriefError('not found', 404);
  const check = checkApprovable({
    target_level: current.target_level,
    moments: (current.moments ?? []) as BriefInput['moments'],
    intro_eg: current.intro_eg ?? '',
    cast: (current.cast ?? []) as BriefInput['cast'],
    beats: current.beats ?? [],
  });
  if (!check.ok) {
    throw new BriefError(approveRefusalMessage(check), 422, check.reason, {
      ...(check.reason === 'moments_below_minimum'
        ? { have: check.have, need: check.need }
        : {}),
    });
  }
  await V2LibraryBriefModel().updateOne(
    { target_lang: lang, slug },
    {
      $set: {
        status: 'approved',
        approved_at: now,
        ...(opts.by ? { approved_by: opts.by } : {}),
      },
    },
  );
  const episode = await latestEpisode(slug, lang);
  if (episode) {
    await V2LibraryEpisodeModel().updateOne(
      { _id: episode._id },
      {
        $set: {
          stages: stagesAfterApprove(episode.stages as unknown as EpisodeStages, now),
          audit: [
            ...((episode.audit as unknown[]) ?? []),
            { action: 'brief_approve', by: opts.by ?? null, at: now },
          ],
        },
      },
    );
  }
  return getBrief(slug, lang);
}
