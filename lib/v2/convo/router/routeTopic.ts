import {
  listAllowedTopics,
  listTopicCatalog,
  topicAllowedAtLevel,
  type ConvoTopicCatalogEntry,
} from '@/lib/v2/convo/topics/allowed';
import { isGreetingOrSmallTalk } from './greetings';
import { extractExplicitTopicRequest } from './patterns';
import {
  ROUTER_CONFIDENCE_FLOOR,
  type RouterClassifier,
  type RouterDecision,
  type RouterModelOutput,
} from './types';

function findInCatalog(
  catalog: ConvoTopicCatalogEntry[],
  id: string,
): ConvoTopicCatalogEntry | undefined {
  return catalog.find((t) => t.id === id);
}

/**
 * Resolve a learner message into a topic decision (v4 V3).
 * Greetings never lock. Router model runs only for topic-naming messages.
 */
export async function routeTopic(opts: {
  message: string;
  level: number;
  /** Full catalog (allowed + above-level). Defaults to listTopicCatalog(). */
  catalog?: ConvoTopicCatalogEntry[];
  /** Allowed-only list for the classifier input. */
  allowed?: ConvoTopicCatalogEntry[];
  classify?: RouterClassifier;
  /** Precomputed model output (tests). */
  modelOutput?: RouterModelOutput;
}): Promise<RouterDecision> {
  const message = opts.message.trim();
  if (isGreetingOrSmallTalk(message)) {
    return { kind: 'greeting', reask: true };
  }

  const catalog = opts.catalog ?? listTopicCatalog();
  const allowed =
    opts.allowed ??
    listAllowedTopics(opts.level, { generated: opts.catalog?.filter((t) => t.source === 'generated') });

  const explicit = extractExplicitTopicRequest(message);

  // Explicit request with a known hint can lock without the model when clear.
  if (explicit?.hint_id && !opts.classify && opts.modelOutput == null) {
    const entry = findInCatalog(catalog, explicit.hint_id);
    if (entry) {
      const teaching = !topicAllowedAtLevel(entry, opts.level);
      return {
        kind: 'lock',
        topic_id: entry.id,
        teaching_mode: teaching,
        confidence: 1,
      };
    }
    // Unknown id (e.g. futebol) → new topic, teaching if above level vocabulary.
    return {
      kind: 'lock',
      topic_id: explicit.hint_id,
      teaching_mode: true,
      confidence: 0.9,
      is_new: true,
      new_topic_title: explicit.label,
    };
  }

  let model: RouterModelOutput;
  if (opts.modelOutput) {
    model = opts.modelOutput;
  } else if (opts.classify) {
    model = await opts.classify({
      message,
      level: opts.level,
      catalog: allowed.map((t) => ({
        id: t.id,
        title_tl: t.title_tl,
        title_ar: t.title_ar,
        description: t.description,
      })),
    });
  } else if (explicit) {
    // No classifier: treat free-form explicit request as new topic.
    return {
      kind: 'lock',
      topic_id: 'new',
      teaching_mode: true,
      confidence: 0.85,
      is_new: true,
      new_topic_title: explicit.label,
    };
  } else {
    return { kind: 'chips', reason: 'unclear', confidence: 0 };
  }

  if (model.confidence < ROUTER_CONFIDENCE_FLOOR) {
    return {
      kind: 'chips',
      reason: 'low_confidence',
      confidence: model.confidence,
    };
  }

  if (model.topic_id === 'new') {
    return {
      kind: 'lock',
      topic_id: 'new',
      teaching_mode: true,
      confidence: model.confidence,
      is_new: true,
      new_topic_title: model.new_topic_title ?? explicit?.label,
    };
  }

  const entry = findInCatalog(catalog, model.topic_id);
  if (!entry) {
    return {
      kind: 'lock',
      topic_id: model.topic_id,
      teaching_mode: true,
      confidence: model.confidence,
      is_new: true,
      new_topic_title: model.new_topic_title ?? model.topic_id,
    };
  }

  return {
    kind: 'lock',
    topic_id: entry.id,
    teaching_mode: !topicAllowedAtLevel(entry, opts.level),
    confidence: model.confidence,
  };
}

/** Stub classifier for tests. */
export function stubRouterClassifier(
  output: RouterModelOutput,
): RouterClassifier {
  return async () => output;
}
