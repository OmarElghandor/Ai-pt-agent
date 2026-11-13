import { connectMongo, mongoConfigured } from '@/lib/mongo';
import { V2CustomDeckJobModel } from '@/lib/v2/mongo/models';
import { customDeckQuota } from '../quota';
import {
  generateCustomDeck,
  type GeneratePhase,
  type ModelCaller,
} from './index';

export type RunGenerateResult =
  | {
      ok: true;
      draft_id: string;
      title_tl: string;
      title_ar: string;
      tags: string[];
      words: Array<{
        key: string;
        tl: string;
        say: string;
        ar: string;
        pos: string;
        gender?: string;
        eg_note?: string;
      }>;
      quota_remaining: number;
    }
  | {
      ok: false;
      reason: string;
      message_eg: string;
      quota_remaining?: number;
    };

export async function countQuotaUsage(opts: {
  user_id: string;
  local_date: string;
}): Promise<{ userUsed: number; globalUsed: number }> {
  if (!mongoConfigured()) return { userUsed: 0, globalUsed: 0 };
  await connectMongo();
  const Model = V2CustomDeckJobModel();
  const [userUsed, globalUsed] = await Promise.all([
    Model.countDocuments({
      user_id: opts.user_id,
      local_date: opts.local_date,
      counts_for_quota: true,
    }),
    Model.countDocuments({
      local_date: opts.local_date,
      counts_for_quota: true,
    }),
  ]);
  return { userUsed, globalUsed };
}

export async function runGenerateCustomDeck(opts: {
  user_id: string;
  topic: string;
  local_date: string;
  phase?: GeneratePhase;
  targetLang?: string;
  callModel?: ModelCaller;
}): Promise<RunGenerateResult> {
  if (!mongoConfigured()) {
    return {
      ok: false,
      reason: 'mongo',
      message_eg: 'الخدمة مش جاهزة دلوقتي',
    };
  }
  await connectMongo();

  const { userUsed, globalUsed } = await countQuotaUsage({
    user_id: opts.user_id,
    local_date: opts.local_date,
  });
  const quota = customDeckQuota(
    { id: opts.user_id },
    { userUsed, globalUsed },
  );
  if (!quota.allowed) {
    return {
      ok: false,
      reason: 'quota',
      message_eg: 'خلصت محاولات النهارده، جرّب بكرة',
      quota_remaining: 0,
    };
  }

  const result = await generateCustomDeck({
    topic: opts.topic,
    targetLang: opts.targetLang,
    phase: opts.phase,
    callModel: opts.callModel,
  });

  if (!result.ok) {
    await V2CustomDeckJobModel().create({
      user_id: opts.user_id,
      local_date: opts.local_date,
      status: 'failed',
      attempts: result.model_calls ?? 0,
      topic: opts.topic.trim().slice(0, 60),
      error: result.reason,
      counts_for_quota: false,
    });
    return {
      ok: false,
      reason: result.reason,
      message_eg: result.message_eg,
      quota_remaining: quota.userRemaining,
    };
  }

  const job = await V2CustomDeckJobModel().create({
    user_id: opts.user_id,
    local_date: opts.local_date,
    status: 'done',
    attempts: result.model_calls,
    topic: opts.topic.trim().slice(0, 60),
    preview: {
      title_tl: result.title_tl,
      title_ar: result.title_ar,
      tags: result.tags,
      topic: opts.topic.trim().slice(0, 60),
      target_lang: opts.targetLang ?? 'pt-PT',
      words: result.words,
    },
    cost: result.usage ?? undefined,
    latency_ms: result.latency_ms,
    counts_for_quota: true,
  });

  return {
    ok: true,
    draft_id: String(job._id),
    title_tl: result.title_tl,
    title_ar: result.title_ar,
    tags: result.tags,
    words: result.words.map((w) => ({
      key: w.lemma,
      tl: w.tl,
      say: w.say,
      ar: w.ar,
      pos: w.pos,
      gender: w.gender,
      eg_note: w.eg_note,
      concept_en: w.concept_en,
      example_tl: w.example_tl,
      example_ar: w.example_ar,
    })),
    quota_remaining: Math.max(0, quota.userRemaining - 1),
  };
}
