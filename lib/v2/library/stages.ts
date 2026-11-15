import {
  LIBRARY_STAGES,
  type EpisodeStages,
  type LibraryStage,
  type StageState,
} from './types';

/** Fresh episode: brief is a draft, everything else not started. */
export function defaultStages(now: Date = new Date()): EpisodeStages {
  return {
    brief: { status: 'draft', stale: false, updated_at: now },
    script: { status: 'none', stale: false, updated_at: now },
    tokens: { status: 'none', stale: false, updated_at: now },
    review: { status: 'open', stale: false, updated_at: now },
    voices: { status: 'missing', stale: false, updated_at: now },
    audio: { status: 'none', stale: false, updated_at: now },
    images: { status: 'none', stale: false, updated_at: now },
    publish: { status: 'draft', stale: false, updated_at: now },
  };
}

/** Stages that depend on `from` (everything after it, except images and publish rules below). */
export function stagesAfter(from: LibraryStage): LibraryStage[] {
  const i = LIBRARY_STAGES.indexOf(from);
  return LIBRARY_STAGES.slice(i + 1).filter(
    // Images and publish are never invalidated by text changes (14d §1).
    (s) => s !== 'images' && s !== 'publish',
  );
}

/** A stage only counts as stale if it already has output worth rebuilding. */
function hasOutput(stage: LibraryStage, state: StageState): boolean {
  switch (stage) {
    case 'script':
    case 'tokens':
      return state.status === 'ready' || state.status === 'failed';
    case 'review':
      return state.status === 'approved';
    case 'voices':
      return state.status === 'ok';
    case 'audio':
      return state.status !== 'none';
    default:
      return false;
  }
}

/**
 * Pure: mark every later stage that already has output as stale.
 * Output is kept; only the flag and a calm reason are set.
 */
export function markStale(
  stages: EpisodeStages,
  from: LibraryStage,
  reason: string,
  now: Date = new Date(),
): EpisodeStages {
  const next = { ...stages } as EpisodeStages;
  for (const s of stagesAfter(from)) {
    const cur = stages[s] as StageState;
    if (!hasOutput(s, cur)) continue;
    (next as Record<LibraryStage, StageState>)[s] = {
      ...cur,
      stale: true,
      stale_reason: reason,
      updated_at: now,
    };
  }
  return next;
}

/** Pure: clear the stale flag after a stage is rebuilt. */
export function clearStale(
  stages: EpisodeStages,
  stage: LibraryStage,
  now: Date = new Date(),
): EpisodeStages {
  const cur = stages[stage] as StageState;
  return {
    ...stages,
    [stage]: { ...cur, stale: false, stale_reason: undefined, updated_at: now },
  } as EpisodeStages;
}

export function staleStages(stages: EpisodeStages): LibraryStage[] {
  return LIBRARY_STAGES.filter((s) => stages[s]?.stale);
}
