import type { Issue } from '@/lib/v2/content/validate';
import {
  ConvoPackDataSchema,
  type ConvoItemSurface,
  type ConvoPackData,
} from './schema';

export type ValidateConvoPackResult = {
  ok: boolean;
  issues: Issue[];
  pack?: ConvoPackData;
};

export type ValidateConvoPackOpts = {
  /** Lesson item surfaces for containment checks (id → tl). */
  itemSurfaces: ConvoItemSurface[];
  /**
   * Allowed item ids outside this day's core (recycle). When set, every
   * group item must be in core∪recycle for the pack's day.
   */
  allowedItemIds?: Set<string>;
};

function issue(
  path: string,
  rule: string,
  message: string,
  severity: Issue['severity'] = 'error',
): Issue {
  return { path, rule, message, severity };
}

/** Normalize for containment: lowercase, collapse spaces, strip trailing punct. */
function normSurface(s: string): string {
  return s
    .normalize('NFC')
    .toLowerCase()
    .replace(/[.?!,;:]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** True if `haystack` contains the item surface as a whole token/phrase. */
export function containsItemSurface(haystack: string, itemTl: string): boolean {
  const h = normSurface(haystack);
  const needle = normSurface(itemTl);
  if (!needle) return false;
  if (h.includes(needle)) return true;
  // Also try without leading article/prep fragments common in pt-PT directions.
  const stripped = needle.replace(/^(o|a|os|as|à|ao|às|aos|um|uma)\s+/i, '');
  if (stripped && stripped !== needle && h.includes(stripped)) return true;
  return false;
}

function isPatternItem(itemId: string): boolean {
  return itemId.startsWith('pattern.');
}

/**
 * Validate a conversation pack: zod schema + code checks from 09 §4.1
 * that do not need generation (Brazilian/length/gloss deferred to T5).
 */
export function validateConvoPack(
  raw: unknown,
  opts: ValidateConvoPackOpts,
): ValidateConvoPackResult {
  const issues: Issue[] = [];
  const parsed = ConvoPackDataSchema.safeParse(raw);
  if (!parsed.success) {
    for (const e of parsed.error.issues) {
      issues.push(
        issue(e.path.join('.') || '(root)', 'schema', e.message, 'error'),
      );
    }
    return { ok: false, issues };
  }
  const pack = parsed.data;
  const surfaceById = new Map(
    opts.itemSurfaces.map((s) => [s.id, s.tl] as const),
  );

  const groupItemIds = new Set<string>();
  for (const [gi, group] of pack.groups.entries()) {
    for (const id of group.item_ids) {
      groupItemIds.add(id);
      if (!pack.items[id]) {
        issues.push(
          issue(
            `groups[${gi}].item_ids`,
            'item_bank',
            `group item "${id}" has no entry in items`,
          ),
        );
      }
      if (!surfaceById.has(id)) {
        issues.push(
          issue(
            `groups[${gi}].item_ids`,
            'item_surface',
            `no tl surface provided for item "${id}"`,
          ),
        );
      }
      if (opts.allowedItemIds && !opts.allowedItemIds.has(id)) {
        issues.push(
          issue(
            `groups[${gi}].item_ids`,
            'cross_day_item',
            `item "${id}" is not in this day's core or recycle list`,
          ),
        );
      }
    }
  }

  for (const itemId of Object.keys(pack.items)) {
    if (!groupItemIds.has(itemId)) {
      issues.push(
        issue(
          `items.${itemId}`,
          'ungrouped_item',
          `item "${itemId}" is in items but not in any group`,
          'warning',
        ),
      );
    }
  }

  const recapItemIds = new Set(pack.recap.questions.map((q) => q.item_id));
  const routeStepIds = new Set(
    pack.visual.type === 'map'
      ? pack.visual.route.map((s) => s.step_id)
      : [],
  );
  const nodeIds =
    pack.visual.type === 'map'
      ? new Set(pack.visual.nodes.map((n) => n.id))
      : new Set<string>();
  const nodeById =
    pack.visual.type === 'map'
      ? new Map(pack.visual.nodes.map((n) => [n.id, n] as const))
      : new Map();
  const hotspotIds =
    pack.visual.type === 'scene_card'
      ? new Set(pack.visual.hotspots.map((h) => h.id))
      : new Set<string>();

  if (pack.visual.type === 'map') {
    for (const [si, step] of pack.visual.route.entries()) {
      if (!nodeIds.has(step.from) || !nodeIds.has(step.to)) {
        issues.push(
          issue(
            `visual.route[${si}]`,
            'map_route_nodes',
            `route step "${step.step_id}" references unknown nodes`,
          ),
        );
      }
      if (!groupItemIds.has(step.item_id) && !pack.items[step.item_id]) {
        issues.push(
          issue(
            `visual.route[${si}].item_id`,
            'map_route_item',
            `route step uses item "${step.item_id}" not in the pack`,
          ),
        );
      }
    }
  }

  function checkMapRefs(
    path: string,
    q: { map_node?: string; map_step?: string },
    requireAnchor: boolean,
  ): void {
    if (pack.visual.type !== 'map') return;
    if (requireAnchor && !q.map_node && !q.map_step) {
      issues.push(
        issue(
          path,
          'map_anchor_required',
          `map pack question needs map_node or map_step`,
        ),
      );
    }
    if (q.map_node && !nodeIds.has(q.map_node)) {
      issues.push(
        issue(
          `${path}.map_node`,
          'map_node_exists',
          `map_node "${q.map_node}" is not an existing node`,
        ),
      );
    }
    if (q.map_step && !routeStepIds.has(q.map_step)) {
      issues.push(
        issue(
          `${path}.map_step`,
          'map_step_exists',
          `map_step "${q.map_step}" is not an existing route step`,
        ),
      );
    }
  }

  for (const itemId of groupItemIds) {
    const bank = pack.items[itemId];
    if (!bank) continue;
    const itemTl = surfaceById.get(itemId) ?? '';

    if (!bank.coach_intro_eg.trim()) {
      issues.push(
        issue(
          `items.${itemId}.coach_intro_eg`,
          'coach_intro',
          `item "${itemId}" needs a coach intro`,
        ),
      );
    }

    if (bank.choice_questions.length < 1) {
      issues.push(
        issue(
          `items.${itemId}.choice_questions`,
          'choice_min',
          `item "${itemId}" needs ≥1 choice question`,
        ),
      );
    }
    if (bank.open_questions.length < 1) {
      issues.push(
        issue(
          `items.${itemId}.open_questions`,
          'open_min',
          `item "${itemId}" needs ≥1 open question`,
        ),
      );
    }

    if (!recapItemIds.has(itemId)) {
      issues.push(
        issue(
          `items.${itemId}`,
          'recap_coverage',
          `item "${itemId}" must appear in the recap`,
          pack.authored ? 'warning' : 'error',
        ),
      );
    }

    for (const [qi, q] of bank.choice_questions.entries()) {
      const path = `items.${itemId}.choice_questions[${qi}]`;
      if (!q.option_ids.includes(q.correct_id)) {
        issues.push(
          issue(
            `${path}.correct_id`,
            'choice_correct',
            `correct_id "${q.correct_id}" is not in option_ids`,
          ),
        );
      }
      if (
        itemTl &&
        !isPatternItem(itemId) &&
        !containsItemSurface(q.tl, itemTl)
      ) {
        issues.push(
          issue(
            `${path}.tl`,
            'choice_contains_item',
            `choice question must contain the item surface "${itemTl}"`,
          ),
        );
      }
      checkMapRefs(path, q, false);
      if (pack.visual.type === 'map' && q.map_node) {
        const node = nodeById.get(q.map_node);
        if (
          node?.kind === 'place' &&
          node.item_id &&
          q.correct_id !== node.item_id
        ) {
          issues.push(
            issue(
              `${path}.correct_id`,
              'map_node_correct',
              `place question correct_id "${q.correct_id}" must match node item "${node.item_id}"`,
            ),
          );
        }
      }
    }

    for (const [qi, q] of bank.open_questions.entries()) {
      const path = `items.${itemId}.open_questions[${qi}]`;
      if (q.item_id !== itemId) {
        issues.push(
          issue(
            `${path}.item_id`,
            'open_item_mismatch',
            `open question item_id "${q.item_id}" must match bank key "${itemId}"`,
          ),
        );
      }
      if (itemTl && !isPatternItem(itemId) && containsItemSurface(q.tl, itemTl)) {
        issues.push(
          issue(
            `${path}.tl`,
            'open_omits_item',
            `open question must not contain the item surface "${itemTl}"`,
          ),
        );
      }
      checkMapRefs(path, q, pack.visual.type === 'map');
      if (pack.visual.type === 'scene_card' && q.hotspot_id) {
        if (!hotspotIds.has(q.hotspot_id)) {
          issues.push(
            issue(
              `${path}.hotspot_id`,
              'hotspot_exists',
              `hotspot_id "${q.hotspot_id}" is not an existing hotspot`,
            ),
          );
        }
      }
    }
  }

  for (const [qi, q] of pack.recap.questions.entries()) {
    if (!groupItemIds.has(q.item_id) && !pack.items[q.item_id]) {
      issues.push(
        issue(
          `recap.questions[${qi}].item_id`,
          'recap_item',
          `recap references unknown item "${q.item_id}"`,
        ),
      );
    }
  }

  const ok = issues.every((i) => i.severity !== 'error');
  return ok ? { ok: true, issues, pack } : { ok: false, issues, pack };
}
