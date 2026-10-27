import type { Page, Step } from '@/lib/v2/content/page';
import { decideCriticRerun, mergeCriticMeta } from './criticFilter';
import type { CriticIssue } from './jobs/runCritic';

/** Meta key for per-block critic regen: `${pageIndex}:${blockKey}`. */
export function criticBlockMetaKey(pageIndex: number, blockKey: string): string {
  return `${pageIndex}:${blockKey}`;
}

/**
 * Resolve a critic issue path/message to a block key (prefer block.id).
 * Returns null when no block can be identified → no regen.
 */
export function parseBlockKeyFromIssue(
  path: string | undefined,
  message: string,
  page: Page,
): string | null {
  const hay = `${path ?? ''} ${message}`;
  const bi = hay.match(/blocks\[(\d+)\]/i);
  if (bi) {
    const idx = Number(bi[1]);
    const block = page.blocks[idx];
    if (!block) return null;
    return block.id || `blocks[${idx}]`;
  }
  const bn = hay.match(/\bb(\d+)\b/i);
  if (bn) {
    const n = Number(bn[1]);
    const byId = page.blocks.find(
      (b) => b.id === `b${n}` || b.id.toLowerCase() === `b${n}`,
    );
    if (byId) return byId.id;
    const block = page.blocks[n];
    if (block) return block.id || `blocks[${n}]`;
  }
  return null;
}

export function blockIndexForKey(page: Page, blockKey: string): number {
  const byId = page.blocks.findIndex((b) => b.id === blockKey);
  if (byId >= 0) return byId;
  const m = blockKey.match(/^blocks\[(\d+)\]$/i);
  if (m) return Number(m[1]);
  return -1;
}

export function stepTouchesBlock(
  target: string | undefined,
  blockKey: string,
  blockIndex: number,
): boolean {
  if (!target) return false;
  const t = target.trim();
  if (new RegExp(`^${escapeRe(blockKey)}(?:/|$)`, 'i').test(t)) return true;
  if (blockIndex >= 0 && new RegExp(`^b${blockIndex}(?:/|$)`, 'i').test(t)) {
    return true;
  }
  return false;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export type BlockRerunPlan = {
  /** Block keys to regenerate this pass. */
  targets: string[];
  /** Notes keyed by block key. */
  notesByBlock: Record<string, string[]>;
  /** Updated critic_notes / critic_regen maps. */
  meta: {
    critic_notes: Record<string, string[]>;
    critic_regen: Record<string, number>;
  };
  /** High issues with no resolvable block → warnings only. */
  unresolvedHighs: CriticIssue[];
};

/**
 * Decide which blocks on a page get one-shot regen from critic highs.
 */
export function planBlockCriticRerun(opts: {
  pageIndex: number;
  page: Page;
  highs: CriticIssue[];
  critic_notes?: Record<string, string[]>;
  critic_regen?: Record<string, number>;
}): BlockRerunPlan {
  const notesByBlock: Record<string, string[]> = {};
  const unresolvedHighs: CriticIssue[] = [];

  for (const h of opts.highs) {
    const key = parseBlockKeyFromIssue(h.path, h.message, opts.page);
    if (!key) {
      unresolvedHighs.push(h);
      continue;
    }
    if (!notesByBlock[key]) notesByBlock[key] = [];
    notesByBlock[key]!.push(h.message);
  }

  let meta = {
    critic_notes: { ...(opts.critic_notes ?? {}) },
    critic_regen: { ...(opts.critic_regen ?? {}) },
  };
  const targets: string[] = [];

  for (const [blockKey, notes] of Object.entries(notesByBlock)) {
    const metaKey = criticBlockMetaKey(opts.pageIndex, blockKey);
    const regenCount = meta.critic_regen[metaKey] ?? 0;
    const decision = decideCriticRerun({
      highCount: notes.length,
      regenCount,
    });
    const merged = mergeCriticMeta(meta, metaKey, {
      notes,
      regen: decision.requeue ? decision.nextRegen : undefined,
    });
    meta = merged;
    if (decision.requeue) targets.push(blockKey);
  }

  return { targets, notesByBlock, meta, unresolvedHighs };
}

/** Merge regenerated blocks + steps into an existing page; leave siblings untouched. */
export function mergeBlockRegen(
  existing: Page,
  partial: { blocks: Page['blocks']; steps?: Step[] },
  targetKeys: string[],
): Page {
  const targetSet = new Set(targetKeys);
  const targetIndexes = new Set(
    targetKeys
      .map((k) => blockIndexForKey(existing, k))
      .filter((i) => i >= 0),
  );

  const incomingById = new Map(partial.blocks.map((b) => [b.id, b]));
  const incomingByIndex = new Map(
    partial.blocks.map((b, i) => {
      const idx = blockIndexForKey(existing, b.id);
      return [idx >= 0 ? idx : i, b] as const;
    }),
  );

  const blocks = existing.blocks.map((block, i) => {
    const key = block.id || `blocks[${i}]`;
    if (!targetSet.has(key) && !targetSet.has(block.id) && !targetIndexes.has(i)) {
      return block;
    }
    return (
      incomingById.get(block.id) ??
      incomingByIndex.get(i) ??
      block
    );
  });

  let steps = existing.steps;
  if (partial.steps && existing.steps) {
    const kept = existing.steps.filter(
      (s) =>
        !targetKeys.some((k) =>
          stepTouchesBlock(
            s.target,
            k,
            blockIndexForKey(existing, k),
          ),
        ),
    );
    const incoming = partial.steps.filter((s) =>
      targetKeys.some((k) =>
        stepTouchesBlock(s.target, k, blockIndexForKey(existing, k)),
      ),
    );
    steps = [...kept, ...incoming];
  } else if (partial.steps && !existing.steps) {
    steps = partial.steps;
  }

  return { ...existing, blocks, steps };
}
