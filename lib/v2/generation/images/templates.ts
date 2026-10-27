export const STYLE_PROMPT = `Friendly educational cartoon illustration for adult learners, clean bold dark-navy outlines of even weight, flat colors with soft subtle shading, warm cheerful palette (sunny yellow, sky blue, leaf green, coral, soft orange), plain warm cream background, centered subject with generous empty space around it, modern language-learning textbook style. Adult realistic body proportions, small natural eyes, subtle expressions, not cute, not childish, no chibi, no big heads. No text, no letters, no numbers, no watermark.`;

export const CHARACTER_DESCRIPTIONS: Record<string, string> = {
  yassin:
    'Yassin (Egyptian man in his late 20s, warm light-brown skin, short dark curly hair, neat short beard, olive-green jacket over a plain white t-shirt, dark blue jeans, white sneakers, brown backpack)',
  ines:
    'Inês (Portuguese woman in her late 20s, fair skin with light freckles, shoulder-length wavy chestnut hair, mustard-yellow cardigan over a navy-and-white striped top, dark grey trousers, brown ankle boots, small gold earrings)',
  rita:
    'Rita (Portuguese woman about 45, short dark-brown bob, reading glasses on a cord, navy polo shirt uniform with a blank name badge)',
  manuel:
    'Manuel (Portuguese man about 60, short grey hair, grey moustache, white shirt with rolled sleeves, dark brown apron)',
  sofia:
    'Sofia (Portuguese woman about 35, black hair in a low bun, white coat over a light blue blouse)',
  carlos:
    'Carlos (Portuguese man about 50, stocky, short salt-and-pepper hair, beige knitted sweater, dark trousers)',
};

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
  return ids
    .map((id) => CHARACTER_DESCRIPTIONS[id] ?? id)
    .join(', ');
}

export function buildImagePrompt(spec: ImageSpec): string {
  const chars = expandCharacters(spec.characters);
  const names = (spec.characters ?? [])
    .map((id) => id.charAt(0).toUpperCase() + id.slice(1))
    .join(', ');

  const hasChars = (spec.characters?.length ?? 0) > 0;
  const refLine = hasChars
    ? `Use the attached reference images for the exact look of these characters: ${names}. Same face, hair, skin tone, outfit and colors. Draw each named character exactly once.`
    : `Use the attached image only as a style reference: same line weight, colors and shading. Do not copy its subject.`;

  let body = '';
  switch (spec.type) {
    case 'object':
      body = `Subject: a single ${spec.subject}, three-quarter view from slightly above. Isolated, nothing else in the frame, no hands, no people, no plate or table unless part of the subject.`;
      break;
    case 'action':
      body = `Subject: ${chars || 'a person'} ${spec.subject}, ${spec.pose ?? ''}, ${spec.framing ?? 'full body'}, ${spec.expression ?? ''}. Setting: ${spec.setting ?? 'simple background'}, kept simple and in the background. The action must be instantly clear without any words.`;
      break;
    case 'emotion':
      body = `Subject: ${chars || 'a person'} showing ${spec.subject}, ${spec.expression ?? ''}, ${spec.pose ?? ''}, upper body, front view. No background objects.`;
      break;
    case 'place':
      body = `Subject: the outside of ${spec.subject} in Lisbon, ${spec.setting ?? ''}, ${spec.light ?? ''}. All signs are blank shapes with no letters.`;
      break;
    case 'scene':
      body = `Wide view of ${spec.subject}, ${spec.setting ?? ''}. ${chars} ${spec.pose ?? ''}. ${spec.light ?? ''}. Background people are simple and unnamed. All signs, labels, price tags and screens are blank.`;
      break;
    case 'story_panel':
      body = `Comic panel. ${chars} ${spec.subject}, ${spec.pose ?? ''}, ${spec.expression ?? ''}. Setting: ${spec.setting ?? ''}. ${spec.framing ?? ''}, ${spec.light ?? ''}. Cinematic composition, no speech bubbles, no captions, no sound effects.`;
      break;
  }

  const must = `Must show: ${list(spec.must_show) || 'the subject clearly'}. Avoid: ${list(spec.must_avoid) || 'text, letters, numbers, watermarks'}.`;

  return [refLine, '', STYLE_PROMPT, '', body, '', must].join('\n');
}
