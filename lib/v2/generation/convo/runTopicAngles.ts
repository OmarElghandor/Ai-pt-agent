import type { LessonBrief } from '@/lib/v2/generation/lesson/brief';
import { callJobTool } from '@/lib/v2/generation/lesson/jobs/call';
import {
  filterValidAngles,
  type FreeTopic,
  type TopicAngle,
  validateTopicAngles,
} from '@/lib/v2/convo/topics';
import { TopicAnglesToolSchema } from './anglesSchema';
import {
  TOPIC_ANGLES_SYSTEM,
  topicAnglesUserBody,
} from './prompts/topicAngles';

/** Minimal brief so callJobTool's formatLessonBrief still runs. */
function stubBrief(topic: FreeTopic): LessonBrief {
  return {
    day: 0,
    phase: 1,
    week: 0,
    title_tl: topic.title_tl,
    title_ar: topic.title_ar,
    situation_eg: `Free chat: ${topic.title_ar}`,
    rule_eg: '',
    grammar_focus: 'free_chat',
    max_words: 12,
    chat_character: topic.character_id,
    early_chunks_tl: [],
    core_items: [],
    core_items_tl: topic.word_set.slice(0, 8),
    core_items_source: 'core_file',
    recycle_ids: [],
    no_new_items: true,
    planned_presets: [],
    yesterday: null,
    yesterday_missing: false,
    micro_step: '',
    authored_real_world: null,
    warnings: [],
  };
}

export type RunTopicAnglesResult = {
  ok: boolean;
  angles: TopicAngle[];
  dropped: string[];
  issues: string[];
  timing: Awaited<ReturnType<typeof callJobTool>>['timing'];
  tokens: Awaited<ReturnType<typeof callJobTool>>['tokens'];
  over_budget: boolean;
  model: string;
  provider: Awaited<ReturnType<typeof callJobTool>>['provider'];
};

async function generateOnce(topic: FreeTopic): Promise<{
  angles: TopicAngle[];
  call: Awaited<ReturnType<typeof callJobTool>>;
}> {
  const call = await callJobTool({
    label: 'topic_angles',
    kind: 'topic_angles',
    systemPrompt: TOPIC_ANGLES_SYSTEM,
    brief: stubBrief(topic),
    userBody: topicAnglesUserBody({
      topicId: topic.id,
      titleTl: topic.title_tl,
      titleAr: topic.title_ar,
      wordSet: topic.word_set,
    }),
    toolName: 'submit_topic_angles',
    toolDescription: 'Return 8–12 free-chat angles for this topic.',
    schema: TopicAnglesToolSchema,
    systemModules: [{ name: 'topic_angles', version: '1' }],
  });

  const parsed = TopicAnglesToolSchema.parse(call.data);
  const angles: TopicAngle[] = parsed.angles.map((a, i) => ({
    id: a.id || `${topic.id}.a${String(i + 1).padStart(2, '0')}`,
    tl: a.tl,
    item_hints: a.item_hints ?? [],
  }));
  return { angles, call };
}

/**
 * Generate angles for one free topic: one retry, then drop bad lines.
 * Ships if ≥8 valid angles remain.
 */
export async function runTopicAnglesJob(opts: {
  topic: FreeTopic;
  targetLang?: string;
}): Promise<RunTopicAnglesResult> {
  const targetLang = opts.targetLang ?? 'pt-PT';
  let lastCall: Awaited<ReturnType<typeof callJobTool>> | null = null;
  let angles: TopicAngle[] = [];
  const issues: string[] = [];

  for (let attempt = 0; attempt < 2; attempt++) {
    const { angles: raw, call } = await generateOnce(opts.topic);
    lastCall = call;
    const filtered = filterValidAngles(raw);
    angles = filtered.kept;
    if (filtered.dropped.length) {
      issues.push(
        `attempt ${attempt + 1} dropped: ${filtered.dropped.join(', ')}`,
      );
    }
    const validated = validateTopicAngles({
      target_lang: targetLang,
      topic_id: opts.topic.id,
      angles,
    });
    if (validated.ok && validated.doc) {
      return {
        ok: true,
        angles: validated.doc.angles,
        dropped: filtered.dropped,
        issues,
        timing: call.timing,
        tokens: call.tokens,
        over_budget: call.over_budget,
        model: call.model,
        provider: call.provider,
      };
    }
    issues.push(
      ...validated.issues.map((i) => `${i.path}: ${i.message}`),
    );
  }

  return {
    ok: false,
    angles,
    dropped: [],
    issues,
    timing: lastCall!.timing,
    tokens: lastCall!.tokens,
    over_budget: lastCall!.over_budget,
    model: lastCall!.model,
    provider: lastCall!.provider,
  };
}
