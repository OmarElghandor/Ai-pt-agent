import type { Issue } from '@/lib/v2/content/validate';
import { charactersForPlace, getCharacter } from '@/lib/v2/characters/registry';
import {
  ConvoOutlineToolSchema,
  type ConvoOutline,
} from '@/lib/v2/generation/convo/outlineSchema';

export type ValidateConvoOutlineOpts = {
  /** Lesson / core item ids allowed in groups and route. */
  allowedItemIds: string[];
  /** Prefer place-matching characters; warn if missing. */
  placeHint?: string;
};

export type ValidateConvoOutlineResult = {
  ok: boolean;
  issues: Issue[];
  outline?: ConvoOutline;
};

function issue(
  path: string,
  rule: string,
  message: string,
  severity: Issue['severity'] = 'error',
): Issue {
  return { path, rule, message, severity };
}

/**
 * Outline-scope checks for T5.1 (scene, character, visual, groups, recap shape).
 */
export function validateConvoOutline(
  raw: unknown,
  opts: ValidateConvoOutlineOpts,
): ValidateConvoOutlineResult {
  const issues: Issue[] = [];
  const parsed = ConvoOutlineToolSchema.safeParse(raw);
  if (!parsed.success) {
    for (const e of parsed.error.issues) {
      issues.push(
        issue(e.path.join('.') || '(root)', 'schema', e.message, 'error'),
      );
    }
    return { ok: false, issues };
  }
  const outline = parsed.data;
  const allowed = new Set(opts.allowedItemIds);

  if (!getCharacter(outline.scene.character_id)) {
    issues.push(
      issue(
        'scene.character_id',
        'character',
        `unknown character "${outline.scene.character_id}"`,
      ),
    );
  } else {
    const place = opts.placeHint ?? outline.scene.place;
    const fits = charactersForPlace(place, { includeLearner: false }).map(
      (c) => c.id,
    );
    if (fits.length > 0 && !fits.includes(outline.scene.character_id)) {
      issues.push(
        issue(
          'scene.character_id',
          'character_place',
          `"${outline.scene.character_id}" does not match place "${place}" (allowed: ${fits.join(', ')})`,
          'warning',
        ),
      );
    }
  }

  if (!outline.scene.information_gap.trim()) {
    issues.push(
      issue('scene.information_gap', 'gap', 'information_gap is empty'),
    );
  }

  const groupIds = new Set<string>();
  for (const [gi, group] of outline.groups.entries()) {
    if (group.item_ids.length < 1 || group.item_ids.length > 5) {
      issues.push(
        issue(
          `groups[${gi}].item_ids`,
          'group_size',
          `group must have 1–5 items (got ${group.item_ids.length})`,
        ),
      );
    }
    for (const id of group.item_ids) {
      groupIds.add(id);
      if (!allowed.has(id)) {
        issues.push(
          issue(
            `groups[${gi}].item_ids`,
            'item_allowed',
            `item "${id}" is not in the lesson core/recycle set`,
          ),
        );
      }
    }
  }

  const recapIds = new Set<string>();
  for (const [qi, q] of outline.recap.questions.entries()) {
    recapIds.add(q.item_id);
    if (!groupIds.has(q.item_id)) {
      issues.push(
        issue(
          `recap.questions[${qi}].item_id`,
          'recap_group',
          `recap item "${q.item_id}" is not in any group`,
        ),
      );
    }
  }
  for (const id of groupIds) {
    if (!recapIds.has(id)) {
      issues.push(
        issue(
          'recap.questions',
          'recap_cover',
          `group item "${id}" missing from recap`,
          'warning',
        ),
      );
    }
  }

  if (outline.visual.type === 'map') {
    const nodeIds = new Set(outline.visual.nodes.map((n) => n.id));
    for (const [si, step] of outline.visual.route.entries()) {
      if (!nodeIds.has(step.from) || !nodeIds.has(step.to)) {
        issues.push(
          issue(
            `visual.route[${si}]`,
            'map_nodes',
            `route step references unknown node`,
          ),
        );
      }
      if (!groupIds.has(step.item_id) && !allowed.has(step.item_id)) {
        issues.push(
          issue(
            `visual.route[${si}].item_id`,
            'map_item',
            `route item "${step.item_id}" not in pack groups`,
          ),
        );
      }
    }
  } else {
    for (const [hi, h] of outline.visual.hotspots.entries()) {
      if (!groupIds.has(h.item_id) && !allowed.has(h.item_id)) {
        issues.push(
          issue(
            `visual.hotspots[${hi}].item_id`,
            'hotspot_item',
            `hotspot item "${h.item_id}" not in pack groups`,
          ),
        );
      }
    }
  }

  const ok = !issues.some((i) => i.severity === 'error');
  return { ok, issues, outline: ok ? outline : undefined };
}
