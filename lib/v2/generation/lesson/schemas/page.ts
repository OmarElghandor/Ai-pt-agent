import { z } from 'zod';
import {
  ModeSchema,
  PageSchema,
  PresetSchema,
  type Mode,
  type Page,
} from '@/lib/v2/content/page';
import { RtSchema } from '@/lib/v2/content/rt';
import type { OutlinePagePlan } from '../stages/types';
import { normalizePageJson } from '../stages/page';

/**
 * Generation page tool schema: id / preset / mode are code-owned (injected from
 * the outline entry). Model must still return title + ≥1 blocks.
 */
export const GenPageSchema = PageSchema.omit({
  id: true,
  preset: true,
  mode: true,
}).extend({
  id: z.string().optional(),
  preset: PresetSchema.optional(),
  mode: ModeSchema.optional(),
});

export const PageJobSchema = z.object({
  page: GenPageSchema,
  taught_eg: z.string().optional(),
});

function titleFromEntry(entry: OutlinePagePlan): z.infer<typeof RtSchema> {
  const t = entry.title;
  if (typeof t === 'string' && t.trim()) {
    return [{ text: t.trim(), lang: 'tl' }];
  }
  return [{ text: entry.page_id, lang: 'tl' }];
}

/** Summarize tool payload for retry errors (avoid dumping full page). */
export function summarizePagePayload(data: unknown): string {
  if (data == null) return 'null';
  if (typeof data !== 'object') return typeof data;
  const root = data as Record<string, unknown>;
  const page = (root.page ?? root) as Record<string, unknown> | null;
  if (!page || typeof page !== 'object') {
    return `keys=${Object.keys(root).join(',')}`;
  }
  const blocks = Array.isArray(page.blocks) ? page.blocks.length : 'missing';
  const steps = Array.isArray(page.steps) ? page.steps.length : 'missing';
  return `page.keys=${Object.keys(page).join(',')} blocks=${blocks} steps=${steps} title=${page.title == null ? 'missing' : 'set'}`;
}

/**
 * Normalize LLM shape, then inject outline-owned fields so schema checks focus
 * on content (blocks / title / steps) rather than id/preset/mode.
 */
export function hydratePageToolResult(
  data: unknown,
  entry: OutlinePagePlan,
  mode: Mode,
): unknown {
  let root: Record<string, unknown> = {};
  if (data && typeof data === 'object') {
    root = { ...(data as Record<string, unknown>) };
  }

  // Common mistakes: pages: [page], or page nested twice.
  if (!root.page && Array.isArray(root.pages) && root.pages[0]) {
    root.page = root.pages[0];
  }
  if (
    root.page &&
    typeof root.page === 'object' &&
    !Array.isArray(root.page) &&
    'page' in (root.page as object) &&
    !('blocks' in (root.page as object))
  ) {
    root.page = (root.page as { page: unknown }).page;
  }

  const normalized = normalizePageJson(root) as Record<string, unknown>;
  const page = {
    ...((normalized.page as Record<string, unknown>) ?? {}),
  };

  page.id = entry.page_id;
  page.preset = entry.preset;
  page.mode = mode;
  if (page.title == null) {
    page.title = titleFromEntry(entry);
  }

  return {
    ...normalized,
    page,
    taught_eg:
      typeof root.taught_eg === 'string'
        ? root.taught_eg
        : typeof normalized.taught_eg === 'string'
          ? normalized.taught_eg
          : undefined,
  };
}

export function finalizeGenPage(
  page: z.infer<typeof GenPageSchema>,
  entry: OutlinePagePlan,
  mode: Mode,
): Page {
  return {
    ...page,
    id: entry.page_id,
    preset: entry.preset as Page['preset'],
    mode,
  };
}
