import type { ConvoSession } from '@/lib/v2/convo/session/types';
import type { ConvoTurnStreamEvent } from '@/lib/v2/convo/turn/types';
import { pickGoalAskLines } from '@/lib/v2/convo/prompt/buildGoalFree';
import type { ConvoGoal } from './types';
import { recastFromExample } from './recast';

export type TeachBeat = {
  character_tl: string;
  character_ar: string;
  coach_eg: string;
  ask_tl: string;
  ask_ar: string;
};

export type LearnerGender = 'm' | 'f';

/**
 * Authored teaching beat for a goal (v4).
 * Character teach line → coach meaning → ask_tl. Model never invents teach.
 * Female learner uses teach.tl_f / teach.ar_f and ask_tl_f / ask_ar_f when set.
 */
export function teachBeatForGoal(
  goal: ConvoGoal,
  gender: LearnerGender = 'm',
): TeachBeat | null {
  const teach = goal.teach;
  if (!teach?.tl?.trim() || !teach.meaning_eg?.trim()) return null;
  const useF = gender === 'f';
  const character_tl = (
    useF && teach.tl_f?.trim() ? teach.tl_f : teach.tl
  ).trim();
  const character_ar = (
    useF && teach.ar_f?.trim() ? teach.ar_f : teach.ar ?? ''
  ).trim();
  const ask = pickGoalAskLines(goal, gender);
  if (!ask?.tl) return null;
  return {
    character_tl,
    character_ar,
    coach_eg: teach.meaning_eg.trim(),
    ask_tl: ask.tl,
    ask_ar: ask.ar,
  };
}

export function goalNeedsTeach(
  goal: ConvoGoal,
  teachingMode: boolean,
  gender: LearnerGender = 'm',
): boolean {
  return teachingMode && teachBeatForGoal(goal, gender) != null;
}

/** True when this goal's teach beat has not been shown yet. */
export function shouldShowTeachForGoal(
  session: Pick<ConvoSession, 'teaching_mode' | 'teach_shown_for' | 'current_goal'>,
  goal: ConvoGoal | null | undefined,
  gender: LearnerGender = 'm',
): boolean {
  if (!session.teaching_mode || !goal) return false;
  if (session.teach_shown_for === goal.id) return false;
  return teachBeatForGoal(goal, gender) != null;
}

export type EmitTeachSequenceOpts = {
  goal: ConvoGoal;
  session: ConvoSession;
  emit: (e: ConvoTurnStreamEvent) => void;
  /** Bank intro_eg — coach bubble before teach (lock only). */
  introEg?: string | null;
  gender?: LearnerGender;
  /**
   * Optional code-only recast from the just-completed goal's examples_tl[0].
   * Emitted as its own character bubble before teach+ask.
   */
  recastTl?: string | null;
};

/**
 * Emit intro (optional) → optional recast → one character bubble (teach.tl + ask_tl)
 * with AR always shown and meaning_eg as coach_eg on the same bubble.
 * Sets teach_shown_for; does not bump turns_on_goal.
 */
export function emitTeachSequence(opts: EmitTeachSequenceOpts): boolean {
  const gender = opts.gender ?? 'm';
  const beat = teachBeatForGoal(opts.goal, gender);
  if (!beat) return false;

  const intro = opts.introEg?.trim();
  if (intro) {
    opts.emit({
      type: 'coach',
      id: `intro:${opts.session.topic_id ?? opts.goal.id}`,
      eg: intro,
      moment: 'intro',
    });
  }

  const recast = opts.recastTl?.trim();
  if (recast) {
    opts.emit({
      type: 'bubble_ar',
      ar: '',
      pt: recast,
    });
  }

  const mergedPt = `${beat.character_tl} ${beat.ask_tl}`.trim();
  const mergedAr = [beat.character_ar, beat.ask_ar]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(' ');

  opts.emit({
    type: 'bubble_ar',
    ar: mergedAr,
    pt: mergedPt,
    coach_eg: beat.coach_eg,
    teach_goal_id: opts.goal.id,
  });
  // Keep a question event for pending_question / frame wiring (no second bubble:
  // client merges when pt is already on the teach bubble).
  opts.emit({
    type: 'question',
    id: opts.goal.id,
    tl: beat.ask_tl,
    ar: beat.ask_ar || undefined,
    kind: 'open',
    item_id: opts.goal.id,
    audio_key: `free:${opts.session.id}:${opts.goal.id}`,
  });

  opts.session.teach_shown_for = opts.goal.id;
  opts.session.pending_question = {
    id: opts.goal.id,
    kind: 'open',
    item_id: opts.goal.id,
  };
  opts.session.last_exchanges = [
    ...opts.session.last_exchanges,
    {
      role: 'character' as const,
      tl: mergedPt,
    },
  ].slice(-6);

  return true;
}

/** Emit authored ask only (non-teaching lock, or re-ask). */
export function emitAuthoredAsk(opts: {
  goal: ConvoGoal;
  session: ConvoSession;
  emit: (e: ConvoTurnStreamEvent) => void;
  introEg?: string | null;
  gender?: LearnerGender;
}): boolean {
  const ask = pickGoalAskLines(opts.goal, opts.gender ?? 'm');
  if (!ask?.tl) return false;

  const intro = opts.introEg?.trim();
  if (intro) {
    opts.emit({
      type: 'coach',
      id: `intro:${opts.session.topic_id ?? opts.goal.id}`,
      eg: intro,
      moment: 'intro',
    });
  }

  opts.emit({
    type: 'question',
    id: opts.goal.id,
    tl: ask.tl,
    ar: ask.ar || undefined,
    kind: 'open',
    item_id: opts.goal.id,
    audio_key: `free:${opts.session.id}:${opts.goal.id}`,
  });
  opts.session.pending_question = {
    id: opts.goal.id,
    kind: 'open',
    item_id: opts.goal.id,
  };
  opts.session.last_exchanges = [
    ...opts.session.last_exchanges,
    { role: 'character' as const, tl: ask.tl },
  ].slice(-6);
  return true;
}

/** Emit a standalone code-only recast bubble (no teach). */
export function emitCodeRecast(opts: {
  exampleTl: string | undefined | null;
  emit: (e: ConvoTurnStreamEvent) => void;
  session: ConvoSession;
}): string | null {
  const tl = recastFromExample(opts.exampleTl);
  if (!tl) return null;
  opts.emit({ type: 'bubble_ar', ar: '', pt: tl });
  opts.session.last_exchanges = [
    ...opts.session.last_exchanges,
    { role: 'character' as const, tl },
  ].slice(-6);
  return tl;
}
