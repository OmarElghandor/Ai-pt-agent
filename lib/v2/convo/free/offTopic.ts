import type { FreeTopic } from '@/lib/v2/convo/topics';

/** Cheap content-word tokenizer (lowercase, accent-stripped Latin tokens). */
export function contentTokens(text: string): string[] {
  const raw = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
  return (raw.match(/[a-z0-9]+/g) ?? []).filter((w) => w.length > 2);
}

function stripAccents(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

/**
 * Off-topic when the learner message shares no content word with the
 * topic word set (+ optional extras like suggested words / angle hints).
 */
export function isOffTopic(
  learnerText: string,
  topic: FreeTopic,
  extras: string[] = [],
): boolean {
  const message = new Set(contentTokens(learnerText));
  if (message.size === 0) return false;
  const bank = new Set(
    [...topic.word_set, ...extras].flatMap((w) => contentTokens(w)),
  );
  // Also allow topic title tokens
  for (const t of contentTokens(topic.title_tl)) bank.add(t);
  for (const w of message) {
    if (bank.has(w)) return false;
    // Multi-word bank entries already tokenized; also check raw includes
    for (const b of topic.word_set) {
      if (stripAccents(b).includes(w) || w.includes(stripAccents(b).replace(/\s+/g, ''))) {
        if (stripAccents(b).split(/\s+/).some((p) => p === w)) return false;
      }
    }
  }
  return true;
}

/** English / meta asks that are not language learning (09 §9). */
const NON_LEARNING_RE =
  /\b(write\s+code|write\s+a\s+script|translate\s+this\s+email|translate\s+my\s+email|news\s+in\s+english|latest\s+news|chatgpt|homework\s+for\s+me|do\s+my\s+homework)\b/i;

export function isNonLearningRequest(text: string): boolean {
  return NON_LEARNING_RE.test(text.trim());
}

export const NON_LEARNING_COACH_EG =
  'مش هنعمل كده هنا 🙂 لو حابب نتكلم عن الموضوع بالبرتغالي، قولّي جملة بسيطة.';

/** Nearest catalogue topic: prefer related_topic_ids, else first other topic. */
export function nearestFreeTopic(
  current: FreeTopic,
  all: FreeTopic[],
  learnerText: string,
): FreeTopic {
  const tokens = new Set(contentTokens(learnerText));
  let best: FreeTopic | null = null;
  let bestScore = -1;
  for (const t of all) {
    if (t.id === current.id) continue;
    let score = 0;
    if (current.related_topic_ids.includes(t.id)) score += 5;
    for (const w of t.word_set) {
      for (const tok of contentTokens(w)) {
        if (tokens.has(tok)) score += 2;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      best = t;
    }
  }
  if (best) return best;
  const related = current.related_topic_ids
    .map((id) => all.find((t) => t.id === id))
    .find(Boolean);
  if (related) return related;
  return all.find((t) => t.id !== current.id) ?? current;
}

export function offTopicGist(text: string, max = 6): string {
  const toks = contentTokens(text).slice(0, max);
  return toks.join(' ') || 'off-topic';
}
