import {
  findBrazilianLeak,
  findEnglishLeak,
  findUnknownWords,
  wordCount,
  type ConvoOutputIssue,
} from './checks';
import {
  checkArScript,
  checkPtScript,
  scriptIssueReason,
} from './scriptGuard';

const FORMAL_RE = /\b(você|a sua|o seu|os seus|as suas)\b/i;

/** Yes/no openers blocked unless the question has "ou". */
const YES_NO_OPENERS = /^(É|Tens|Gostas|Vais|Estás|Queres)\b/u;

export type OpenParseIssue =
  | 'missing_pt'
  | 'missing_ar'
  | 'not_arabic'
  | 'cjk'
  | 'cyrillic'
  | 'forbidden_script'
  | 'pt_not_latin'
  | 'missing_frame'
  | 'frame_no_blank'
  | 'missing_hint'
  | 'chips_few'
  | 'question_count'
  | 'yes_no'
  | 'no_trailing_q'
  | 'formal'
  | 'length'
  | 'brazilian'
  | 'english';

export type ParseOpenConvoResult = {
  pt: string;
  ar: string;
  frame_tl: string;
  hint_eg: string;
  chips: string[];
  issues: OpenParseIssue[];
  outputIssues: ConvoOutputIssue[];
  decision: 'ok' | 'regenerate' | 'fallback';
  regenerateReason?: string;
  unknownWords: string[];
  /** PT with the trailing question stripped (for second-fail fallback). */
  ptWithoutQuestion: string;
};

const MARKERS = ['PT:', 'AR:', 'FRAME:', 'HINT:', 'CHIPS:'] as const;

/** Split a labelled open-mode stream into fields. */
export function splitOpenMarkers(text: string): Record<string, string> {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  const out: Record<string, string> = {};
  // Find each marker (start of line or start of string)
  const re = /(?:^|\n)\s*(PT|AR|FRAME|HINT|CHIPS)\s*:\s*/gi;
  const hits: Array<{ key: string; start: number; bodyStart: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(normalized))) {
    hits.push({
      key: m[1]!.toUpperCase(),
      start: m.index,
      bodyStart: m.index + m[0].length,
    });
  }
  for (let i = 0; i < hits.length; i++) {
    const hit = hits[i]!;
    const end = i + 1 < hits.length ? hits[i + 1]!.start : normalized.length;
    out[hit.key] = normalized.slice(hit.bodyStart, end).trim();
  }
  // Bare text before first marker → treat as PT if missing
  if (!out.PT && hits.length > 0 && hits[0]!.start > 0) {
    out.PT = normalized.slice(0, hits[0]!.start).trim();
  } else if (!out.PT && hits.length === 0 && normalized) {
    out.PT = normalized;
  }
  void MARKERS;
  return out;
}

export function countQuestions(pt: string): number {
  return (pt.match(/\?/g) ?? []).length;
}

export function isYesNoQuestion(pt: string): boolean {
  const q = pt.trim();
  // Take the last sentence if multi
  const parts = q.split(/(?<=[.!?…])\s+/).filter(Boolean);
  const last = (parts[parts.length - 1] ?? q).trim();
  if (/\bou\b/i.test(last)) return false;
  return YES_NO_OPENERS.test(last);
}

export function stripTrailingQuestion(pt: string): string {
  const parts = pt
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const kept = parts.filter((s) => !/\?\s*$/.test(s) && !s.includes('?'));
  return kept.join(' ').trim();
}

function reasonFor(issues: OpenParseIssue[]): string {
  const map: Partial<Record<OpenParseIssue, string>> = {
    missing_pt: 'start with PT: reaction plus one question',
    missing_ar: 'add AR: with an Arabic translation',
    not_arabic: scriptIssueReason('ar_not_arabic'),
    cjk: scriptIssueReason('cjk'),
    cyrillic: scriptIssueReason('cyrillic'),
    forbidden_script: scriptIssueReason('forbidden_script'),
    pt_not_latin: scriptIssueReason('pt_not_latin'),
    missing_frame: 'add FRAME: with a pt-PT answer frame containing ___',
    frame_no_blank: 'FRAME: must include ___',
    missing_hint: 'add HINT: one Egyptian line',
    chips_few: 'CHIPS: need at least 2 answers separated by |',
    question_count: 'PT: must have exactly one ? at the end',
    yes_no: 'ask an open or either/or question, never yes/no',
    no_trailing_q: 'end the PT line with one ?',
    formal: 'use tu forms only (never você / a sua / o seu)',
    length: 'PT: at most 20 words',
    brazilian: 'use European Portuguese, not Brazilian',
    english: 'reply in Portuguese only',
  };
  return issues.map((i) => map[i] ?? i).join('; ');
}

/**
 * Parse Batch 10 open-mode model output.
 */
