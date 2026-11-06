import type { ConvoPackData } from '@/lib/v2/convo/pack';
import type { ConvoRung, ConvoSession } from '@/lib/v2/convo/session';
import { unlockedMapSteps } from '@/lib/v2/convo/visual';
import type {
  ConvoSelectCandidate,
  ConvoSelectHelp,
  SelectConvoCandidatesResult,
} from './types';

const BEHIND: ReadonlySet<ConvoRung> = new Set(['taught', 'heard', 'understood']);
const WEAK: ReadonlySet<ConvoRung> = new Set([
  'taught',
  'heard',
  'understood',
  'assisted',
]);

type Ranked = ConvoSelectCandidate & { rank: number };

function lastAsked(history: string[], n: number): Set<string> {
  return new Set(history.slice(-n));
}

function groupIndexOf(pack: ConvoPackData, itemId: string): number {
  for (let i = 0; i < pack.groups.length; i++) {
    if (pack.groups[i].item_ids.includes(itemId)) return i + 1;
  }
  return 0;
}

function mapConsistent(
  mapStep: string | undefined,
  unlocked: Set<string> | null,
): boolean {
  if (!mapStep || !unlocked) return true;
  return unlocked.has(mapStep);
}

function buildHelp(
  pack: ConvoPackData,
  session: ConvoSession,
): ConvoSelectHelp | null {
  const { question_id, step } = session.help_ladder;
  if (!question_id || step === 0) return null;

  let itemId: string | null = null;
  let open:
    | {
        help_ladder?: {
          step1_reask_tl: string;
          step1_reask_ar?: string;
          step2_hint_eg: string;
        };
      }
    | undefined;

  for (const [id, bank] of Object.entries(pack.items)) {
    const q = bank.open_questions.find((x) => x.id === question_id);
    if (q) {
      itemId = id;
      open = q;
      break;
    }
    // Choice miss → help ladder still uses the item's first open ladder when present.
    if (bank.choice_questions.some((x) => x.id === question_id)) {
      itemId = id;
      open = bank.open_questions[0];
      break;
    }
  }
  if (!itemId) {
    itemId = session.pending_question?.item_id ?? null;
  }
  if (!itemId) return null;

  const bank = pack.items[itemId];
  const help: ConvoSelectHelp = {
    question_id,
    item_id: itemId,
    step: step as 1 | 2 | 3 | 4,
  };

  if (step === 1 && open?.help_ladder) {
    help.tl = open.help_ladder.step1_reask_tl;
    if (open.help_ladder.step1_reask_ar) {
      help.ar = open.help_ladder.step1_reask_ar;
    }
  } else if (step === 2 && open?.help_ladder) {
    help.hint_eg = open.help_ladder.step2_hint_eg;
  } else if (step === 3 && bank) {
    const choice = bank.choice_questions[0];
    if (choice) {
      help.option_ids = choice.option_ids;
      help.choice_tl = choice.tl;
      help.tl = choice.tl;
    }
  }
  // step 4: coach gives answer — no character question text here
  return help;
}

