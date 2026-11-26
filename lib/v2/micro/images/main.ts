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
    `Lisbon everyday scene illustrating "${opts.title_tl}"`;
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
