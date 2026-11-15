import type { RtSegment } from '@/lib/v2/rt';
import type { BriefMoment } from './types';

/**
 * Pure script checks (14 §2.6, 14c §2). No DB, no model, no fs.
 *
 * Warnings never block saving. Fatal problems trigger one retry, then the
 * raw output is exposed to the admin.
 */

export const MIN_SCRIPT_LINES = 15;
export const MAX_NOTES = 3;

/** Rough line count by level (14 §2.4 length targets). Warnings only. */
export const LINE_RANGE_BY_LEVEL: Record<number, readonly [number, number]> = {
  1: [15, 32],
  2: [20, 40],
  3: [25, 48],
  4: [30, 58],
  5: [35, 70],
};

/**
 * Short blocklist of well-known brand names (English names only).
 * Matched on whole words, case-insensitive. A hit is a warning, never a drop.
 */
export const BRAND_BLOCKLIST: readonly string[] = [
  'mcdonalds',
  'starbucks',
  'kfc',
  'burger king',
  'subway',
  'coca cola',
  'pepsi',
  'nike',
  'adidas',
  'ikea',
  'zara',
  'amazon',
  'google',
  'facebook',
  'instagram',
  'whatsapp',
  'uber',
  'netflix',
  'apple',
  'samsung',
  'walmart',
  'tesco',
  'lidl',
  'aldi',
  'carrefour',
  'decathlon',
  'vodafone',
];

export type ScriptLine = {
  speaker: string;
  tl: string;
  tl_f?: string;
  ar: string;
  scene: number;
  /** Brief moment id, or '' for the main flow. */
  moment: string;
};

export type ScriptNote = {
  after_line: number;
  eg: RtSegment[];
  focus?: string[];
};

export type ParsedScript = {
  title_tl: string;
  title_ar: string;
  lines: ScriptLine[];
  notes: ScriptNote[];
};

export type FatalCode =
  | 'no_parse'
  | 'bad_line'
  | 'too_few_lines'
  | 'speaker_not_in_cast';

export type FatalProblem = {
  code: FatalCode;
  message: string;
  line_index?: number;
};

export type WarningCode =
  | 'tl_slash'
  | 'ar_missing'
  | 'brand_name'
  | 'moment_uncovered'
  | 'moment_unknown'
  | 'must_say_missing'
  | 'direction_mix'
  | 'note_after_line'
  | 'note_empty'
  | 'notes_too_many'
  | 'note_focus_missing'
  | 'line_count_low'
  | 'line_count_high';

export type ScriptWarning = {
  code: WarningCode;
  message: string;
  /** 0-based index into lines, when the warning belongs to a line. */
  line_index?: number;
  note_index?: number;
  moment_id?: string;
};

export type ScriptCheckContext = {
  /** Voice keys of the episode cast; a speaker must be one of them. */
  cast_keys: readonly string[];
  moments: readonly Pick<BriefMoment, 'id' | 'direction' | 'must_say'>[];
  target_level: number;
};

export type ScriptCheckResult = {
  ok: boolean;
  fatal: FatalProblem[];
  warnings: ScriptWarning[];
  script: ParsedScript | null;
};

/* ------------------------------------------------------------------ */
/* Text helpers                                                        */
/* ------------------------------------------------------------------ */

/** Lowercase, punctuation to spaces, collapsed. Accents are kept. */
export function normText(s: string): string {
  return s
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Same but accents stripped, for brand matching. */
function normPlain(s: string): string {
  return normText(s.normalize('NFD').replace(/\p{M}+/gu, ''));
}

function containsPhrase(haystackNorm: string, needleNorm: string): boolean {
  if (!needleNorm) return false;
  return ` ${haystackNorm} `.includes(` ${needleNorm} `);
}

/** `#line-N` anchor the admin UI links to (N is the 0-based line index). */
export function lineAnchor(index: number): string {
  return `line-${index}`;
}

export function warningAnchor(w: Pick<ScriptWarning, 'line_index'>): string | null {
  return typeof w.line_index === 'number' ? `#${lineAnchor(w.line_index)}` : null;
}

/* ------------------------------------------------------------------ */
/* Parsing / normalising                                               */
/* ------------------------------------------------------------------ */

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function toSegments(v: unknown): RtSegment[] {
  if (typeof v === 'string') {
    const text = v.trim();
    return text ? [{ text, lang: 'eg' }] : [];
  }
  if (!Array.isArray(v)) return [];
  const out: RtSegment[] = [];
  for (const raw of v) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const text = typeof r.text === 'string' ? r.text : '';
    if (!text) continue;
    const lang = r.lang === 'tl' || r.lang === 'ar' ? r.lang : 'eg';
    const seg: RtSegment = { text, lang };
    if (r.bold === true) seg.bold = true;
    if (typeof r.group === 'string') seg.group = r.group as RtSegment['group'];
    out.push(seg);
  }
  return out;
}

