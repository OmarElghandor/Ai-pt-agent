import { getPublishedLesson } from '@/lib/v2/content/getPublishedLesson';
import { enqueueAndStartGenerateConvoPack } from '@/lib/v2/generation/jobs';
import { connectMongo, mongoConfigured } from '@/lib/mongo';
import { V2ConvoPackModel } from '@/lib/v2/mongo/models';
import { loadConvoItemSurfaces } from './surfaces';
import {
  loadConvoPackAsync,
  packIdToDay,
  packIdToLang,
  requireConvoPackAsync,
} from './load';
import type { ConvoPackData } from './schema';

export type EnsureConvoPackErrorCode =
  | 'no_published_lesson'
  | 'timeout'
  | 'generate_failed'
  | 'invalid_pack_id'
  | 'mongo_unavailable';

export type EnsureConvoPackResult =
  | { ok: true; pack: ConvoPackData; generated: boolean }
  | {
      ok: false;
      code: EnsureConvoPackErrorCode;
      message: string;
      message_eg: string;
    };

const POLL_MS = 2_500;
const DEFAULT_TIMEOUT_MS = 180_000;

const ERR_EG: Record<EnsureConvoPackErrorCode, string> = {
  no_published_lesson:
    'مفيش درس منشور لليوم ده — مش هنقدر نولّد المحادثة',
  timeout: 'التوليد اخد وقت أطول من اللازم — حاول تاني بعد شوية',
  generate_failed: 'حصل خطأ أثناء توليد المحادثة — حاول تاني',
  invalid_pack_id: 'معرّف المحادثة مش صح',
  mongo_unavailable: 'قاعدة البيانات مش متاحة دلوقتي',
};

async function mongoPackTextReady(
  day: number,
  targetLang: string,
): Promise<boolean> {
  if (!mongoConfigured()) return false;
  await connectMongo();
  const doc = await V2ConvoPackModel()
    .findOne({
      day,
      target_lang: targetLang,
      $or: [{ status: 'published' }, { 'meta.text_ready': true }],
    })
    .select({ _id: 1 })
    .lean();
  return Boolean(doc);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Load a Module A pack, generating into Mongo on first open when missing.
 * Blocks until text_ready (or timeout). Prefer calling from the start route.
 */
export async function ensureConvoPackReady(
  packId: string,
  opts?: { timeoutMs?: number },
): Promise<EnsureConvoPackResult> {
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

  const published = await getPublishedLesson(day);
  if (!published) {
    return {
      ok: false,
      code: 'no_published_lesson',
      message: `No published lesson for day ${day}`,
      message_eg: ERR_EG.no_published_lesson,
    };
  }

  try {
    await enqueueAndStartGenerateConvoPack({
      day,
      targetLang,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'generate failed';
    if (/No published lesson/i.test(message)) {
      return {
        ok: false,
        code: 'no_published_lesson',
        message,
        message_eg: ERR_EG.no_published_lesson,
      };
    }
    return {
      ok: false,
      code: 'generate_failed',
      message,
      message_eg: ERR_EG.generate_failed,
    };
  }

  const deadline = Date.now() + (opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  while (Date.now() < deadline) {
    if (await mongoPackTextReady(day, targetLang)) {
      try {
        const pack = await requireConvoPackAsync(packId, {
          itemSurfaces: surfaces,
        });
        return { ok: true, pack, generated: true };
      } catch (err) {
        return {
          ok: false,
          code: 'generate_failed',
          message: err instanceof Error ? err.message : 'pack invalid',
          message_eg: ERR_EG.generate_failed,
        };
      }
    }
    await sleep(POLL_MS);
  }

  return {
    ok: false,
    code: 'timeout',
    message: `Timed out waiting for convo pack day ${day}`,
    message_eg: ERR_EG.timeout,
  };
}
