import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { connectMongo, mongoConfigured } from '@/lib/mongo';
import {
  V2LibraryBriefModel,
  V2LibraryEpisodeModel,
  V2LibraryMomentModel,
  V2LibrarySettingsModel,
  V2LibraryVoiceModel,
} from '@/lib/v2/mongo/libraryModels';
import {
  planImport,
  summarizeImportPlan,
  type ImportSummary,
} from './mergeImport';
import {
  LIBRARY_LANG,
  type BriefSeed,
  type LibrarySeed,
  type MomentSeed,
  type VoiceKind,
  type VoiceSeed,
} from './types';

export function libraryContentDir(): string {
  return join(process.cwd(), 'content', 'v2', 'library');
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

type RawVoice = Omit<VoiceSeed, 'kind'>;

function voiceKind(key: string, from: 'cast' | 'pool'): VoiceKind {
  if (from === 'pool') return 'pool';
  if (key === 'narrator') return 'narrator';
  if (key === 'learner_f') return 'learner_f';
  return 'cast';
}

/** Read voices, moments, briefs and settings from content/v2/library (sync, no DB). */
export function loadLibrarySeed(dir: string = libraryContentDir()): LibrarySeed {
  const voicesRaw = readJson<{
    target_lang: string;
    global?: Record<string, unknown>;
    speed_by_level?: Record<string, unknown>;
    cast: RawVoice[];
    pool: RawVoice[];
  }>(join(dir, 'voices.json'));
  const momentsRaw = readJson<{
    target_lang: string;
    places: Record<string, Omit<MomentSeed, 'place'>[] & { place?: string }[]>;
  }>(join(dir, 'moments.json'));

  const voices: VoiceSeed[] = [
    ...voicesRaw.cast.map((v) => ({ ...v, kind: voiceKind(v.key, 'cast') })),
    ...voicesRaw.pool.map((v) => ({ ...v, kind: voiceKind(v.key, 'pool') })),
  ];

  const moments: MomentSeed[] = [];
  for (const [place, list] of Object.entries(momentsRaw.places)) {
    for (const m of list as Partial<MomentSeed>[]) {
      moments.push({
        id: String(m.id),
        place: m.place ?? place,
        eg: String(m.eg ?? ''),
        must_say: m.must_say ?? '',
        archived: Boolean(m.archived),
      });
    }
  }

  const briefsDir = join(dir, 'briefs');
  const briefs = readdirSync(briefsDir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => readJson<BriefSeed>(join(briefsDir, f)))
    .sort((a, b) => a.sort_order - b.sort_order);

  const g = voicesRaw.global ?? {};
  return {
    target_lang: voicesRaw.target_lang ?? LIBRARY_LANG,
    briefs,
    voices,
    moments,
    settings: {
      target_lang: voicesRaw.target_lang ?? LIBRARY_LANG,
      model: g.model,
      output_format: g.output_format,
      monthly_char_limit: g.monthly_char_limit,
      speed_by_level: voicesRaw.speed_by_level ?? {},
      check_script_text: '',
    },
  };
}

/**
 * Run the import against Mongo. Idempotent: a second run with unchanged
 * content writes nothing. Admin-edited or approved briefs are never touched.
 */
export async function importFromContent(
  dir?: string,
): Promise<ImportSummary> {
  if (!mongoConfigured()) throw new Error('MongoDB not configured');
  await connectMongo();
  const seed = loadLibrarySeed(dir);
  const lang = seed.target_lang;

  const [briefs, voices, moments, episodes, settings] = await Promise.all([
    V2LibraryBriefModel()
      .find({ target_lang: lang })
      .select('slug status admin_edited source_hash')
      .lean(),
    V2LibraryVoiceModel().find({ target_lang: lang }).select('key').lean(),
    V2LibraryMomentModel().find({ target_lang: lang }).select('id').lean(),
    V2LibraryEpisodeModel().find({ target_lang: lang }).select('slug').lean(),
    V2LibrarySettingsModel().findOne({ target_lang: lang }).select('_id').lean(),
  ]);

  const plan = planImport(seed, {
    briefs: briefs.map((b) => ({
      slug: b.slug,
      status: b.status,
      admin_edited: b.admin_edited,
      source_hash: b.source_hash ?? null,
    })),
    voices: voices.map((v) => ({ key: v.key })),
    moments: moments.map((m) => ({ id: m.id })),
    episodes: episodes.map((e) => ({ slug: e.slug })),
    settingsExists: Boolean(settings),
  });

  if (plan.briefs.create.length) {
    await V2LibraryBriefModel().insertMany(plan.briefs.create, { ordered: false });
  }
  for (const b of plan.briefs.update) {
    // Guard again in the filter: never overwrite a brief edited since we read it.
    await V2LibraryBriefModel().updateOne(
      { target_lang: lang, slug: b.slug, admin_edited: { $ne: true }, status: 'draft' },
      { $set: b },
    );
  }
  if (plan.voices.create.length) {
    await V2LibraryVoiceModel().insertMany(
      plan.voices.create.map((v) => ({ ...v, target_lang: lang })),
      { ordered: false },
    );
  }
  if (plan.moments.create.length) {
    await V2LibraryMomentModel().insertMany(
      plan.moments.create.map((m) => ({ ...m, target_lang: lang })),
      { ordered: false },
    );
  }
  if (plan.settings.create) {
    await V2LibrarySettingsModel().updateOne(
      { target_lang: lang },
      { $setOnInsert: plan.settings.create },
      { upsert: true },
    );
  }
  if (plan.episodes.create.length) {
    await V2LibraryEpisodeModel().insertMany(plan.episodes.create, {
      ordered: false,
    });
  }

  return summarizeImportPlan(plan);
}
