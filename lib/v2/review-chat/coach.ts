import coachAr from '@/content/v2/review-coach.ar.json';

type CoachFile = {
  opening: string[];
  round_names: string[];
  feedback_correct: string[];
  feedback_accent: string[];
  feedback_near_miss: string[];
  feedback_wrong: string[];
  feedback_unclear: string[];
  feedback_self_rated: string[];
  hint_ack: string[];
  round_end_title: string[];
  round_end_cta: string[];
  round_end_stop: string[];
  session_end_title: string[];
  session_end_sub: string[];
  speaking_self_rate_note: string[];
  cant_speak: string[];
  empty_title: string[];
  empty_detail: string[];
  typing: string[];
  footer: string[];
  collapsed_round: string[];
  next: string[];
  logged_weak: string[];
};

const COACH = coachAr as CoachFile;

export function pickVariant<T extends string>(
  key: keyof CoachFile,
  index: number,
  vars?: Record<string, string | number>,
): string {
  const list = COACH[key];
  if (!Array.isArray(list) || !list.length) return '';
  const raw = list[Math.abs(index) % list.length]!;
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, k: string) => {
    const v = vars[k];
    return v != null ? String(v) : `{${k}}`;
  });
}

export function coachOpening(name: string, lessons: string, rounds: number, i: number) {
  return pickVariant('opening', i, { name, lessons, rounds });
}

export function coachRoundName(round: number, i: number) {
  return pickVariant('round_names', i, { n: round });
}

export function coachFeedbackLabel(
  verdict: import('./types').FeedbackVerdict,
  stepIndex: number,
): string {
  switch (verdict) {
    case 'correct':
      return pickVariant('feedback_correct', stepIndex);
    case 'accent_ok':
      return pickVariant('feedback_accent', stepIndex);
    case 'near_miss':
      return pickVariant('feedback_near_miss', stepIndex);
    case 'wrong':
      return pickVariant('feedback_wrong', stepIndex);
    case 'unclear':
      return pickVariant('feedback_unclear', stepIndex);
    case 'self_rated':
      return pickVariant('feedback_self_rated', stepIndex);
    default:
      return pickVariant('feedback_correct', stepIndex);
  }
}

export function coachFooter(i: number) {
  return pickVariant('footer', i);
}

export function coachTyping(i: number) {
  return pickVariant('typing', i);
}

export function coachNext(i: number) {
  return pickVariant('next', i);
}

export function coachCantSpeak(i: number) {
  return pickVariant('cant_speak', i);
}

export function coachSelfRateNote(i: number) {
  return pickVariant('speaking_self_rate_note', i);
}

export function coachLoggedWeak(i: number) {
  return pickVariant('logged_weak', i);
}

export function coachCollapsedRound(round: number, count: number, i: number) {
  return pickVariant('collapsed_round', i, { n: round, count });
}