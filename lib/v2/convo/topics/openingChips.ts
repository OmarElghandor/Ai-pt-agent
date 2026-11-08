import {
  listOpeningChips,
  type OpeningTopicChip,
} from '@/lib/v2/convo/topics/allowed';

export type OpeningChipPayload = {
  topic_id: string;
  tl: string;
  ar: string;
  above_level: boolean;
  badge_eg?: string;
};

/** Build the answer-frame chips for the one-chat opening (v4 V4). */
export function openingChipsForLevel(
  level: number,
  opts?: { targetLang?: string },
): OpeningChipPayload[] {
  return listOpeningChips(level, opts).map((c: OpeningTopicChip) => ({
    topic_id: c.id,
    tl: c.title_tl,
    ar: c.title_ar,
    above_level: c.above_level,
    ...(c.badge_eg ? { badge_eg: c.badge_eg } : {}),
  }));
}

/** PT chip labels for pending_frame.chips (learner taps). */
export function openingChipLabels(level: number): string[] {
  return openingChipsForLevel(level).map((c) =>
    c.above_level && c.badge_eg ? `${c.tl} · ${c.badge_eg}` : c.tl,
  );
}

export function oneChatOpeningFrame(level: number): {
  tl: string;
  eg: string;
  chips: string[];
} {
  return {
    tl: 'Quero falar de ___.',
    eg: 'قول عايز تتكلم عن إيه — أو دوس موضوع من تحت',
    chips: openingChipLabels(level),
  };
}