function toFocus(v: unknown): string[] | undefined {
  if (typeof v === 'string') return v.trim() ? [v.trim()] : undefined;
  if (!Array.isArray(v)) return undefined;
  const list = v.filter((x): x is string => typeof x === 'string' && !!x.trim());
  return list.length ? list.map((s) => s.trim()) : undefined;
}

/**
 * Normalise one raw line object. Returns null if it is not an object with
 * a string `tl`; `ar` may be empty (it is a warning, not a parse failure).
 */
export function normalizeLine(raw: unknown): ScriptLine | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.tl !== 'string' || typeof r.speaker !== 'string') return null;
  const sceneN = Number(r.scene);
  const line: ScriptLine = {
    speaker: r.speaker.trim(),
    tl: r.tl.trim(),
    ar: str(r.ar),
    scene: Number.isInteger(sceneN) && sceneN >= 1 ? sceneN : 1,
    moment: str(r.moment),
  };
  const tlF = str(r.tl_f);
  if (tlF) line.tl_f = tlF;
  return line;
}

/** Parse the model's JSON into a script. Fatal `no_parse` / `bad_line` on bad shape. */
export function parseScript(raw: unknown): {
  script: ParsedScript | null;
  fatal: FatalProblem[];
} {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      script: null,
      fatal: [{ code: 'no_parse', message: 'Output is not a JSON object' }],
    };
  }
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.lines)) {
    return {
      script: null,
      fatal: [{ code: 'no_parse', message: 'Output has no "lines" array' }],
    };
  }
  const fatal: FatalProblem[] = [];
  const lines: ScriptLine[] = [];
  r.lines.forEach((l, i) => {
    const n = normalizeLine(l);
    if (!n || !n.tl) {
      fatal.push({
        code: 'bad_line',
        message: `Line ${i} is not an object with string "speaker" and non-empty "tl"`,
        line_index: i,
      });
      return;
    }
    lines.push(n);
  });
  const notes: ScriptNote[] = [];
  if (Array.isArray(r.notes)) {
    for (const raw of r.notes) {
      if (!raw || typeof raw !== 'object') continue;
      const n = raw as Record<string, unknown>;
      const after = Number(n.after_line);
      const note: ScriptNote = {
        after_line: Number.isInteger(after) ? after : -1,
        eg: toSegments(n.eg),
      };
      const focus = toFocus(n.focus);
      if (focus) note.focus = focus;
      notes.push(note);
    }
  }
  return {
    script: {
      title_tl: str(r.title_tl),
      title_ar: str(r.title_ar),
      lines,
      notes,
    },
    fatal,
  };
}

/* ------------------------------------------------------------------ */
/* Fatal checks                                                        */
/* ------------------------------------------------------------------ */

export function fatalProblems(
  script: ParsedScript,
  castKeys: readonly string[],
  parseFatal: FatalProblem[] = [],
): FatalProblem[] {
  const fatal = [...parseFatal];
  if (script.lines.length < MIN_SCRIPT_LINES) {
    fatal.push({
      code: 'too_few_lines',
      message: `Only ${script.lines.length} lines; at least ${MIN_SCRIPT_LINES} are required`,
    });
  }
  const cast = new Set(castKeys);
  script.lines.forEach((l, i) => {
    if (!cast.has(l.speaker)) {
      fatal.push({
        code: 'speaker_not_in_cast',
        message: `Line ${i} speaker "${l.speaker}" is not in the cast`,
        line_index: i,
      });
    }
  });
  return fatal;
}

/* ------------------------------------------------------------------ */
/* Warnings                                                            */
/* ------------------------------------------------------------------ */

function noteText(n: ScriptNote): string {
  return n.eg.map((s) => s.text).join('').trim();
}

