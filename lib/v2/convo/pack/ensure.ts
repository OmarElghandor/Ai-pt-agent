import { enqueueOrJoinPrepareDay } from '@/lib/v2/generation/prepare';
import { getDayReadiness, type DayReadiness } from '@/lib/v2/generation/prepare';
import { isV2DevAllowed } from '@/lib/v2/flags';
import { connectMongo, mongoConfigured } from '@/lib/mongo';
import { isRolePlayDay } from '@/lib/v2/convo/topics/rolePlay';
import { resolveConvoItemSurfacesForPack } from './surfaces';
import {
  loadConvoPackAsync,
  packIdToDay,
  packIdToLang,
  type LoadConvoPackResult,
} from './load';
import type { ConvoPackData } from './schema';

export type EnsureConvoPackErrorCode =
  | 'no_published_lesson'
  | 'timeout'
  | 'generate_failed'
  | 'invalid_pack_id'
  | 'mongo_unavailable'
  | 'needs_review'
  | 'pack_unusable';

export type EnsureConvoPackResult =
  | { ok: true; pack: ConvoPackData; generated: boolean }
  | {
      ok: false;
      code: EnsureConvoPackErrorCode;
      message: string;
      message_eg: string;
    }
  | {
      ok: false;
      code: 'preparing';
      job_id: string;
      readiness: DayReadiness;
      message: string;
      message_eg: string;
    };

const ERR_EG: Record<
  | Exclude<EnsureConvoPackErrorCode, 'needs_review'>
  | 'preparing'
  | 'needs_review',
  string
> = {
  no_published_lesson:
    'مفيش درس منشور لليوم ده — مش هنقدر نولّد المحادثة',
  timeout: 'التوليد اخد وقت أطول من اللازم — حاول تاني بعد شوية',
  generate_failed: 'حصل خطأ أثناء توليد المحادثة — حاول تاني',
  invalid_pack_id: 'معرّف المحادثة مش صح',
  mongo_unavailable: 'قاعدة البيانات مش متاحة دلوقتي',
  preparing: 'بنجهّزلك الدرس ده',
  needs_review:
    'الدرس ده محتاج مراجعة قبل ما يتنشر 🙏 هيبقى جاهز قريب',
  pack_unusable:
    'المحادثة لسه مش قابلة للفتح — جرّب تاني أو من الأدمن',
};

/** Build pack_unusable when readiness says ready but the pack won't load. */
export function packUnusableResult(
  packId: string,
  load?: Pick<LoadConvoPackResult, 'ok' | 'issues'> | null,
): Extract<EnsureConvoPackResult, { ok: false; code: EnsureConvoPackErrorCode }> {
  const issueSummary =
    load && !load.ok && Array.isArray(load.issues) && load.issues.length
      ? load.issues
          .slice(0, 5)
          .map((i) =>
            typeof i === 'object' && i && 'code' in i
              ? String((i as { code: string }).code)
              : JSON.stringify(i),
          )
          .join('; ')
      : 'pack not loadable';
  return {
    ok: false,
    code: 'pack_unusable',
    message: `Pack ${packId} marked ready but failed to load: ${issueSummary}`,
    message_eg: ERR_EG.pack_unusable,
  };
}

export type EnsureConvoPackDeps = {
  loadPack?: typeof loadConvoPackAsync;
  getReadiness?: typeof getDayReadiness;
  enqueue?: typeof enqueueOrJoinPrepareDay;
  isMongoConfigured?: () => boolean;
  connect?: () => Promise<unknown>;
  /** Day-scoped surfaces (published lesson → static fallback). */
  resolveSurfaces?: typeof resolveConvoItemSurfacesForPack;
  /** Test seam; defaults to isV2DevAllowed(). */
  isDevAllowed?: () => boolean;
};

/**
 * Load a Module A pack if ready. Otherwise enqueue/join `prepare_day` and
 * return `{ code: 'preparing' }` immediately — never blocks on generation.
 * When readiness is ready but the pack still won't load → `pack_unusable`.
 */
