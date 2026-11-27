import {
  characterDescriptionsMap,
  descriptionForPrompt,
} from '@/lib/v2/characters/registry';
import { IMAGE_FORBIDDEN, mergeMustAvoid } from '@/lib/v2/images/forbidden';
import { themePromptLine } from '@/lib/v2/images/themes';

/** Shared base for every kind (19 §3). No people interaction. */
export const STYLE_BASE = `Hand-drawn editorial illustration in ink and soft watercolour: loose, confident pen linework with visible sketchy hatching, light watercolour washes that leave some paper showing, subtle paper grain. Adult realistic proportions where people appear. No text, no letters, no numbers, no logos, no flags, no speech bubbles, no watermark. Not cartoonish, not childish, not 3D, not photorealistic.`;

/** Object add-on — thing alone on white paper (19 §3). */
export const STYLE_OBJECT = `A single subject (or a small group of the same thing with its natural props) in the centre, filling about 55–65% of the frame, on clean white watercolour paper with a soft wash shadow under it and generous white space around it. Loose watercolour splashes in the subject's own colours are welcome. No people, no hands, no table scene, no room or background. Like a page from an illustrated food or object sketchbook.`;

/** Scene / action add-on — people in a lived-in setting (19 §3). */
export const STYLE_PEOPLE = `Detailed, lived-in but generic setting with no recognisable landmarks, no country-specific details and no readable signs, drawn slightly softer and less saturated than the people, so they stay the focus. Expressive natural faces, candid storytelling moment; when two people appear they look at each other and interact. Like a modern sketchbook or graphic-novel panel.`;

/**
 * Full style block for people scenes (base + people add-on).
 * Kept for call sites that still want one string; prefer STYLE_BASE + add-ons.
 */
export const STYLE_CORE = `${STYLE_BASE} ${STYLE_PEOPLE}`;

/** @deprecated Prefer STYLE_CORE / STYLE_BASE. */
export const STYLE_PROMPT = STYLE_CORE;

/** @deprecated Prefer descriptionForPrompt — kept as a live map for call sites. */
export const CHARACTER_DESCRIPTIONS: Record<string, string> =
  characterDescriptionsMap();

export type ImageSpec = {
  type: 'object' | 'action' | 'emotion' | 'place' | 'scene' | 'story_panel';
  subject: string;
  characters?: string[];
  pose?: string;
  expression?: string;
  setting?: string;
  framing?: string;
  light?: string;
  must_show?: string | string[];
  must_avoid?: string | string[];
  /** One English line for vision meaning QA. */
  intent?: string;
  /** Colour theme id from image-themes.json (scene/action); persisted on regenerate. */
  theme?: string;
};

export type ImageSize = '1024x1024' | '1536x1024';

export function sizeForType(type: ImageSpec['type']): ImageSize {
  if (type === 'place' || type === 'scene' || type === 'story_panel') {
    return '1536x1024';
  }
  return '1024x1024';
}

function list(value: string | string[] | undefined): string {
  if (!value) return '';
  return Array.isArray(value) ? value.join(', ') : value;
}

function expandCharacters(ids: string[] | undefined): string {
  if (!ids?.length) return '';
  return ids.map((id) => descriptionForPrompt(id) || id).join(', ');
}

function referenceLine(characters: string[] | undefined): string {
  const names = (characters ?? [])
    .map((id) => id.charAt(0).toUpperCase() + id.slice(1))
    .join(', ');
  const hasChars = (characters?.length ?? 0) > 0;
  return hasChars
    ? `Use the attached reference images for the exact look of these characters: ${names}. Same face, hair, skin tone, outfit and colors. Draw each named character exactly once.`
    : `Use the attached image only as a style reference: same line weight, colors and shading. Do not copy its subject.`;
}

function styleBlockForKind(
  kind: ImageSpec['type'] | 'object' | 'action' | 'scene',
): string {
  if (kind === 'object') return `${STYLE_BASE} ${STYLE_OBJECT}`;
  return `${STYLE_BASE} ${STYLE_PEOPLE}`;
}