function collectEligible(
  pack: ConvoPackData,
  session: ConvoSession,
): Ranked[] {
  const recent = lastAsked(session.candidate_history, 2);
  const unlocked = unlockedMapSteps(pack, session.rungs);
  const currentGroup = session.current_group;
  const out: Ranked[] = [];

  for (const [itemId, bank] of Object.entries(pack.items)) {
    const gIdx = groupIndexOf(pack, itemId);
    if (gIdx === 0 || gIdx > currentGroup) continue;

    const rung = session.rungs[itemId] ?? 'taught';

    if (rung === 'taught' || rung === 'heard') {
      for (const q of bank.choice_questions) {
        if (recent.has(q.id)) continue;
        out.push({
          id: q.id,
          tl: q.tl,
          item_id: itemId,
          qkind: 'choice',
          rank: rankOf(itemId, rung, gIdx, currentGroup, 'choice'),
        });
      }
    } else if (rung === 'understood') {
      for (const q of bank.open_questions) {
        if (recent.has(q.id)) continue;
        if (!mapConsistent(q.map_step, unlocked)) continue;
        out.push({
          id: q.id,
          tl: q.tl,
          item_id: itemId,
          qkind: 'open',
          rank: rankOf(itemId, rung, gIdx, currentGroup, 'open'),
        });
      }
    } else if (rung === 'assisted') {
      // Recycle weak: prefer open again later; allow choice refresh rarely.
      // Spec: recycled weak items — offer open if any, else skip (already produced).
      for (const q of bank.open_questions) {
        if (recent.has(q.id)) continue;
        if (!mapConsistent(q.map_step, unlocked)) continue;
        out.push({
          id: q.id,
          tl: q.tl,
          item_id: itemId,
          qkind: 'open',
          rank: rankOf(itemId, rung, gIdx, currentGroup, 'open') + 50,
        });
      }
    } else if (rung === 'said') {
      // Review / recycle solid items as open (T6.3); lower priority than behind.
      for (const q of bank.open_questions) {
        if (recent.has(q.id)) continue;
        if (!mapConsistent(q.map_step, unlocked)) continue;
        out.push({
          id: q.id,
          tl: q.tl,
          item_id: itemId,
          qkind: 'open',
          rank: rankOf(itemId, rung, gIdx, currentGroup, 'open') + 40,
        });
      }
    }
  }

  // If nothing eligible but teaching remains, relax "last 2 turns" then map.
  if (out.length === 0) {
    for (const [itemId, bank] of Object.entries(pack.items)) {
      const gIdx = groupIndexOf(pack, itemId);
      if (gIdx === 0 || gIdx > currentGroup) continue;
      const rung = session.rungs[itemId] ?? 'taught';
      if (rung === 'taught' || rung === 'heard') {
        for (const q of bank.choice_questions) {
          out.push({
            id: q.id,
            tl: q.tl,
            item_id: itemId,
            qkind: 'choice',
            rank: rankOf(itemId, rung, gIdx, currentGroup, 'choice') + 100,
          });
        }
      } else if (
        rung === 'understood' ||
        rung === 'assisted' ||
        rung === 'said'
      ) {
        for (const q of bank.open_questions) {
          out.push({
            id: q.id,
            tl: q.tl,
            item_id: itemId,
            qkind: 'open',
            rank: rankOf(itemId, rung, gIdx, currentGroup, 'open') + 100,
          });
        }
      }
    }
  }

  out.sort((a, b) => a.rank - b.rank || a.id.localeCompare(b.id));
  return out;
}

/**
 * Ranking: current-group behind items first, then recycled weak, then others.
 * Lower rank = better.
 */
function rankOf(
  itemId: string,
  rung: ConvoRung,
  gIdx: number,
  currentGroup: number,
  qkind: 'choice' | 'open',
): number {
  void itemId;
  void qkind;
  const inCurrent = gIdx === currentGroup;
  if (inCurrent && BEHIND.has(rung)) return 0;
  if (!inCurrent && WEAK.has(rung)) return 10;
  if (inCurrent) return 20;
  return 30;
}

/** Look up a pack question by id for authored `flow` selection. */
function findFlowQuestion(
  pack: ConvoPackData,
  questionId: string,
): ConvoSelectCandidate | null {
  for (const [itemId, bank] of Object.entries(pack.items)) {
    const choice = bank.choice_questions.find((q) => q.id === questionId);
    if (choice) {
      return {
        id: choice.id,
        tl: choice.tl,
        item_id: itemId,
        qkind: 'choice',
      };
    }
    const open = bank.open_questions.find((q) => q.id === questionId);
    if (open) {
      return {
        id: open.id,
        tl: open.tl,
        item_id: open.item_id || itemId,
        qkind: 'open',
      };
    }
  }
  const recap = pack.recap.questions.find((q) => q.id === questionId);
  if (recap) {
    return {
      id: recap.id,
      tl: recap.tl,
      item_id: recap.item_id,
      qkind: 'recap',
    };
  }
  return null;
}