export function computeWarnings(
  script: Pick<ParsedScript, 'lines' | 'notes'>,
  ctx: Pick<ScriptCheckContext, 'moments' | 'target_level'>,
): ScriptWarning[] {
  const w: ScriptWarning[] = [];
  const { lines, notes } = script;

  // Per-line checks.
  lines.forEach((l, i) => {
    if (l.tl.includes('/')) {
      w.push({
        code: 'tl_slash',
        message: 'Target-language text contains "/"',
        line_index: i,
      });
    }
    if (l.tl_f?.includes('/')) {
      w.push({
        code: 'tl_slash',
        message: 'Feminine target-language text contains "/"',
        line_index: i,
      });
    }
    if (!l.ar.trim()) {
      w.push({ code: 'ar_missing', message: 'Arabic meaning is missing', line_index: i });
    }
    const plain = normPlain(`${l.tl} ${l.tl_f ?? ''}`);
    for (const brand of BRAND_BLOCKLIST) {
      if (containsPhrase(plain, brand)) {
        w.push({
          code: 'brand_name',
          message: `Possible real brand name: ${brand}`,
          line_index: i,
        });
        break;
      }
    }
  });

  // Moment coverage + must_say.
  const known = new Set(ctx.moments.map((m) => m.id));
  const byMoment = new Map<string, number[]>();
  lines.forEach((l, i) => {
    if (!l.moment) return;
    if (!known.has(l.moment)) {
      w.push({
        code: 'moment_unknown',
        message: `Line points to unknown moment "${l.moment}"`,
        line_index: i,
        moment_id: l.moment,
      });
      return;
    }
    byMoment.set(l.moment, [...(byMoment.get(l.moment) ?? []), i]);
  });
  for (const m of ctx.moments) {
    const idx = byMoment.get(m.id) ?? [];
    if (idx.length === 0) {
      w.push({
        code: 'moment_uncovered',
        message: `Moment "${m.id}" has no line`,
        moment_id: m.id,
      });
    }
    const must = normText(m.must_say ?? '');
    if (must) {
      const hit = idx.find(
        (i) =>
          containsPhrase(normText(lines[i].tl), must) ||
          containsPhrase(normText(lines[i].tl_f ?? ''), must),
      );
      if (hit === undefined) {
        w.push({
          code: 'must_say_missing',
          message: `must_say of moment "${m.id}" does not appear word for word`,
          moment_id: m.id,
          ...(idx.length ? { line_index: idx[0] } : {}),
        });
      }
    }
  }

  // Direction mix: 3+ moments with a learner direction must cover 2+ directions.
  const dirMoments = ctx.moments.filter((m) => m.direction && m.direction !== 'none');
  if (ctx.moments.length >= 3 && dirMoments.length > 0) {
    const covered = new Set(
      dirMoments.filter((m) => (byMoment.get(m.id) ?? []).length > 0).map((m) => m.direction),
    );
    if (covered.size < 2) {
      w.push({
        code: 'direction_mix',
        message: 'Real moments in the script use fewer than two directions',
      });
    }
  }

  // Notes (14c §2).
  if (notes.length > MAX_NOTES) {
    w.push({
      code: 'notes_too_many',
      message: `${notes.length} notes; at most ${MAX_NOTES} are allowed`,
    });
  }
  notes.forEach((n, ni) => {
    const exists = n.after_line >= 0 && n.after_line < lines.length;
    if (!exists) {
      w.push({
        code: 'note_after_line',
        message: 'Note points to a line that does not exist',
        note_index: ni,
      });
    }
    if (!noteText(n)) {
      w.push({
        code: 'note_empty',
        message: 'Note is empty',
        note_index: ni,
        ...(exists ? { line_index: n.after_line } : {}),
      });
    }
    if (exists && n.focus?.length) {
      const prior = lines[n.after_line];
      const hay = `${normText(prior.tl)} ${normText(prior.tl_f ?? '')}`;
      for (const f of n.focus) {
        if (!containsPhrase(hay, normText(f))) {
          w.push({
            code: 'note_focus_missing',
            message: `Focus "${f}" is not in the line before the note`,
            note_index: ni,
            line_index: n.after_line,
          });
        }
      }
    }
  });

  // Rough length vs level.
  const range = LINE_RANGE_BY_LEVEL[ctx.target_level];
  if (range && lines.length >= MIN_SCRIPT_LINES) {
    if (lines.length < range[0]) {
      w.push({
        code: 'line_count_low',
        message: `${lines.length} lines is short for level ${ctx.target_level} (about ${range[0]}-${range[1]})`,
      });
    } else if (lines.length > range[1]) {
      w.push({
        code: 'line_count_high',
        message: `${lines.length} lines is long for level ${ctx.target_level} (about ${range[0]}-${range[1]})`,
      });
    }
  }
  return w;
}

/** Parse + fatal + warnings in one pass. */
export function checkScript(raw: unknown, ctx: ScriptCheckContext): ScriptCheckResult {
  const parsed = parseScript(raw);
  if (!parsed.script) {
    return { ok: false, fatal: parsed.fatal, warnings: [], script: null };
  }
  const fatal = fatalProblems(parsed.script, ctx.cast_keys, parsed.fatal);
  const warnings = computeWarnings(parsed.script, ctx);
  return { ok: fatal.length === 0, fatal, warnings, script: parsed.script };
}
