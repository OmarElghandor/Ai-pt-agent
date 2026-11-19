import { loadSceneBank, loadSceneIndex } from './load';
import type { SceneIndex, ScenePathEntry } from './types';

export type SceneCatalogEntry = ScenePathEntry & {
  /** Egyptian place line for the entry card (`scene_eg`). */
  place_eg: string;
  /** Optional task line (`intro_eg`) — not shown on the one-button card. */
  task_eg: string;
  /** Always false — scenes never resume mid-call. */
  resume: boolean;
  finished: boolean;
  active_session_id?: string | null;
};

export type SceneCatalog = {
  target_lang: string;
  path: SceneCatalogEntry[];
  next: SceneCatalogEntry | null;
  past: SceneCatalogEntry[];
  path_finished: boolean;
};

/**
 * Path progress for role-play scenes on free-talk sessions.
 * Next = first unfinished in path order (no mid-call resume).
 */
export function buildSceneCatalog(opts: {
  finishedIds: Iterable<string>;
  /** Ignored — kept for call-site compatibility; scenes never resume. */
  activeByScene?: Record<string, { id: string }>;
  index?: SceneIndex;
}): SceneCatalog {
  const index = opts.index ?? loadSceneIndex();
  const finished = new Set(opts.finishedIds);

  const path: SceneCatalogEntry[] = index.path.map((entry) => {
    let place_eg = '';
    let task_eg = '';
    try {
      const bank = loadSceneBank(entry.id);
      place_eg = bank.scene_eg?.trim() || '';
      task_eg = bank.intro_eg?.trim() || '';
    } catch {
      // keep empty
    }
    return {
      ...entry,
      place_eg,
      task_eg,
      resume: false,
      finished: finished.has(entry.id),
      active_session_id: null,
    };
  });

  const nextFresh = path.find((s) => !s.finished);
  const next = nextFresh ?? null;
  const past = path.filter((s) => s.finished);

  return {
    target_lang: index.target_lang,
    path,
    next,
    past,
    path_finished: !nextFresh && path.length > 0,
  };
}

/** Next scene id after `sceneId` in path order (or null at the end). */
export function nextSceneIdOnPath(
  sceneId: string,
  index?: SceneIndex,
): string | null {
  const idx = index ?? loadSceneIndex();
  const i = idx.path.findIndex((p) => p.id === sceneId);
  if (i < 0 || i >= idx.path.length - 1) return null;
  return idx.path[i + 1]!.id;
}

/**
 * Next unfinished scene after `sceneId` (for «المكالمة الجاية»).
 * Falls through to any later unfinished; null when the path is done.
 */
export function nextUnfinishedSceneIdOnPath(
  sceneId: string,
  finishedIds: Iterable<string>,
  index?: SceneIndex,
): string | null {
  const idx = index ?? loadSceneIndex();
  const finished = new Set(finishedIds);
  finished.add(sceneId);
  const i = idx.path.findIndex((p) => p.id === sceneId);
  const start = i < 0 ? 0 : i + 1;
  for (let j = start; j < idx.path.length; j++) {
    const id = idx.path[j]!.id;
    if (!finished.has(id)) return id;
  }
  for (let j = 0; j < start; j++) {
    const id = idx.path[j]!.id;
    if (!finished.has(id)) return id;
  }
  return null;
}
