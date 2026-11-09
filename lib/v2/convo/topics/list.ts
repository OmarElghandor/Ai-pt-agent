import { connectMongo, mongoConfigured } from '@/lib/mongo';
import { getCharacter } from '@/lib/v2/characters/registry';
import { V2ItemStateModel } from '@/lib/v2/mongo/models';
import { learnerCurrentDay } from '@/lib/v2/progress/learnerDay';
import type { ItemState } from '@/lib/v2/progress/types';
import { loadWeakItemIds } from '@/lib/v2/progress/weakItems';
import { convoPackExistsAsync } from '@/lib/v2/convo/pack';
import {
  getDaysReadiness,
  type DayReadiness,
} from '@/lib/v2/generation/prepare';
import { convoPackFileExists, loadTopicsFile } from './load';
import { isRolePlayDay } from './rolePlay';
import { statusGlyph, topicStatus } from './status';
import type {
  ThemeWithTopics,
  TopicReadyChip,
  TopicRow,
  TopicsFile,
  TopicsListResult,
} from './types';

export function readyChipFromReadiness(
  readiness: DayReadiness | undefined,
  packAvailable: boolean,
): TopicReadyChip {
  if (packAvailable && readiness?.ready) return null;
  if (packAvailable && !readiness) return null;
  if (readiness?.ready) return null;
  if (
    readiness?.lesson === 'generating' ||
    readiness?.pack === 'generating' ||
    readiness?.job_id
  ) {
    return 'preparing';
  }
  if (packAvailable) return null;
  return 'soon';
}

function docToState(doc: Record<string, unknown>): ItemState {
  const card = (doc.card ?? {}) as Record<string, unknown>;
  const levels = (doc.levels ?? {}) as Record<string, number>;
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
    skills: (doc.skills as ItemState['skills']) ?? {},
    card: {
      interval: Number(card.interval ?? 0),
      dueAt: card.dueAt
        ? new Date(card.dueAt as string | Date).toISOString()
        : null,
      masteryLevel:
        card.masteryLevel === 'mastered' ? 'mastered' : 'learning',
      consecutiveCorrect: Number(card.consecutiveCorrect ?? 0),
      face: String(card.face ?? 'recognize'),
      knowCheckDueAt: card.knowCheckDueAt
        ? new Date(card.knowCheckDueAt as string | Date).toISOString()
        : null,
    },
    lastImplicitReviewLocalDate:
      (doc.lastImplicitReviewLocalDate as string | null) ?? null,
    weakToolIds: Array.isArray(doc.weakToolIds)
      ? (doc.weakToolIds as string[])
      : [],
    opt_in_card: Boolean(doc.opt_in_card),
  };
}

async function loadStatesById(
  userId: string,
): Promise<Map<string, ItemState>> {
  const map = new Map<string, ItemState>();
  if (!mongoConfigured()) return map;
  await connectMongo();
  const docs = await V2ItemStateModel().find({ user_id: userId }).lean();
  for (const doc of docs) {
    const state = docToState(doc as Record<string, unknown>);
    map.set(state.item_id, state);
  }
  return map;
}

/** Pure builder used by tests and the Mongo-backed list. */
export function buildTopicsList(opts: {
  file: TopicsFile;
  currentDay: number;
  statesById: ReadonlyMap<string, ItemState>;
  weakIds: ReadonlySet<string>;
  now?: Date;
  packAvailable?: (packId: string) => boolean;
  readinessByDay?: ReadonlyMap<number, DayReadiness>;
}): TopicsListResult {
  const now = opts.now ?? new Date();
  const packAvailable = opts.packAvailable ?? convoPackFileExists;
  const themes: ThemeWithTopics[] = [];
  let suggestion: TopicRow | null = null;

  for (const theme of opts.file.themes) {
    // v3: role-play list = task days only (day 33 for now).
    const rolePlayTopics = theme.topics.filter((t) => isRolePlayDay(t.day));
    if (!rolePlayTopics.length) continue;
    const topics: TopicRow[] = rolePlayTopics.map((t) => {
      const pack_available = packAvailable(t.pack_id);
      // Role-play catalog: always unlocked; missing packs generate on first open.
      const unlocked = true;
      void opts.currentDay;
      const status = topicStatus(
        t.item_ids,
        opts.statesById,
        opts.weakIds,
        now,
      );
      const character_name = t.character_id
        ? (getCharacter(t.character_id)?.name ?? undefined)
        : undefined;
      const ready_chip = readyChipFromReadiness(
        opts.readinessByDay?.get(t.day),
        pack_available,
      );
      const row: TopicRow = {
        ...t,
        unlocked,
        pack_available,
        status,
        status_glyph: statusGlyph(status),
        ...(character_name ? { character_name } : {}),
        ...(ready_chip ? { ready_chip } : {}),
      };
      if (!suggestion && status === 'needs_review') {
        suggestion = row;
      }
      return row;
    });
    themes.push({
      id: theme.id,
      title_tl: theme.title_tl,
      title_ar: theme.title_ar,
      topics,
    });
  }

  return {
    target_lang: opts.file.target_lang,
    themes,
    suggestion,
  };
}

export async function listTopicsForUser(
  userId: string,
  opts?: { currentDay?: number; now?: Date },
): Promise<TopicsListResult> {
  const file = loadTopicsFile();
  const currentDay =
    opts?.currentDay ?? (await learnerCurrentDay(userId));
  const [statesById, weakIds] = await Promise.all([
    loadStatesById(userId),
    loadWeakItemIds(userId),
  ]);

  const packIds = [
    ...new Set(
      file.themes.flatMap((th) => th.topics.map((t) => t.pack_id)),
    ),
  ];
  const days = [
    ...new Set(file.themes.flatMap((th) => th.topics.map((t) => t.day))),
  ];
  const available = new Set<string>();
  const [readinessList] = await Promise.all([
    getDaysReadiness(days, file.target_lang || 'pt-PT'),
    Promise.all(
      packIds.map(async (id) => {
        if (await convoPackExistsAsync(id)) available.add(id);
      }),
    ),
  ]);
  const readinessByDay = new Map(
    readinessList.map((r) => [r.day, r] as const),
  );

  return buildTopicsList({
    file,
    currentDay,
    statesById,
    weakIds,
    now: opts?.now,
    packAvailable: (id) => available.has(id),
    readinessByDay,
  });
}
