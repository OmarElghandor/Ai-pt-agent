import { enqueueOrJoinPrepareDay } from '@/lib/v2/generation/prepare';
import { getDayReadiness, type DayReadiness } from '@/lib/v2/generation/prepare';
import { connectMongo, mongoConfigured } from '@/lib/mongo';
import { loadConvoItemSurfaces } from './surfaces';
import {
  loadConvoPackAsync,
  packIdToDay,
  packIdToLang,
} from './load';
import type { ConvoPackData } from './schema';

export type EnsureConvoPackErrorCode =
  | 'no_published_lesson'
  | 'timeout'
  | 'generate_failed'
  | 'invalid_pack_id'
  | 'mongo_unavailable'
  | 'needs_review';

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
  Exclude<EnsureConvoPackErrorCode, 'needs_review'> | 'preparing' | 'needs_review',
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
};

/**
 * Load a Module A pack if ready. Otherwise enqueue/join `prepare_day` and
 * return `{ code: 'preparing' }` immediately — never blocks on generation.
 */
export async function ensureConvoPackReady(
  packId: string,
  _opts?: { timeoutMs?: number },
): Promise<EnsureConvoPackResult> {
  void _opts; // kept for call-site compat; blocking wait removed (P3).
  const surfaces = loadConvoItemSurfaces();
  const existing = await loadConvoPackAsync(packId, {
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
  const targetLang = packIdToLang(packId);

  if (!mongoConfigured()) {
    return {
      ok: false,
      code: 'mongo_unavailable',
      message: 'MongoDB not configured',
      message_eg: ERR_EG.mongo_unavailable,
    };
  }

  await connectMongo();

  const readiness = await getDayReadiness(day, targetLang);
  if (readiness.lesson === 'needs_review') {
    return {
      ok: false,
      code: 'needs_review',
      message: `Day ${day} needs review before publish`,
      message_eg: readiness.error_eg ?? ERR_EG.needs_review,
    };
  }

  try {
    const enqueued = await enqueueOrJoinPrepareDay({
      day,
      targetLang,
      startWorker: true,
    });
    const nextReadiness = await getDayReadiness(day, targetLang);

    // Race: prepare finished between load and enqueue.
    if (nextReadiness.ready) {
      const again = await loadConvoPackAsync(packId, {
        itemSurfaces: surfaces,
      });
      if (again.ok && again.pack) {
        return { ok: true, pack: again.pack, generated: true };
      }
    }

    if (nextReadiness.lesson === 'needs_review') {
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
