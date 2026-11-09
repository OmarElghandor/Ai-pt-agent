import { connectMongo, mongoConfigured } from '@/lib/mongo';
import { V2LessonModel } from '@/lib/v2/mongo/models';
import {
  isBlockedForPublish,
  type PublishBlockMeta,
} from '@/lib/v2/generation/lesson/issueResolve';
import { hasBrazilianFlags } from './readiness';
import { updateDraft, type GenerationMeta } from '@/lib/v2/generation/lesson/save';

export type ReviewQueueKind = 'needs_review' | 'auto_published';

export type ReviewQueueItem = {
  day: number;
  target_lang: string;
  version: number;
  status: string;
  kind: ReviewQueueKind;
  fatal_issues: Array<{ rule?: string; severity?: string; message?: string }>;
  brazilian: boolean;
  auto_published: boolean;
  auto_published_checked: boolean;
  prepare_error_eg?: string;
};

/** Pure classifier for tests + listReviewQueue. */
export function classifyReviewItem(doc: {
  day: number;
  target_lang: string;
  version: number;
  status: string;
  meta?: GenerationMeta | null;
}): ReviewQueueItem | null {
  const meta = (doc.meta ?? {}) as GenerationMeta & {
    prepare_error_eg?: string;
  };
  const blocked =
    isBlockedForPublish(meta as PublishBlockMeta) ||
    hasBrazilianFlags(meta as PublishBlockMeta);
  const auto = Boolean(meta.auto_published);
  const checked = Boolean(meta.auto_published_checked);
  const fatals = (meta.issues ?? []).filter(
    (i) =>
      i.severity === 'error' ||
      i.rule === 'brazilian' ||
      i.rule === 'dialogue_check',
  );

  if (doc.status !== 'published' && blocked) {
    return {
      day: doc.day,
      target_lang: doc.target_lang,
      version: doc.version,
      status: doc.status,
      kind: 'needs_review',
      fatal_issues: fatals.map((i) => ({
        rule: i.rule,
        severity: i.severity,
        message: i.message,
      })),
      brazilian: hasBrazilianFlags(meta as PublishBlockMeta),
      auto_published: auto,
      auto_published_checked: checked,
      prepare_error_eg: meta.prepare_error_eg,
    };
  }

  if (doc.status === 'published' && auto && !checked) {
    return {
      day: doc.day,
      target_lang: doc.target_lang,
      version: doc.version,
      status: doc.status,
      kind: 'auto_published',
      fatal_issues: [],
      brazilian: false,
      auto_published: true,
      auto_published_checked: false,
    };
  }

  return null;
}

/**
 * Days that need admin eyes: publish-blocked drafts, or auto-published
 * lessons not yet checked.
 */
export async function listReviewQueue(
  targetLang = 'pt-PT',
): Promise<ReviewQueueItem[]> {
  if (!mongoConfigured()) return [];
  await connectMongo();

  const docs = await V2LessonModel()
    .find({ target_lang: targetLang })
    .sort({ day: 1, version: -1 })
    .select({ day: 1, target_lang: 1, version: 1, status: 1, meta: 1 })
    .lean();

  const latestByDay = new Map<number, (typeof docs)[number]>();
  for (const doc of docs) {
    if (!latestByDay.has(doc.day)) latestByDay.set(doc.day, doc);
  }

  const out: ReviewQueueItem[] = [];
  for (const doc of latestByDay.values()) {
    const item = classifyReviewItem({
      day: doc.day,
      target_lang: doc.target_lang,
      version: doc.version,
      status: doc.status,
      meta: doc.meta as GenerationMeta | undefined,
    });
    if (item) out.push(item);
  }

  return out.sort((a, b) => a.day - b.day);
}

export async function markAutoPublishedChecked(opts: {
  day: number;
  targetLang?: string;
  version?: number;
}): Promise<void> {
  if (!mongoConfigured()) throw new Error('MongoDB not configured');
  await connectMongo();
  const target_lang = opts.targetLang ?? 'pt-PT';
  const doc =
    opts.version != null
      ? await V2LessonModel()
          .findOne({ day: opts.day, target_lang, version: opts.version })
          .lean()
      : await V2LessonModel()
          .findOne({ day: opts.day, target_lang })
          .sort({ version: -1 })
          .lean();
  if (!doc) throw new Error('lesson not found');
  await updateDraft({
    day: opts.day,
    targetLang: target_lang,
    version: doc.version,
    meta: { auto_published_checked: true },
    mergeMeta: true,
  });
}
