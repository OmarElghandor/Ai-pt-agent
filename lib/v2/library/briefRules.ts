import { markStale } from './stages';
import {
  LIBRARY_TYPES,
  type BriefCastRow,
  type BriefMoment,
  type EpisodeStages,
  type LibraryType,
} from './types';

/**
 * Pure brief rules (14d §2.2a, 14 §2.3b). No DB, no fs.
 */

/** Learner-facing directions of a real moment; `none` for podcasts with no learner. */
export const MOMENT_DIRECTIONS = ['يسأل', 'يتسأل', 'يسمع', 'none'] as const;
export type MomentDirection = (typeof MOMENT_DIRECTIONS)[number];

/** Moment minimum by level: L1 = 2, L2–5 = 3 (14 §2.3b). */
export function momentMinimum(level: number): number {
  return level <= 1 ? 2 : 3;
}

export const BRIEF_STALE_REASON = 'الـ brief اتغير، السكريبت محتاج يتكتب تاني';

export type BriefInput = {
  type: LibraryType;
  target_level: number;
  intro_eg: string;
  cast: BriefCastRow[];
  places: string[];
  beats: string[];
  must_have_phrases: string[];
  moments: BriefMoment[];
  linked_episode: string | null;
  notes_admin?: string;
};

export class BriefValidationError extends Error {
  constructor(
    message: string,
    readonly field?: string,
  ) {
    super(message);
  }
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function strList(v: unknown, field: string): string[] {
  if (v == null) return [];
  if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) {
    throw new BriefValidationError(`${field} must be string[]`, field);
  }
  return (v as string[]).map((s) => s.trim()).filter(Boolean);
}

/** Validate and trim an untrusted brief body. Throws BriefValidationError. */
export function normalizeBriefInput(raw: unknown): BriefInput {
  if (!raw || typeof raw !== 'object') {
    throw new BriefValidationError('body must be an object');
  }
  const r = raw as Record<string, unknown>;
  const type = r.type;
  if (!LIBRARY_TYPES.includes(type as LibraryType)) {
    throw new BriefValidationError('invalid type', 'type');
  }
  const level = Number(r.target_level);
  if (!Number.isInteger(level) || level < 1 || level > 5) {
    throw new BriefValidationError('invalid target_level', 'target_level');
  }
  if (!Array.isArray(r.cast)) {
    throw new BriefValidationError('cast must be an array', 'cast');
  }
  const cast: BriefCastRow[] = (r.cast as Record<string, unknown>[]).map((c) => ({
    voice_key: str(c?.voice_key),
    role_eg: str(c?.role_eg),
    learner: Boolean(c?.learner),
  }));
  if (cast.some((c) => !c.voice_key)) {
    throw new BriefValidationError('every cast row needs a voice_key', 'cast');
  }
  if (!Array.isArray(r.moments)) {
    throw new BriefValidationError('moments must be an array', 'moments');
  }
  const seen = new Set<string>();
  const moments: BriefMoment[] = (r.moments as Record<string, unknown>[]).map(
    (m) => {
      const id = str(m?.id);
      const direction = str(m?.direction) || 'none';
      if (!id) throw new BriefValidationError('moment needs an id', 'moments');
      if (seen.has(id)) {
        throw new BriefValidationError(`duplicate moment id ${id}`, 'moments');
      }
      seen.add(id);
      if (!MOMENT_DIRECTIONS.includes(direction as MomentDirection)) {
        throw new BriefValidationError('invalid moment direction', 'moments');
      }
      const eg = str(m?.eg);
      if (!eg) throw new BriefValidationError('moment needs text', 'moments');
      const bank = str(m?.bank_id);
      return {
        id,
        eg,
        direction,
        must_say: str(m?.must_say),
        bank_id: bank || null,
      };
    },
  );
  const linked = str(r.linked_episode);
  return {
    type: type as LibraryType,
    target_level: level,
    intro_eg: str(r.intro_eg),
    cast,
    places: strList(r.places, 'places'),
    beats: strList(r.beats, 'beats'),
    must_have_phrases: strList(r.must_have_phrases, 'must_have_phrases'),
    moments,
    linked_episode: linked || null,
    notes_admin: typeof r.notes_admin === 'string' ? r.notes_admin : undefined,
  };
}

/**
 * Archived moments are still real moments of the brief: the brief carries its own
 * copy of the text, so they count and stay.
 */
export function countBriefMoments(moments: readonly BriefMoment[]): number {
  return moments.length;
}

export type ApproveCheck =
  | { ok: true }
  | { ok: false; reason: 'moments_below_minimum'; have: number; need: number }
  | { ok: false; reason: 'no_intro' | 'no_cast' | 'no_beats' };

/** Can this brief be approved? Moment minimum is enforced here. */
export function checkApprovable(
  brief: Pick<BriefInput, 'target_level' | 'moments' | 'intro_eg' | 'cast' | 'beats'>,
): ApproveCheck {
  const need = momentMinimum(brief.target_level);
  const have = countBriefMoments(brief.moments);
  if (have < need) {
    return { ok: false, reason: 'moments_below_minimum', have, need };
  }
  if (!brief.intro_eg.trim()) return { ok: false, reason: 'no_intro' };
  if (brief.cast.length === 0) return { ok: false, reason: 'no_cast' };
  if (brief.beats.length === 0) return { ok: false, reason: 'no_beats' };
  return { ok: true };
}

/** Egyptian message for the admin when approve is refused. */
export function approveRefusalMessage(check: Exclude<ApproveCheck, { ok: true }>): string {
  switch (check.reason) {
    case 'moments_below_minimum':
      return `اللحظات ${check.have} من ${check.need} مطلوبين، كمّل الباقي قبل الاعتماد`;
    case 'no_intro':
      return 'اكتب الـ intro الأول';
    case 'no_cast':
      return 'ضيف شخصية واحدة على الأقل في الـ cast';
    case 'no_beats':
      return 'ضيف beat واحد على الأقل';
  }
}

/**
 * Pure: an approved brief was edited. The Script stage (and the ones built on it)
 * are marked stale, output kept. Only stages that already have output are flagged.
 */
export function markScriptStaleOnBriefEdit(
  stages: EpisodeStages,
  now: Date = new Date(),
): EpisodeStages {
  return markStale(stages, 'brief', BRIEF_STALE_REASON, now);
}

/** Pure: stage state after a brief save. Approved → back to draft and stale marked. */
export function stagesAfterBriefSave(
  stages: EpisodeStages,
  wasApproved: boolean,
  now: Date = new Date(),
): EpisodeStages {
  if (!wasApproved) return stages;
  const stale = markScriptStaleOnBriefEdit(stages, now);
  return {
    ...stale,
    brief: { ...stale.brief, status: 'draft', updated_at: now },
  };
}

/** Pure: stage state after approve. */
export function stagesAfterApprove(
  stages: EpisodeStages,
  now: Date = new Date(),
): EpisodeStages {
  return {
    ...stages,
    brief: { ...stages.brief, status: 'approved', stale: false, updated_at: now },
  };
}
