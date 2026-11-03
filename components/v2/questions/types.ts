import type { Item } from '@/lib/v2/content/items';
import type { Question, Skill } from '@/lib/v2/content/lesson';
import type { RtSegment } from '@/lib/v2/content/rt';
import { cloudinaryDisplayUrl } from '@/lib/v2/images/cloudinaryUrl';

export type QuestionAnswerMeta = {
  text?: string;
  self_rated?: boolean;
  skip_srs?: boolean;
  /** Self-rate label for speaking: hard | near | exact */
  rating?: 'hard' | 'near' | 'exact';
};

export type QuestionGradeResult = {
  optionIndex: number;
  correct: boolean;
  meta?: QuestionAnswerMeta;
};

export type SkillScore = { correct: number; total: number };

export type SessionStats = {
  correct: number;
  total: number;
  bySkill: Partial<Record<Skill, SkillScore>>;
  usedCorrectly: string[];
  focusNote?: { wrong: string; right: string; why_eg: string } | null;
};

export type QuestionViewProps = {
  question: Question;
  items: ReadonlyMap<string, Item>;
  /** When true, the shell owns Confirm; view only selects. */
  graded: boolean;
  selectedIndex: number | null;
  onSelect: (index: number) => void;
  /** Immediate grade+advance path (tiles / speak / write submit). */
  onGrade?: (result: QuestionGradeResult) => void;
  draftText?: string;
  onDraftText?: (text: string) => void;
  /** Lesson day — used for «ضيفها للكروت» on wrong real-world answers. */
  day?: number;
};

export function asRt(value: unknown): RtSegment[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const ok = value.every(
    (seg) =>
      seg &&
      typeof seg === 'object' &&
      typeof (seg as RtSegment).text === 'string' &&
      typeof (seg as RtSegment).lang === 'string',
  );
  return ok ? (value as RtSegment[]) : null;
}

export function optionLabel(opt: unknown): string {
  const rt = asRt(opt);
  if (rt) return rt.map((s) => s.text).join('');
  if (typeof opt === 'string') return opt;
  return '';
}

export function promptRecord(
  prompt: unknown,
): Record<string, unknown> | null {
  if (!prompt || typeof prompt !== 'object' || Array.isArray(prompt)) return null;
  return prompt as Record<string, unknown>;
}

function itemAspect(item: Item): '1:1' | '4:3' {
  return item.type === 'phrase' ? '4:3' : '1:1';
}

/** Prefer denormalized items[].image.url; fall back to absolute media.image. */
export function itemImageUrl(item: Item | undefined): string | null {
  if (!item) return null;
  const aspect = itemAspect(item);
  const any = item as {
    image?: { url?: string };
    media?: { image?: string };
  };
  if (any.image?.url) {
    return cloudinaryDisplayUrl(any.image.url, { aspect, width: 600 });
  }
  if (typeof any.media?.image === 'string' && any.media.image.startsWith('http')) {
    return cloudinaryDisplayUrl(any.media.image, { aspect, width: 600 });
  }
  if (typeof any.media?.image === 'string' && any.media.image.startsWith('/')) {
    return any.media.image;
  }
  return null;
}

export function easternDigits(n: number): string {
  return String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)]!);
}