/** Final prompt for a hand-authored (or admin-overridden) scene description. */
export function buildAuthoredImagePrompt(opts: {
  characters?: string[];
  prompt: string;
  /** @deprecated Prefer `kind`. */
  scene?: boolean;
  kind?: ImageSpec['type'] | 'object' | 'action' | 'scene';
  theme?: string;
}): string {
  const kind: ImageSpec['type'] =
    opts.kind ??
    (opts.scene === false
      ? 'object'
      : (opts.characters?.length ?? 0) === 0
        ? 'object'
        : 'scene');
  const avoid = mergeMustAvoid(undefined, { kind });
  const themeLine =
    kind !== 'object' ? themePromptLine(opts.theme) : null;
  return [
    referenceLine(opts.characters),
    '',
    styleBlockForKind(kind),
    '',
    opts.prompt.trim(),
    themeLine,
    '',
    `Avoid: ${avoid.join(', ')}.`,
  ]
    .filter((line) => line != null && line !== '')
    .join('\n');
}

export function sizeForRatio(
  ratio: '1:1' | '4:3' | '16:9' | undefined,
): ImageSize {
  if (ratio === '16:9') return '1536x1024';
  return '1024x1024';
}

export function buildImagePrompt(spec: ImageSpec): string {
  const chars = expandCharacters(spec.characters);
  const refLine = referenceLine(spec.characters);

  let body = '';
  switch (spec.type) {
    case 'object':
      body = `Subject: ${spec.subject} as the clear centre of the frame, filling about 55–65% of the frame on clean white watercolour paper with a soft wash shadow under it. Natural props for the same thing only. No people, no hands, no table scene, no room. Loose watercolour splashes in the subject's own colours are welcome.`;
      break;
    case 'action':
      body = `Subject: ${chars || 'a person'} ${spec.subject}, ${spec.pose ?? 'mid-movement'}, ${spec.framing ?? 'full body'}, ${spec.expression ?? ''}. Setting: ${spec.setting ?? 'the lesson place'}, kept recognizable. The action must be instantly clear without any words.`;
      break;
    case 'emotion':
      body = `Subject: ${chars || 'a person'} showing ${spec.subject}, ${spec.expression ?? ''}, ${spec.pose ?? ''}, in ${spec.setting ?? 'the lesson place'}, with the cause visible when there is one. Upper body ok.`;
      break;
    case 'place':
      body = `Subject: the outside of ${spec.subject}, ${spec.setting ?? ''}, ${spec.light ?? ''}. All signs are blank shapes with no letters.`;
      break;
    case 'scene': {
      const isWide = /wide/i.test(spec.framing ?? '');
      const framingHint = isWide
        ? 'Wide establishing shot; full bodies allowed but faces still readable.'
        : 'Waist-up framing; faces large and expressive.';
      body = [
        `Conversational scene: ${spec.subject}.`,
        `Setting: ${spec.setting ?? ''}.`,
        `${chars} ${spec.pose ?? 'mid-conversation'}.`,
        `${spec.light ?? ''}.`,
        'The two people face each other and make eye contact, expressive readable faces, natural candid moment, gentle depth of field.',
        framingHint,
        'Background people are simple and unnamed. All signs, labels, price tags and screens are blank. Real place — not a symbolic shortcut.',
      ].join(' ');
      break;
    }
    case 'story_panel':
      body = `Comic panel. ${chars} ${spec.subject}, ${spec.pose ?? ''}, ${spec.expression ?? ''}. Setting: ${spec.setting ?? ''}. ${spec.framing ?? ''}, ${spec.light ?? ''}. Cinematic composition, no speech bubbles, no captions, no sound effects.`;
      break;
  }

  const avoid = mergeMustAvoid(spec.must_avoid, { kind: spec.type });
  const must = `Must show: ${list(spec.must_show) || 'the subject clearly'}. Avoid: ${avoid.join(', ')}.`;
  const intentLine = spec.intent
    ? `Meaning to convey (no text in image): ${spec.intent}`
    : '';
  const themeLine =
    spec.type === 'object' ? null : themePromptLine(spec.theme);

  return [
    refLine,
    '',
    styleBlockForKind(spec.type),
    '',
    body,
    intentLine,
    themeLine,
    '',
    must,
  ]
    .filter((line) => line != null && line !== '')
    .join('\n');
}

export { IMAGE_FORBIDDEN };
