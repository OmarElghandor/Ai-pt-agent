import {
  V2ActivityDayModel,
  V2CardDeckModel,
  V2ConvoSessionModel,
  V2ItemStateModel,
  V2LessonProgressModel,
} from '@/lib/v2/mongo/models';
import type { V2User } from '@/lib/v2/auth/types';
import { normalizeStreak } from '@/lib/v2/auth/types';
import { countHomeNumbers } from '@/lib/v2/progress/levels';
import { listOpenWeakSpots } from '@/lib/v2/progress/weak/list';
import {
  mergeLearnerPath,
  resolveLearnerCurrentDay,
} from '@/lib/v2/progress/learnerPath';
import { buildPathPayload } from '@/lib/v2/path';
import { userLocalDate } from '@/lib/v2/progress/userLocalDate';
import {
  graceDaysLeft,
  streakGraceLine,
} from '@/lib/v2/progress/streak/compute';
import type { ItemState } from '@/lib/v2/progress/types';

export type MeSummary = {
  name: string;
  gender: string | null;
  onboarded: boolean;
  target_lang: string;
  current_day: number | null;
  current_day_title_ar: string | null;
  current_day_title_tl: string | null;
  bakra: boolean;
  completed_days: number;
  streak: {
    current: number;
    best: number;
    today_counts: boolean;
    grace_left: number;
    grace_line: string | null;
  };
  levels: { understood: number; said: number };
  deck: { left: number; total: number; done: boolean };
  weak_spots: Array<{
    problem: string;
    title_ar: string;
    example: { wrong: string; right: string } | null;
  }>;
  last_conversation: { label: string; at: string | null } | null;
  suggestion: { kind: 'topic' | 'problem' | 'deck' | 'convo'; text: string } | null;
};

const cache = new Map<string, { at: number; value: MeSummary }>();
const CACHE_MS = 60_000;

export function invalidateMeSummary(userId: string): void {
  cache.delete(userId);
}

function docToState(doc: Record<string, unknown>): ItemState {
  const levels = (doc.levels ?? {}) as Record<string, number>;
  const card = (doc.card ?? {}) as Record<string, unknown>;
  return {
    user_id: String(doc.user_id),
    item_id: String(doc.item_id),
    target_lang: String(doc.target_lang ?? 'pt-PT'),
    introducedDay: Number(doc.introducedDay ?? 1),
    usedCorrectlyIn: Array.isArray(doc.usedCorrectlyIn)
      ? (doc.usedCorrectlyIn as string[])
      : [],
    levels: {
      heard: levels.heard ?? 0,
      understood: levels.understood ?? 0,
      said: levels.said ?? 0,
      used: levels.used ?? 0,
    },
    skills: {},
    card: {
      interval: Number(card.interval ?? 0),
      dueAt: null,
      masteryLevel: card.masteryLevel === 'mastered' ? 'mastered' : 'learning',
      consecutiveCorrect: 0,
      face: 'recognize',
      knowCheckDueAt: null,
    },
    lastImplicitReviewLocalDate: null,
    weakToolIds: [],
  };
}

export async function buildMeSummary(user: V2User): Promise<MeSummary> {
  const hit = cache.get(user.id);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;

  const today = userLocalDate(user.timezone);
  const streak = normalizeStreak(user.streak);

  const [
    pathBase,
    completedCount,
    itemDocs,
    deck,
    activity,
    spots,
    lastConvo,
  ] = await Promise.all([
    buildPathPayload(),
    V2LessonProgressModel().countDocuments({
      user_id: user.id,
      status: 'completed',
    }),
    V2ItemStateModel().find({ user_id: user.id }).lean(),
    V2CardDeckModel().findOne({ user_id: user.id, local_date: today }).lean(),
    V2ActivityDayModel()
      .findOne({ user_id: user.id, local_date: today })
      .lean(),
    listOpenWeakSpots(user.id, { limit: 3, includeImproving: true }),
    V2ConvoSessionModel()
      .findOne({ user_id: user.id })
      .sort({ updatedAt: -1 })
      .select({ module: 1, pack_id: 1, updatedAt: 1 })
      .lean(),
  ]);

  const learnerDays = await mergeLearnerPath({
    userId: user.id,
    timezone: user.timezone,
    days: pathBase.days,
  });
  const currentDay = resolveLearnerCurrentDay(learnerDays);
  const currentRow = learnerDays.find((d) => d.day === currentDay) ?? null;
  const bakra = Boolean(currentRow?.bakra);

  const levels = countHomeNumbers(itemDocs.map((d) => docToState(d as unknown as Record<string, unknown>)));

  const deckCards = deck?.cards ?? [];
  const rated = deckCards.filter((c) => c.rating).length;
  const deckDone = deck?.status === 'done' || (deckCards.length > 0 && rated >= deckCards.length);

  let suggestion: MeSummary['suggestion'] = null;
  if (bakra && !activity?.counts_for_streak) {
    suggestion = {
      kind: 'deck',
      text: 'النهارده بكرة على الدرس — الكروت أو نواقصك بتكمل السلسلة',
    };
  } else if (spots[0]) {
    suggestion = {
      kind: 'problem',
      text: `${spots[0].title_ar} لسه بيلخبطوك، ٥ دقايق؟`,
    };
  } else {
    suggestion = {
      kind: 'topic',
      text: 'موضوع أصفر يستاهل تمرين سريع',
    };
  }

  const summary: MeSummary = {
    name: user.name,
    gender: user.gender,
    onboarded: Boolean(user.onboarded_at),
    target_lang: 'pt-PT',
    current_day: currentDay,
    current_day_title_ar: currentRow?.title_ar ?? null,
    current_day_title_tl: currentRow?.title_tl ?? null,
    bakra,
    completed_days: completedCount,
    streak: {
      current: streak.current,
      best: streak.best,
      today_counts: Boolean(activity?.counts_for_streak),
      grace_left: graceDaysLeft(streak),
      grace_line: streakGraceLine(streak),
    },
    levels: {
      understood: levels.understands,
      said: levels.says,
    },
    deck: {
      left: Math.max(0, deckCards.length - rated),
      total: deckCards.length,
      done: deckDone,
    },
    weak_spots: spots.map((s) => ({
      problem: s.problem,
      title_ar: s.title_ar,
      example: s.example,
    })),
    last_conversation: lastConvo
      ? {
          label: String(
            (lastConvo as { pack_id?: string }).pack_id ??
              (lastConvo as { module?: string }).module ??
              'محادثة',
          ),
          at: lastConvo.updatedAt
            ? new Date(lastConvo.updatedAt as Date).toISOString()
            : null,
        }
      : null,
    suggestion,
  };

  cache.set(user.id, { at: Date.now(), value: summary });
  return summary;
}