export async function ensureConvoPackReady(
  packId: string,
  _opts?: { timeoutMs?: number },
  deps?: EnsureConvoPackDeps,
): Promise<EnsureConvoPackResult> {
  void _opts; // kept for call-site compat; blocking wait removed (P3).
  const loadPack = deps?.loadPack ?? loadConvoPackAsync;
  const getReadiness = deps?.getReadiness ?? getDayReadiness;
  const enqueue = deps?.enqueue ?? enqueueOrJoinPrepareDay;
  const isMongo = deps?.isMongoConfigured ?? mongoConfigured;
  const connect = deps?.connect ?? connectMongo;
  const resolveSurfaces =
    deps?.resolveSurfaces ?? resolveConvoItemSurfacesForPack;
  const isDevAllowed = deps?.isDevAllowed ?? isV2DevAllowed;

  const surfaces = await resolveSurfaces(packId);
  const existing = await loadPack(packId, {
    itemSurfaces: surfaces,
  });
  if (existing.ok && existing.pack) {
    return { ok: true, pack: existing.pack, generated: false };
  }

  const day = packIdToDay(packId);
  if (day == null) {
    return {
      ok: false,
      code: 'invalid_pack_id',
      message: `invalid pack id: ${packId}`,
      message_eg: ERR_EG.invalid_pack_id,
    };
  }
  // v3: do not generate greeting-day role-play packs (day 1 is free talk).
  if (!isRolePlayDay(day)) {
    return {
      ok: false,
      code: 'invalid_pack_id',
      message: `day ${day} is not a role-play day (use free talk)`,
      message_eg: 'اليوم ده محادثة حرة مش رول بلاي',
    };
  }
  const targetLang = packIdToLang(packId);

  if (!isMongo()) {
    return {
      ok: false,
      code: 'mongo_unavailable',
      message: 'MongoDB not configured',
      message_eg: ERR_EG.mongo_unavailable,
    };
  }

  await connect();

  const readiness = await getReadiness(day, targetLang);
  const devBypassReview =
    readiness.lesson === 'needs_review' && isDevAllowed();
  if (readiness.lesson === 'needs_review' && !devBypassReview) {
    return {
      ok: false,
      code: 'needs_review',
      message: `Day ${day} needs review before publish`,
      message_eg: readiness.error_eg ?? ERR_EG.needs_review,
    };
  }

  // Already "ready" in readiness but first load failed → don't spin preparing.
  if (readiness.ready) {
    return packUnusableResult(packId, existing);
  }

  try {
    const enqueued = await enqueue({
      day,
      targetLang,
      startWorker: true,
      // force so a stuck needs_review day still creates/joins a prepare job
      ...(devBypassReview ? { force: true } : {}),
    });
    const nextReadiness = await getReadiness(day, targetLang);

    if (nextReadiness.ready) {
      // Lesson may have just published — rebuild day-scoped surfaces.
      const surfacesAgain = await resolveSurfaces(packId);
      const again = await loadPack(packId, {
        itemSurfaces: surfacesAgain,
      });
      if (again.ok && again.pack) {
        return { ok: true, pack: again.pack, generated: true };
      }
      return packUnusableResult(packId, again);
    }

    // Still needs_review with no running job → force publish failed (or prod gate).
    if (nextReadiness.lesson === 'needs_review' && !nextReadiness.job_id) {
      return {
        ok: false,
        code: 'needs_review',
        message: `Day ${day} needs review before publish`,
        message_eg: nextReadiness.error_eg ?? ERR_EG.needs_review,
      };
    }

    return {
      ok: false,
      code: 'preparing',
      job_id: enqueued.jobId || nextReadiness.job_id || '',
      readiness: nextReadiness,
      message: `Preparing day ${day}`,
      message_eg: ERR_EG.preparing,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'generate failed';
    return {
      ok: false,
      code: 'generate_failed',
      message,
      message_eg: ERR_EG.generate_failed,
    };
  }
}
