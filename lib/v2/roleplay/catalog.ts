import { loadRoleplayIndex, loadRoleplaySituation } from './load';
import type { RoleplayIndex, RoleplayPathEntry } from './types';

export type RoleplayCatalogScene = RoleplayPathEntry & {
  place_eg: string;
  task_eg: string;
  /** Unfinished active session exists. */
  resume: boolean;
  /** At least one done session. */
  finished: boolean;
  active_session_id?: string | null;
};

export type RoleplayCatalog = {
  target_lang: string;
  path: RoleplayCatalogScene[];
  /** First unfinished scene in path order, or null when the path is done. */
  next: RoleplayCatalogScene | null;
  /** Finished scenes (for «المكالمات اللي فاتت»). */
  past: RoleplayCatalogScene[];
  /** All path scenes finished. */
  path_finished: boolean;
};

export function buildRoleplayCatalog(opts: {
  finishedIds: Iterable<string>;
  activeSituationIds?: Iterable<string>;
  activeBySituation?: Record<string, { id: string }>;
  index?: RoleplayIndex;
}): RoleplayCatalog {
  const index = opts.index ?? loadRoleplayIndex();
  const finished = new Set(opts.finishedIds);
  const activeIds = new Set(opts.activeSituationIds ?? []);
  const activeBy = opts.activeBySituation ?? {};
  for (const id of Object.keys(activeBy)) activeIds.add(id);

  const path: RoleplayCatalogScene[] = index.path.map((entry) => {
    let place_eg = '';
    let task_eg = '';
    try {
      const sit = loadRoleplaySituation(entry.id);
      place_eg = sit.place_eg;
      task_eg = sit.task_eg;
    } catch {
      // Content missing — keep empty place/task.
    }
    return {
      ...entry,
      place_eg,
      task_eg,
      resume: activeIds.has(entry.id),
      finished: finished.has(entry.id),
      active_session_id: activeBy[entry.id]?.id ?? null,
    };
  });

  // Prefer an in-progress resume; else first not finished.
  const nextActive = path.find((s) => s.resume);
  const nextFresh = path.find((s) => !s.finished);
  const next = nextActive ?? nextFresh ?? null;

  const past = path.filter((s) => s.finished);
  return {
    target_lang: index.target_lang,
    path,
    next,
    past,
    path_finished: !nextFresh && path.length > 0,
  };
}

/** Next scene after `situationId` in path order (or null at the end). */
export function nextSituationIdOnPath(
  situationId: string,
  index?: RoleplayIndex,
): string | null {
  const idx = index ?? loadRoleplayIndex();
  const i = idx.path.findIndex((p) => p.id === situationId);
  if (i < 0 || i >= idx.path.length - 1) return null;
  return idx.path[i + 1]!.id;
}
