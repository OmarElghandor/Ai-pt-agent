import { connectMongo, mongoConfigured } from '@/lib/mongo';
import {
  V2LibraryBriefModel,
  V2LibraryEpisodeModel,
} from '@/lib/v2/mongo/libraryModels';
import {
  LIBRARY_LANG,
  LIBRARY_STAGES,
  LIBRARY_TYPES,
  STAGE_BUCKETS,
  type LibraryStage,
  type LibraryType,
  type StageBucket,
} from './types';

export type EpisodeStageChip = {
  status: string;
  stale: boolean;
};

export type EpisodeListRow = {
  slug: string;
  number: number | null;
  title_tl: string | null;
  title_ar: string | null;
  intro_eg: string | null;
  type: LibraryType;
  target_level: number;
  measured_level: number | null;
  sort_order: number;
  version: number;
  status: string;
  stages: Record<LibraryStage, EpisodeStageChip>;
  bucket: StageBucket | null;
  warnings: number;
  total_cost_usd: number;
  updated_at: string | null;
};

export type EpisodeListFilters = {
  type?: LibraryType;
  level?: number;
  bucket?: StageBucket;
};

type StageLike = { status?: string; stale?: boolean } | undefined;
type StagesLike = Partial<Record<LibraryStage, StageLike>> | undefined;

function chip(s: StageLike): EpisodeStageChip {
  return { status: s?.status ?? 'none', stale: Boolean(s?.stale) };
}

/** One bucket per episode, most advanced first (14d §2.1 filters). */
export function stageBucket(stages: StagesLike): StageBucket | null {
  const st = stages ?? {};
  if (st.publish?.status === 'published') return 'published';
  const briefOk = st.brief?.status === 'approved';
  const reviewOk = st.review?.status === 'approved';
  const audioReady = st.audio?.status === 'ready' && !st.audio?.stale;
  const voicesOk = st.voices?.status === 'ok';
  if (briefOk && reviewOk && audioReady && voicesOk) return 'ready_to_publish';
  if (reviewOk && !audioReady) return 'needs_audio';
  if (st.script?.status === 'ready' && !reviewOk) return 'needs_review';
  return null;
}

export function totalCostUsd(costs: unknown): number {
  if (!costs || typeof costs !== 'object') return 0;
  const c = costs as Record<string, unknown>;
  if (typeof c.total_usd === 'number') return c.total_usd;
  let sum = 0;
  for (const [k, v] of Object.entries(c)) {
    if (k.endsWith('_usd') && typeof v === 'number') sum += v;
  }
  return sum;
}

type EpisodeLike = {
  slug: string;
  version: number;
  status: string;
  type: LibraryType;
  target_level: number;
  measured_level?: number | null;
  title_tl?: string | null;
  title_ar?: string | null;
  intro_eg?: string | null;
  sort_order: number;
  stages?: StagesLike;
  warnings?: unknown[];
  costs?: unknown;
  updatedAt?: Date | string | null;
};

export function buildEpisodeRow(
  ep: EpisodeLike,
  brief?: { number?: number } | null,
): EpisodeListRow {
  const stages = {} as Record<LibraryStage, EpisodeStageChip>;
  for (const s of LIBRARY_STAGES) stages[s] = chip(ep.stages?.[s]);
  return {
    slug: ep.slug,
    number: brief?.number ?? null,
    title_tl: ep.title_tl ?? null,
    title_ar: ep.title_ar ?? null,
    intro_eg: ep.intro_eg ?? null,
    type: ep.type,
    target_level: ep.target_level,
    measured_level: ep.measured_level ?? null,
    sort_order: ep.sort_order,
    version: ep.version,
    status: ep.status,
    stages,
    bucket: stageBucket(ep.stages),
    warnings: Array.isArray(ep.warnings) ? ep.warnings.length : 0,
    total_cost_usd: totalCostUsd(ep.costs),
    updated_at: ep.updatedAt ? new Date(ep.updatedAt).toISOString() : null,
  };
}

/** Level first, then the order Omar set. */
export function sortEpisodeRows(rows: EpisodeListRow[]): EpisodeListRow[] {
  return [...rows].sort(
    (a, b) =>
      a.target_level - b.target_level ||
      a.sort_order - b.sort_order ||
      a.slug.localeCompare(b.slug),
  );
}

export function filterEpisodeRows(
  rows: EpisodeListRow[],
  f: EpisodeListFilters,
): EpisodeListRow[] {
  return rows.filter(
    (r) =>
      (!f.type || r.type === f.type) &&
      (!f.level || r.target_level === f.level) &&
      (!f.bucket || r.bucket === f.bucket),
  );
}

/** Parse query-string filters; unknown values are ignored. */
export function parseEpisodeFilters(params: URLSearchParams): EpisodeListFilters {
  const out: EpisodeListFilters = {};
  const type = params.get('type');
  if (type && (LIBRARY_TYPES as readonly string[]).includes(type)) {
    out.type = type as LibraryType;
  }
  const level = Number(params.get('level'));
  if (Number.isInteger(level) && level >= 1 && level <= 5) out.level = level;
  const bucket = params.get('stage') ?? params.get('bucket');
  if (bucket && (STAGE_BUCKETS as readonly string[]).includes(bucket)) {
    out.bucket = bucket as StageBucket;
  }
  return out;
}

/** Latest version of each episode, joined with its brief number. */
export async function listEpisodes(
  filters: EpisodeListFilters = {},
  lang: string = LIBRARY_LANG,
): Promise<EpisodeListRow[]> {
  if (!mongoConfigured()) throw new Error('MongoDB not configured');
  await connectMongo();
  const [episodes, briefs] = await Promise.all([
    V2LibraryEpisodeModel().find({ target_lang: lang }).lean(),
    V2LibraryBriefModel().find({ target_lang: lang }).select('slug number').lean(),
  ]);
  const latest = new Map<string, (typeof episodes)[number]>();
  for (const e of episodes) {
    const cur = latest.get(e.slug);
    if (!cur || e.version > cur.version) latest.set(e.slug, e);
  }
  const numberBySlug = new Map(briefs.map((b) => [b.slug, b]));
  const rows = [...latest.values()].map((e) =>
    buildEpisodeRow(e as unknown as EpisodeLike, numberBySlug.get(e.slug)),
  );
  return sortEpisodeRows(filterEpisodeRows(rows, filters));
}

/** Episode (latest version unless given) plus its brief, for the admin page. */
export async function getEpisodeWithBrief(
  slug: string,
  opts: { version?: number; lang?: string } = {},
) {
  if (!mongoConfigured()) throw new Error('MongoDB not configured');
  await connectMongo();
  const lang = opts.lang ?? LIBRARY_LANG;
  const episode = opts.version
    ? await V2LibraryEpisodeModel()
        .findOne({ target_lang: lang, slug, version: opts.version })
        .lean()
    : await V2LibraryEpisodeModel()
        .findOne({ target_lang: lang, slug })
        .sort({ version: -1 })
        .lean();
  const brief = await V2LibraryBriefModel()
    .findOne({ target_lang: lang, slug })
    .lean();
  if (!episode && !brief) return null;
  return { episode, brief };
}
