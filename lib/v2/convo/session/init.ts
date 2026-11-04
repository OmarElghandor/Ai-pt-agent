import type { ConvoPackData } from '@/lib/v2/convo/pack';
import { initialCurrentGroup } from './rungsFromProgress';
import type {
  ConvoOpeningBubbles,
  ConvoRung,
  ConvoSession,
} from './types';

function allItemIds(pack: ConvoPackData): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const g of pack.groups) {
    for (const id of g.item_ids) {
      if (seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}

/** Initialise rungs: every pack item starts at 📖 taught. */
export function initialRungs(pack: ConvoPackData): Record<string, ConvoRung> {
  const rungs: Record<string, ConvoRung> = {};
  for (const id of allItemIds(pack)) {
    rungs[id] = 'taught';
  }
  return rungs;
}

/**
 * Opening bubbles. Cards / coach intros only for items still at 📖 taught
 * in the active group (T6.3: finished replay → empty cards).
 */
export function buildOpeningBubbles(
  pack: ConvoPackData,
  opts?: {
    rungs?: Record<string, ConvoRung>;
    currentGroup?: number;
  },
): ConvoOpeningBubbles {
  const rungs = opts?.rungs;
  const groupIndex = Math.max(1, opts?.currentGroup ?? 1);
  const group = pack.groups[groupIndex - 1] ?? pack.groups[0];
  const rawIds = group?.item_ids ?? [];
  const card_ids = rungs
    ? rawIds.filter((id) => (rungs[id] ?? 'taught') === 'taught')
    : rawIds;
  const coach_intros = card_ids.map((item_id) => ({
    item_id,
    coach_intro_eg: pack.items[item_id]?.coach_intro_eg ?? '',
  }));
  return {
    character: {
      tl: pack.opening.tl,
      ...(pack.opening.say ? { say: pack.opening.say } : {}),
    },
    coach_intros,
    card_ids,
  };
}

export function createConvoSessionDoc(opts: {
  id: string;
  userId: string;
  pack: ConvoPackData;
  now?: Date;
  /** Seeded rungs from v2_item_state (review / replay). */
  rungs?: Record<string, ConvoRung>;
}): ConvoSession {
  const now = (opts.now ?? new Date()).toISOString();
  const rungs = opts.rungs ?? initialRungs(opts.pack);
  const current_group = opts.rungs
    ? initialCurrentGroup(opts.pack, rungs)
    : 1;
  const said_once: Record<string, boolean> = {};
  for (const [id, rung] of Object.entries(rungs)) {
    if (rung === 'said') said_once[id] = true;
  }
  return {
    id: opts.id,
    user_id: opts.userId,
    module: 'lesson',
    pack_id: opts.pack.pack_id,
    rungs,
    help_ladder: {
      question_id: null,
      step: 0,
      attempts: 0,
    },
    current_group,
    candidate_history: [],
    last_exchanges: [],
    pending_question: null,
    facts: [],
    suggested_words: [],
    status: 'open',
    phase: 'teaching',
    correct_streak: 0,
    struggled: {},
    said_once,
    coach_recent_ids: [],
    recap_done_ids: [],
    survival_used: 0,
    created_at: now,
    updated_at: now,
  };
}