/**
 * Authored flow: first question id whose item still needs that rung (M3).
 * Returns a single candidate, or [] if flow is exhausted for the group.
 * null when the group has no flow (fall back to ranking).
 */
function candidatesFromFlow(
  pack: ConvoPackData,
  session: ConvoSession,
): ConvoSelectCandidate[] | null {
  const group = pack.groups[session.current_group - 1];
  if (!group?.flow?.length) return null;

  const review =
    session.phase === 'recap' ||
    Object.values(session.rungs).every(
      (r) => r === 'said' || r === 'assisted',
    );

  for (const qid of group.flow) {
    const cand = findFlowQuestion(pack, qid);
    if (!cand) continue;
    const rung = session.rungs[cand.item_id] ?? 'taught';

    if (cand.qkind === 'choice') {
      if (rung === 'taught' || rung === 'heard') return [cand];
      continue;
    }
    if (cand.qkind === 'open') {
      if (rung === 'understood') return [cand];
      // Review mode may re-open said/assisted items.
      if (review && (rung === 'said' || rung === 'assisted')) return [cand];
      continue;
    }
  }
  return [];
}

/**
 * Pick up to 3 eligible questions, or the help-ladder step after a miss (09 §4.3).
 */
export function selectConvoCandidates(input: {
  session: ConvoSession;
  pack: ConvoPackData;
}): SelectConvoCandidatesResult {
  const { session, pack } = input;

  if (session.phase === 'closing' || session.status === 'done') {
    return { kind: 'closing', candidates: [] };
  }

  if (session.help_ladder.step > 0 && session.help_ladder.question_id) {
    const help = buildHelp(pack, session);
    return {
      kind: 'help',
      candidates: [],
      ...(help ? { help } : {}),
    };
  }

  if (session.phase === 'recap') {
    const recent = lastAsked(session.candidate_history, 2);
    const done = new Set(session.recap_done_ids);
    const candidates: ConvoSelectCandidate[] = pack.recap.questions
      .filter((q) => !done.has(q.id) && !recent.has(q.id))
      .slice(0, 3)
      .map((q) => ({
        id: q.id,
        tl: q.tl,
        item_id: q.item_id,
        qkind: 'recap' as const,
      }));
    // Never empty while recap remains: drop recent filter if needed.
    if (candidates.length === 0) {
      const fallback = pack.recap.questions
        .filter((q) => !done.has(q.id))
        .slice(0, 3)
        .map((q) => ({
          id: q.id,
          tl: q.tl,
          item_id: q.item_id,
          qkind: 'recap' as const,
        }));
      if (fallback.length === 0) {
        return { kind: 'closing', candidates: [] };
      }
      return { kind: 'recap', candidates: fallback };
    }
    return { kind: 'recap', candidates };
  }

  // M3: authored flow wins over ranking / model choice.
  const fromFlow = candidatesFromFlow(pack, session);
  if (fromFlow) {
    if (fromFlow.length === 0) {
      return { kind: 'empty', candidates: [] };
    }
    return { kind: 'candidates', candidates: fromFlow };
  }

  const ranked = collectEligible(pack, session);
  const top = ranked.slice(0, 3).map(({ rank: _r, ...c }) => c);

  if (top.length === 0) {
    // All produced but phase not yet recap — still teaching leftovers
    const anyBehind = pack.groups
      .flatMap((g) => g.item_ids)
      .some((id) => {
        const r = session.rungs[id] ?? 'taught';
        return r !== 'said' && r !== 'assisted';
      });
    if (!anyBehind) {
      return { kind: 'empty', candidates: [] };
    }
    return { kind: 'empty', candidates: [] };
  }

  return { kind: 'candidates', candidates: top };
}
