export type RtLang = 'eg' | 'ar' | 'tl';

export type RtGroup =
  | 'a'
  | 'b'
  | 'c'
  | 'm'
  | 'f'
  | 'verb'
  | 'prep'
  | 'pron'
  | 'neg'
  | 'neutral';

export type RtSegment = {
  text: string;
  lang: RtLang;
  bold?: boolean;
  group?: RtGroup;
  /** Intentionally wrong form — render struck through. */
  wrong?: boolean;
};

export type Skill = 'listening' | 'reading' | 'speaking' | 'writing';