export function parseOpenConvoTurn(
  text: string,
  opts?: { knownWords?: string[] },
): ParseOpenConvoResult {
  const fields = splitOpenMarkers(text);
  const pt = (fields.PT ?? '').trim();
  const ar = (fields.AR ?? '').trim();
  const frame_tl = (fields.FRAME ?? '').trim();
  const hint_eg = (fields.HINT ?? '').trim();
  const chipsRaw = (fields.CHIPS ?? '').trim();
  const chips = chipsRaw
    ? chipsRaw
        .split(/\s*\|\s*/)
        .map((c) => c.trim())
        .filter(Boolean)
    : [];

  const issues: OpenParseIssue[] = [];
  const outputIssues: ConvoOutputIssue[] = [];

  if (!pt) issues.push('missing_pt');
  if (!ar) issues.push('missing_ar');
  else {
    const arIssue = checkArScript(ar);
    if (arIssue === 'ar_not_arabic') issues.push('not_arabic');
    else if (arIssue === 'cjk') issues.push('cjk');
    else if (arIssue === 'cyrillic') issues.push('cyrillic');
    else if (arIssue) issues.push('forbidden_script');
  }
  if (pt) {
    const ptIssue = checkPtScript(pt);
    if (ptIssue === 'cjk') issues.push('cjk');
    else if (ptIssue === 'cyrillic') issues.push('cyrillic');
    else if (ptIssue === 'pt_not_latin') issues.push('pt_not_latin');
    else if (ptIssue) issues.push('forbidden_script');
  }
  if (!frame_tl) issues.push('missing_frame');
  else if (!frame_tl.includes('___')) issues.push('frame_no_blank');
  if (!hint_eg) issues.push('missing_hint');
  if (chips.length < 2) issues.push('chips_few');

  const qCount = countQuestions(pt);
  if (qCount !== 1) issues.push('question_count');
  if (pt && !/\?\s*$/.test(pt)) issues.push('no_trailing_q');
  if (pt && isYesNoQuestion(pt)) issues.push('yes_no');
  if (FORMAL_RE.test(pt)) issues.push('formal');
  if (wordCount(pt) > 20) {
    issues.push('length');
    outputIssues.push('length');
  }
  if (findBrazilianLeak(pt)) {
    issues.push('brazilian');
    outputIssues.push('brazilian');
  }
  if (findEnglishLeak(pt)) {
    issues.push('english');
    outputIssues.push('english');
  }

  const unknownWords = findUnknownWords(pt, opts?.knownWords).slice(0, 2);

  if (issues.length === 0) {
    return {
      pt,
      ar,
      frame_tl,
      hint_eg,
      chips,
      issues,
      outputIssues,
      decision: 'ok',
      unknownWords,
      ptWithoutQuestion: stripTrailingQuestion(pt),
    };
  }

  return {
    pt,
    ar,
    frame_tl,
    hint_eg,
    chips,
    issues,
    outputIssues,
    decision: 'regenerate',
    regenerateReason: reasonFor(issues),
    unknownWords,
    ptWithoutQuestion: stripTrailingQuestion(pt),
  };
}

/** Next-field markers that end the visible PT line (open mode). */
const OPEN_FIELD_CUT_RE = /\n\s*(AR|FRAME|HINT|CHIPS)\s*:/i;
/** Trailing partial next-field label still forming — hold it back (G1). */
const OPEN_FIELD_PARTIAL_RE =
  /\n\s*(A|AR|F|FR|FRA|FRAM|FRAME|H|HI|HIN|HINT|C|CH|CHI|CHIP|CHIPS)\s*:?\s*$/i;

/**
 * Visible PT while an open-mode stream arrives (G1).
 * Holds incomplete leading `PT:` and trailing partial field labels so the
 * client never sees "PT" / "AR" fragments.
 */
export function visibleOpenStreamText(accumulated: string): string {
  let s = accumulated.replace(/\r\n/g, '\n');

  const cut = s.search(OPEN_FIELD_CUT_RE);
  if (cut >= 0) s = s.slice(0, cut);

  const partial = s.match(OPEN_FIELD_PARTIAL_RE);
  if (partial && partial.index != null) {
    s = s.slice(0, partial.index);
  } else if (/\n\s*$/.test(s)) {
    // Bare newline could start AR:/FRAME:… — hold it
    s = s.replace(/\n\s*$/, '');
  }

  const trimmedStart = s.replace(/^\s+/, '');
  if (!trimmedStart) return '';

  // Incomplete leading label "P" / "PT" / "PT " (before colon)
  if (/^P$/i.test(trimmedStart) || /^PT$/i.test(trimmedStart)) return '';
  if (/^PT\s+$/i.test(trimmedStart)) return '';

  if (/^PT\s*:/i.test(trimmedStart)) {
    return trimmedStart.replace(/^PT\s*:\s*/i, '');
  }

  // "P…" that is not heading toward "PT:" (e.g. "Praia", "Olá") → show as-is
  return trimmedStart;
}

/**
 * Emit stream updates with prefix safety (G1).
 * Returns the new visibleAcc for the caller to keep.
 */
export function emitVisibleStreamDelta(opts: {
  nextVisible: string;
  visibleAcc: string;
  emit: (event: { type: 'reaction_delta' | 'reaction_reset'; text: string }) => void;
}): string {
  const { nextVisible, emit } = opts;
  let { visibleAcc } = opts;
  if (nextVisible === visibleAcc) return visibleAcc;
  if (nextVisible.startsWith(visibleAcc)) {
    const delta = nextVisible.slice(visibleAcc.length);
    visibleAcc = nextVisible;
    if (delta) emit({ type: 'reaction_delta', text: delta });
    return visibleAcc;
  }
  visibleAcc = nextVisible;
  emit({ type: 'reaction_reset', text: nextVisible });
  return visibleAcc;
}
