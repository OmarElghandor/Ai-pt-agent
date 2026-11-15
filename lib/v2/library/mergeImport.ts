import { createHash } from 'node:crypto';
import { defaultStages } from './stages';
import type {
  BriefSeed,
  EpisodeStages,
  LibrarySeed,
  LibraryType,
  MomentSeed,
  SettingsSeed,
  VoiceSeed,
} from './types';

/**
 * Pure merge helpers for "استورد من 14b" (14d §2.7). No DB, no fs.
 * Rule: add what is missing, never overwrite what an admin touched.
 */

export type BriefDocInput = BriefSeed & {
  status: 'draft' | 'approved';
  admin_edited: boolean;
  source_hash: string;
};

export type ExistingBrief = {
  slug: string;
  status?: string;
  admin_edited?: boolean;
  source_hash?: string | null;
};

export type ExistingVoice = { key: string };
export type ExistingMoment = { id: string };
export type ExistingEpisode = { slug: string };

export type EpisodeSkeleton = {
  target_lang: string;
  slug: string;
  version: number;
  status: 'draft';
  type: LibraryType;
  target_level: number;
  intro_eg: string;
  cast: { role: string; voice_key: string; learner: boolean }[];
  stages: EpisodeStages;
  lines: never[];
  notes: never[];
  warnings: never[];
  costs: Record<string, never>;
  published_version: null;
  draft_version: number;
  sort_order: number;
};

export type SkipReason = 'admin_edited' | 'approved';

export type ImportExisting = {
  briefs: ExistingBrief[];
  voices: ExistingVoice[];
  moments: ExistingMoment[];
  episodes: ExistingEpisode[];
  settingsExists: boolean;
};

export type ImportPlan = {
  briefs: {
    create: BriefDocInput[];
    /** Existing, not edited, and the seed file changed since the last import. */
    update: BriefDocInput[];
    /** "موجود، اتساب" */
    skipped: { slug: string; reason: SkipReason }[];
    unchanged: string[];
  };
  voices: { create: VoiceSeed[]; kept: string[] };
  moments: { create: MomentSeed[]; kept: string[] };
  settings: { create: SettingsSeed | null };
  episodes: { create: EpisodeSkeleton[] };
};

export type ImportSummary = {
  briefs_created: number;
  briefs_updated: number;
  briefs_skipped: { slug: string; reason: SkipReason }[];
  briefs_unchanged: number;
  voices_created: number;
  voices_kept: number;
  moments_created: number;
  moments_kept: number;
  settings_created: boolean;
  episodes_created: number;
};

function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v) ?? 'null';
}

export function seedHash(seed: unknown): string {
  return createHash('sha256').update(stableStringify(seed)).digest('hex');
}

export function briefDocFromSeed(seed: BriefSeed): BriefDocInput {
  return {
    ...seed,
    status: 'draft',
    admin_edited: false,
    source_hash: seedHash(seed),
  };
}

export function episodeSkeletonFromBrief(
  brief: BriefSeed,
  now: Date = new Date(),
): EpisodeSkeleton {
  return {
    target_lang: brief.target_lang,
    slug: brief.slug,
    version: 1,
    status: 'draft',
    type: brief.type,
    target_level: brief.target_level,
    intro_eg: brief.intro_eg,
    cast: brief.cast.map((c) => ({
      role: c.role_eg,
      voice_key: c.voice_key,
      learner: c.learner,
    })),
    stages: defaultStages(now),
    lines: [],
    notes: [],
    warnings: [],
    costs: {},
    published_version: null,
    draft_version: 1,
    sort_order: brief.sort_order,
  };
}

export function planImport(
  seed: LibrarySeed,
  existing: ImportExisting,
  now: Date = new Date(),
): ImportPlan {
  const briefBySlug = new Map(existing.briefs.map((b) => [b.slug, b]));
  const plan: ImportPlan = {
    briefs: { create: [], update: [], skipped: [], unchanged: [] },
    voices: { create: [], kept: [] },
    moments: { create: [], kept: [] },
    settings: { create: null },
    episodes: { create: [] },
  };

  for (const b of seed.briefs) {
    const doc = briefDocFromSeed(b);
    const cur = briefBySlug.get(b.slug);
    if (!cur) {
      plan.briefs.create.push(doc);
    } else if (cur.admin_edited) {
      plan.briefs.skipped.push({ slug: b.slug, reason: 'admin_edited' });
    } else if (cur.status === 'approved') {
      plan.briefs.skipped.push({ slug: b.slug, reason: 'approved' });
    } else if (cur.source_hash === doc.source_hash) {
      plan.briefs.unchanged.push(b.slug);
    } else {
      plan.briefs.update.push(doc);
    }
  }

  const haveVoices = new Set(existing.voices.map((v) => v.key));
  for (const v of seed.voices) {
    if (haveVoices.has(v.key)) plan.voices.kept.push(v.key);
    else plan.voices.create.push(v);
  }

  const haveMoments = new Set(existing.moments.map((m) => m.id));
  for (const m of seed.moments) {
    if (haveMoments.has(m.id)) plan.moments.kept.push(m.id);
    else plan.moments.create.push(m);
  }

  if (!existing.settingsExists) plan.settings.create = seed.settings;

  const haveEpisodes = new Set(existing.episodes.map((e) => e.slug));
  for (const b of seed.briefs) {
    if (!haveEpisodes.has(b.slug)) {
      plan.episodes.create.push(episodeSkeletonFromBrief(b, now));
    }
  }

  return plan;
}

export function importPlanHasChanges(plan: ImportPlan): boolean {
  return (
    plan.briefs.create.length > 0 ||
    plan.briefs.update.length > 0 ||
    plan.voices.create.length > 0 ||
    plan.moments.create.length > 0 ||
    plan.settings.create !== null ||
    plan.episodes.create.length > 0
  );
}

export function summarizeImportPlan(plan: ImportPlan): ImportSummary {
  return {
    briefs_created: plan.briefs.create.length,
    briefs_updated: plan.briefs.update.length,
    briefs_skipped: plan.briefs.skipped,
    briefs_unchanged: plan.briefs.unchanged.length,
    voices_created: plan.voices.create.length,
    voices_kept: plan.voices.kept.length,
    moments_created: plan.moments.create.length,
    moments_kept: plan.moments.kept.length,
    settings_created: plan.settings.create !== null,
    episodes_created: plan.episodes.create.length,
  };
}

/** Apply a plan to an in-memory state (used by tests; mirrors the DB writes). */
export function applyImportPlan(
  existing: ImportExisting,
  plan: ImportPlan,
): ImportExisting {
  const updated = new Map(plan.briefs.update.map((b) => [b.slug, b]));
  return {
    briefs: [
      ...existing.briefs.map((b) => {
        const u = updated.get(b.slug);
        return u ? { ...b, source_hash: u.source_hash } : b;
      }),
      ...plan.briefs.create.map((b) => ({
        slug: b.slug,
        status: b.status,
        admin_edited: b.admin_edited,
        source_hash: b.source_hash,
      })),
    ],
    voices: [...existing.voices, ...plan.voices.create.map((v) => ({ key: v.key }))],
    moments: [...existing.moments, ...plan.moments.create.map((m) => ({ id: m.id }))],
    episodes: [
      ...existing.episodes,
      ...plan.episodes.create.map((e) => ({ slug: e.slug })),
    ],
    settingsExists: existing.settingsExists || plan.settings.create !== null,
  };
}

export function emptyImportExisting(): ImportExisting {
  return { briefs: [], voices: [], moments: [], episodes: [], settingsExists: false };
}
