import { connectMongo, mongoConfigured } from '@/lib/mongo';
import { V2TopicRequestModel } from '@/lib/v2/mongo/models';
import {
  loadTopicsFile,
  type TopicsFileTopic,
} from '@/lib/v2/convo/topics';
import { talkHrefForTopic } from '@/lib/v2/convo/topics/suggestion';

const TOPIC_REQUEST_RE =
  /عايز(ة)?\s*أتعلم|عاوز(ة)?\s*أتعلم|أريد\s*أن\s*أتعلم|عايز\s*أتكلم\s*عن|هتعلّمني|هتعلمني/;

export function isTopicRequestText(text: string): boolean {
  return TOPIC_REQUEST_RE.test(text.trim());
}

function normalizeAr(s: string): string {
  return s
    .replace(/[إأآا]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[\u064B-\u065F]/g, '')
    .toLowerCase();
}

/**
 * Match an Arabic learning request against Module B topics (title_ar / title_tl).
 */
export function matchTopicRequest(
  text: string,
): TopicsFileTopic | null {
  const file = loadTopicsFile();
  const norm = normalizeAr(text);
  for (const theme of file.themes) {
    for (const topic of theme.topics) {
      const ar = normalizeAr(topic.title_ar);
      const themeAr = normalizeAr(theme.title_ar);
      if (ar && norm.includes(ar)) return topic;
      if (themeAr && norm.includes(themeAr)) return topic;
      const tl = topic.title_tl.toLowerCase();
      if (tl && text.toLowerCase().includes(tl)) return topic;
    }
    // Theme-level keywords (e.g. الاتجاهات)
    const themeAr = normalizeAr(theme.title_ar);
    if (themeAr && norm.includes(themeAr) && theme.topics[0]) {
      return theme.topics[0];
    }
  }
  // Common aliases
  if (/اتجاه|يمين|شمال|direc/i.test(text)) {
    for (const theme of file.themes) {
      const hit = theme.topics.find((t) => t.id.includes('directions'));
      if (hit) return hit;
    }
  }
  return null;
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

export function topicRequestCoachEg(matched: TopicsFileTopic | null): {
  eg: string;
  href: string | null;
} {
  if (matched) {
    return {
      eg: `تمام — افتح محادثة ${matched.title_ar}`,
      href: talkHrefForTopic(matched),
    };
  }
  return {
    eg: 'الموضوع ده لسه جاي قريب، هسجّله 🙂',
    href: null,
  };
}
