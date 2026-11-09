import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { LessonBrief } from '@/lib/v2/generation/lesson/brief';
import { callJobTool } from '@/lib/v2/generation/lesson/jobs/call';
import {
  type FreeTopic,
  validateThreadTopicFile,
  type ThreadTopicFile,
} from '@/lib/v2/convo/topics';
import { TopicThreadsToolSchema } from './threadsSchema';
import {
  TOPIC_THREADS_SYSTEM,
  topicThreadsUserBody,
} from './prompts/topicThreads';

const EXAMPLE_IDS = ['casa', 'comida'] as const;

/** Authored topics — never regenerate these via the job. */
export const AUTHORED_THREAD_TOPIC_IDS = new Set([
  'casa',
  'trabalho',
  'bairro',
  'transportes',
  'ontem',
  'amanha',
  'ginasio',
  'comida',
  'compras',
  'fim_de_semana',
  'familia',
  'egito',
]);

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

function loadExampleSnippets(): string {
  const dir = path.join(process.cwd(), 'content/v2/convo/threads');
  return EXAMPLE_IDS.map((id) => {
    const raw = readFileSync(path.join(dir, `pt-PT.${id}.json`), 'utf8');
    return `--- example ${id} ---\n${raw.slice(0, 1800)}`;
  }).join('\n\n');
}

export type RunTopicThreadsResult = {
  ok: boolean;
  doc: ThreadTopicFile | null;
  issues: string[];
  timing: Awaited<ReturnType<typeof callJobTool>>['timing'];
  tokens: Awaited<ReturnType<typeof callJobTool>>['tokens'];
  over_budget: boolean;
  model: string;
  provider: Awaited<ReturnType<typeof callJobTool>>['provider'];
};

/**
 * Generate a thread topic file for a FUTURE free topic (Batch 9 C10).
 * Refuses the 12 authored topic ids. Validates with C1 validator.
 */
export async function runTopicThreadsJob(opts: {
  topic: FreeTopic;
  targetLang?: string;
}): Promise<RunTopicThreadsResult> {
  if (AUTHORED_THREAD_TOPIC_IDS.has(opts.topic.id)) {
    throw new Error(
      `Refusing to regenerate authored topic ${opts.topic.id}; job is for future topics only`,
    );
  }

  const targetLang = opts.targetLang ?? 'pt-PT';
  const exampleJson = loadExampleSnippets();
  const issues: string[] = [];

  for (let attempt = 0; attempt < 2; attempt++) {
    const call = await callJobTool({
      label: 'topic_threads',
      kind: 'topic_angles',
      systemPrompt: TOPIC_THREADS_SYSTEM,
      brief: stubBrief(opts.topic),
      userBody: topicThreadsUserBody({
        topicId: opts.topic.id,
        titleTl: opts.topic.title_tl,
        titleAr: opts.topic.title_ar,
        characterId: opts.topic.character_id,
        related: opts.topic.related_topic_ids,
        exampleJson,
      }),
      toolName: 'submit_topic_threads',
      toolDescription: 'Return a 5-thread free-chat topic file.',
      schema: TopicThreadsToolSchema,
      systemModules: [{ name: 'topic_threads', version: '1' }],
    });

    const parsed = TopicThreadsToolSchema.parse(call.data);
    const raw = {
      ...parsed,
      target_lang: targetLang,
      topic: { ...parsed.topic, id: opts.topic.id },
    };
    const validated = validateThreadTopicFile(raw, { addressIsTu: true });
    if (validated.ok && validated.doc) {
      return {
        ok: true,
        doc: validated.doc,
        issues,
        timing: call.timing,
        tokens: call.tokens,
        over_budget: call.over_budget,
        model: call.model,
        provider: call.provider,
      };
    }
    issues.push(
      `attempt ${attempt + 1}: ${validated.issues.map((i) => i.message).join('; ')}`,
    );
    if (attempt === 1) {
      return {
        ok: false,
        doc: null,
        issues,
        timing: call.timing,
        tokens: call.tokens,
        over_budget: call.over_budget,
        model: call.model,
        provider: call.provider,
      };
    }
  }

  throw new Error('topic_threads: unreachable');
}
