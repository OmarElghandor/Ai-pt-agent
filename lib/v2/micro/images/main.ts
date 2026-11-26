import type { ImageSpec } from '@/lib/v2/generation/images/templates';
import { mergeMustAvoid } from '@/lib/v2/images/forbidden';

/** Main clip picture key. */
export function microMainImageKey(
  targetLang: string,
  seriesSlug: string,
  clipSlug: string,
): string {
  return `micro.${targetLang}.${seriesSlug}.${clipSlug}.main`;
}

/** Fallback English subject when the model omits image_spec. */
export function synthesizeMicroImageSpec(opts: {
  title_tl: string;
  layout: string;
  prompt_guidance?: string;
}): string {
  const guidance = opts.prompt_guidance?.trim();
  const layoutHint =
    opts.layout === 'scene'
      ? 'wide scene with clear separate spots for each line object'
      : opts.layout === 'pairs'
        ? 'compact cafe or street vignette'
        : 'everyday Lisbon interior or street';
  if (guidance) {
    return `Lisbon watercolour illustrating "${opts.title_tl}": ${guidance}. ${layoutHint}, no text in image.`;
  }
  return `Lisbon everyday watercolour scene illustrating "${opts.title_tl}", ${layoutHint}, soft ink, no text in image.`;
}

/**
 * Build a lesson-pipeline-compatible image spec for a clip main picture.
 * Scenes are authored at 4:3; list/pairs/rule use the same aspect for RN parity.
 */
export function buildMicroMainImageSpec(opts: {
  title_tl: string;
  layout: string;
  image_spec?: string;
  region_objects?: string[];
}): ImageSpec {
  const avoid = mergeMustAvoid(undefined);
  const objects = opts.region_objects?.filter(Boolean) ?? [];
  const subject =
    opts.image_spec?.trim() ||
    synthesizeMicroImageSpec({
      title_tl: opts.title_tl,
      layout: opts.layout,
    });
  return {
    type: 'scene',
    subject,
    setting: 'a generic Lisbon street or interior, no brands',
    framing: 'wide 4:3 watercolour, people in action, no text in image',
    intent: `watercolour Lisbon scene for micro clip ${opts.title_tl}`,
    must_show: [
      'soft watercolour ink style',
      'clear separate spots for named objects',
      ...objects.slice(0, 8),
    ],
    must_avoid: [...avoid, 'text', 'letters', 'logos', 'brand names'],
    characters: [],
  };
}
