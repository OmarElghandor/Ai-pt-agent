import { connectMongo, mongoConfigured } from '@/lib/mongo';
import { V2LibraryBriefModel, V2LibraryMomentModel } from '@/lib/v2/mongo/libraryModels';
import { LIBRARY_LANG } from './types';

/**
 * Moment bank (14d §2.4). Archiving only flips a flag on the bank row:
 * briefs keep their own copy of every moment and are never touched here.
 */

export type BankMoment = {
  id: string;
  place: string;
  eg: string;
  must_say: string;
  archived: boolean;
  used_in: number;
};

export class MomentError extends Error {
  constructor(
    message: string,
    readonly status: number = 400,
  ) {
    super(message);
  }
}

/** Pure: next free bank id for a place, `<place>_<n>`. */
export function nextBankMomentId(place: string, existingIds: readonly string[]): string {
  const prefix = `${place}_`;
  let max = 0;
  for (const id of existingIds) {
    if (!id.startsWith(prefix)) continue;
    const n = Number(id.slice(prefix.length));
    if (Number.isInteger(n) && n > max) max = n;
  }
  return `${prefix}${max + 1}`;
}

/** Pure: how many episodes (briefs) use each bank moment, archived rows included. */
export function usedInCounts(
  briefs: readonly { moments?: readonly { bank_id?: string | null }[] }[],
): Map<string, number> {
  const out = new Map<string, number>();
  for (const b of briefs) {
    const ids = new Set<string>();
    for (const m of b.moments ?? []) if (m?.bank_id) ids.add(m.bank_id);
    for (const id of ids) out.set(id, (out.get(id) ?? 0) + 1);
  }
  return out;
}

const PLACE_RE = /^[a-z0-9][a-z0-9_-]*$/;

export function normalizePlace(v: unknown): string {
  const p = typeof v === 'string' ? v.trim().toLowerCase() : '';
  if (!PLACE_RE.test(p)) throw new MomentError('invalid place');
  return p;
}

function requireMongo() {
  if (!mongoConfigured()) throw new Error('MongoDB not configured');
}

export async function listMoments(
  opts: { place?: string; includeArchived?: boolean; lang?: string } = {},
): Promise<{ places: string[]; moments: BankMoment[] }> {
  requireMongo();
  await connectMongo();
  const lang = opts.lang ?? LIBRARY_LANG;
  const all = await V2LibraryMomentModel()
    .find({ target_lang: lang })
    .sort({ place: 1, id: 1 })
    .lean();
  const briefs = await V2LibraryBriefModel()
    .find({ target_lang: lang })
    .select('moments')
    .lean();
  const used = usedInCounts(briefs as { moments?: { bank_id?: string | null }[] }[]);
  const places = [...new Set(all.map((m) => m.place))].sort();
  const moments = all
    .filter((m) => (opts.place ? m.place === opts.place : true))
    .filter((m) => (opts.includeArchived ? true : !m.archived))
    .map((m) => ({
      id: m.id,
      place: m.place,
      eg: m.eg,
      must_say: m.must_say ?? '',
      archived: Boolean(m.archived),
      used_in: used.get(m.id) ?? 0,
    }));
  return { places, moments };
}

export async function createMoment(
  input: { place?: unknown; eg?: unknown; must_say?: unknown },
  lang: string = LIBRARY_LANG,
): Promise<BankMoment> {
  requireMongo();
  await connectMongo();
  const place = normalizePlace(input.place);
  const eg = typeof input.eg === 'string' ? input.eg.trim() : '';
  if (!eg) throw new MomentError('eg is required');
  const must_say = typeof input.must_say === 'string' ? input.must_say.trim() : '';
  const existing = await V2LibraryMomentModel()
    .find({ target_lang: lang, place })
    .select('id')
    .lean();
  const id = nextBankMomentId(
    place,
    existing.map((m) => m.id),
  );
  await V2LibraryMomentModel().create({
    target_lang: lang,
    id,
    place,
    eg,
    must_say,
    archived: false,
  });
  return { id, place, eg, must_say, archived: false, used_in: 0 };
}

export async function updateMoment(
  id: string,
  patch: { eg?: unknown; must_say?: unknown; archived?: unknown },
  lang: string = LIBRARY_LANG,
): Promise<BankMoment> {
  requireMongo();
  await connectMongo();
  const set: Record<string, unknown> = {};
  if (patch.eg !== undefined) {
    const eg = typeof patch.eg === 'string' ? patch.eg.trim() : '';
    if (!eg) throw new MomentError('eg is required');
    set.eg = eg;
  }
  if (patch.must_say !== undefined) {
    if (typeof patch.must_say !== 'string') throw new MomentError('invalid must_say');
    set.must_say = patch.must_say.trim();
  }
  if (patch.archived !== undefined) {
    if (typeof patch.archived !== 'boolean') throw new MomentError('invalid archived');
    set.archived = patch.archived;
  }
  if (Object.keys(set).length === 0) throw new MomentError('nothing to update');
  // Bank row only. Briefs keep their copy of the moment, archived or not.
  const doc = await V2LibraryMomentModel()
    .findOneAndUpdate({ target_lang: lang, id }, { $set: set }, { new: true })
    .lean();
  if (!doc) throw new MomentError('not found', 404);
  const briefs = await V2LibraryBriefModel()
    .find({ target_lang: lang, 'moments.bank_id': id })
    .select('moments')
    .lean();
  const used = usedInCounts(briefs as { moments?: { bank_id?: string | null }[] }[]);
  return {
    id: doc.id,
    place: doc.place,
    eg: doc.eg,
    must_say: doc.must_say ?? '',
    archived: Boolean(doc.archived),
    used_in: used.get(id) ?? 0,
  };
}

/** Archive (or restore) a bank moment. Never edits any brief. */
export function archiveMoment(id: string, archived = true, lang: string = LIBRARY_LANG) {
  return updateMoment(id, { archived }, lang);
}
