import { connectMongo, mongoConfigured } from '@/lib/mongo';
import { V2TopicRequestModel } from '@/lib/v2/mongo/models';
import { loadTopicsFile } from '@/lib/v2/convo/topics';
import { normalizeAr } from './normalizeAr';

/**
 * Matched against normalizeAr(text): hamza/diacritics already folded,
 * so أتعلم and اعلم both become اتعلم / اعلم forms listed here.
 */
const TOPIC_REQUEST_RE =
  /(عايزه?|عاوزه?|محتاج(ه)?|نفسي)\s*(اتعلم|اعلم|افهم|اعرف)|اريد\s*ان\s*اتعلم|عايزه?\s*اتكلم\s*عن|هتعلمني|علمني|فهمني/;

/** «إزاي أقول» + a catalogue topic/theme title (not word aliases like شمال). */
const EZAY_AQOOL_RE = /ازاي\s*اقول|كيف\s*اقول/;

function matchesTopicTitleNoun(text: string): boolean {
  const file = loadTopicsFile();
  const norm = normalizeAr(text);
  for (const theme of file.themes) {
    for (const topic of theme.topics) {
      const ar = normalizeAr(topic.title_ar);
      if (ar && norm.includes(ar)) return true;
      const tl = topic.title_tl.toLowerCase();
      if (tl && text.toLowerCase().includes(tl)) return true;
    }
    const themeAr = normalizeAr(theme.title_ar);
    if (themeAr && norm.includes(themeAr)) return true;
  }
  return false;
}

export function isTopicRequestText(text: string): boolean {
  const raw = text.trim();
  if (!raw) return false;
  const norm = normalizeAr(raw);
  if (TOPIC_REQUEST_RE.test(norm)) return true;
  if (EZAY_AQOOL_RE.test(norm) && matchesTopicTitleNoun(raw)) return true;
  return false;
}

export async function logUnmatchedTopicRequest(opts: {
  userId: string;
  queryEg: string;
  sessionId?: string;
}): Promise<void> {
  if (!mongoConfigured()) return;
  await connectMongo();
  await V2TopicRequestModel().create({
    user_id: opts.userId,
    query_eg: opts.queryEg,
    session_id: opts.sessionId,
    created_at: new Date(),
  });
}

/** In-memory log for tests (no Mongo). */
const memoryRequests: Array<{ user_id: string; query_eg: string }> = [];

export function logUnmatchedTopicRequestSync(opts: {
  userId: string;
  queryEg: string;
}): void {
  memoryRequests.push({
    user_id: opts.userId,
    query_eg: opts.queryEg,
  });
}

export function drainMemoryTopicRequests(): Array<{
  user_id: string;
  query_eg: string;
}> {
  return memoryRequests.splice(0, memoryRequests.length);
}
