type BankEntry = { pt: string; meaning: string };

const DIFFICULTY_RANK: Record<string, number> = { guided: 0, supported: 1, open: 2 };
const RANK_NAME = ['guided', 'supported', 'open'] as const;

function asEntry(raw: unknown): BankEntry | null {
  if (typeof raw === 'string' && raw.trim()) return { pt: raw.trim(), meaning: '' };
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const pt = String(o.pt || o.word || o.text || '').trim();
  if (!pt) return null;
  const meaning = String(o.meaning || o.ar || o.note || '').trim();
  return { pt, meaning };
}

function textOf(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (!value || typeof value !== 'object') return '';
  const o = value as Record<string, unknown>;
  return String(o.ar || o.text || o.pt || '').trim();
}

function linePt(row: Record<string, unknown>): string {
  const line = row.line;
  if (!line || typeof line !== 'object') return '';
  return String((line as Record<string, unknown>).pt || '').trim();
}

function firstWord(pt: string): string {
  const word = pt.replace(/[?!.,;:«»"'()]/g, ' ').trim().split(/\s+/)[0];
  return word || 'sim';
}

function copyArz(target: Record<string, unknown>, displayKey: string, arzKey: string): boolean {
  const display = String(target[displayKey] || '').trim();
  if (!display || String(target[arzKey] || '').trim()) return false;
  target[arzKey] = display;
  return true;
}

function fillWordBank(row: Record<string, unknown>, pool: BankEntry[]): boolean {
  const current = (Array.isArray(row.word_bank) ? row.word_bank : [])
    .map(asEntry)
    .filter((entry): entry is BankEntry => Boolean(entry));
  // Guided: 3–5; supported/open: 3–6. Keep 3–6 as a shared repair band.
  if (current.length >= 3 && current.length <= 6) return false;
  const blob = JSON.stringify(row).toLowerCase();
  const seen = new Set(current.map((entry) => entry.pt.toLowerCase()));
  const extras = [...pool].sort((a, b) => {
    const aHit = blob.includes(a.pt.toLowerCase()) ? 0 : 1;
    const bHit = blob.includes(b.pt.toLowerCase()) ? 0 : 1;
    return aHit - bHit;
  });
  let changed = current.length > 6;
  for (const entry of extras) {
    if (current.length >= 5) break;
    const key = entry.pt.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    current.push(entry);
    changed = true;
  }
  if (current.length >= 3) {
    row.word_bank = current.slice(0, 6);
    return true;
  }
  return changed && current.length >= 3;
}

function fillVerdicts(list: unknown): boolean {
  if (!Array.isArray(list)) return false;
  let changed = false;
  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue;
    const row = entry as Record<string, unknown>;
    const verdict = String(row.verdict || '').toLowerCase().replace('-', '_');
    if (verdict === 'near_miss' || verdict === 'wrong') continue;
    row.verdict = 'wrong';
    changed = true;
  }
  return changed;
}

/**
 * Make a generated story pack match the simple beat rules before the structure check.
 * Difficulty decides the kind. Missing learner aids, pronunciation, and verdicts are filled.
 * A difficulty that steps backwards is lifted to the previous level.
 */
export function repairStoryAids(pack: unknown, allowedWords: unknown[] = []): boolean {
  if (!pack || typeof pack !== 'object') return false;
  const root = pack as Record<string, unknown>;
  const beats = root.beats;
  if (!Array.isArray(beats)) return false;

  let changed = false;
  if (typeof root.intro_ar === 'string' && root.intro_ar.trim() && !String(root.intro_arz || '').trim()) {
    root.intro_arz = root.intro_ar.trim();
    changed = true;
  }
  const hook = root.closing_hook;
  if (hook && typeof hook === 'object') {
    const hookRow = hook as Record<string, unknown>;
    changed = copyArz(hookRow, 'ar', 'arz') || changed;
  }

  const pool = allowedWords.map(asEntry).filter((entry): entry is BankEntry => Boolean(entry));
  let lastRank = -1;

  for (const beat of beats) {
    if (!beat || typeof beat !== 'object') continue;
    const row = beat as Record<string, unknown>;
    const named = String(row.difficulty || '');
    const rank = DIFFICULTY_RANK[named];
    if (rank != null && lastRank >= 0 && rank < lastRank) {
      row.difficulty = RANK_NAME[lastRank];
      changed = true;
    } else if (rank != null) {
      lastRank = rank;
    }

    const difficulty = String(row.difficulty || '');
    const authoredKind = String(row.kind || '');
    // Prefer authored kind. Only infer from difficulty when kind is missing.
    const kind =
      authoredKind === 'open' || authoredKind === 'known'
        ? authoredKind
        : difficulty === 'open'
          ? 'open'
          : difficulty === 'guided' || difficulty === 'supported'
            ? 'known'
            : authoredKind;
    if ((kind === 'open' || kind === 'known') && row.kind !== kind) {
      row.kind = kind;
      changed = true;
    }

    const line = row.line;
    if (line && typeof line === 'object') {
      const lineRow = line as Record<string, unknown>;
      changed = copyArz(lineRow, 'ar', 'arz') || changed;
      changed = copyArz(lineRow, 'alt_ar', 'alt_arz') || changed;
    }

    const tip = row.coach_tip;
    if (tip && typeof tip === 'object') {
      changed = copyArz(tip as Record<string, unknown>, 'ar', 'arz') || changed;
    }

    const open = row.kind === 'open';
    const needsTip = difficulty === 'guided' || difficulty === 'supported';
    if (needsTip && !textOf(row.coach_tip)) {
      row.coach_tip = { ar: 'قول الإجابة.', arz: 'قول الإِجَابَة.' };
      changed = true;
    }
    if ((difficulty === 'guided' || open) && !textOf(row.frame)) {
      const pt = linePt(row);
      row.frame = open && pt ? `${firstWord(pt)} …` : '…';
      changed = true;
    }
    if (difficulty === 'guided' || difficulty === 'supported' || open) {
      if (fillWordBank(row, pool)) changed = true;
    }
    if (open) {
      const pt = linePt(row);
      if (!textOf(row.criterion)) {
        row.criterion = pt ? `He answers in his own words to: ${pt}` : 'He answers in his own words.';
        changed = true;
      }
      const guardEmpty =
        row.guard == null ||
        (typeof row.guard === 'string' && !String(row.guard).trim()) ||
        (Array.isArray(row.guard) && row.guard.length === 0);
      if (guardEmpty) {
        const frameSrc = textOf(row.frame) || pt;
        row.guard = [firstWord(frameSrc).toLowerCase()];
        changed = true;
      }
      if (!textOf(row.hint_note) && !textOf(row.hintNote)) {
        row.hint_note = 'فكّر في الجملة اللي تناسب السؤال.';
        changed = true;
      }
    }
    if (!textOf(row.reaction_cue)) {
      row.reaction_cue = 'The character reacts to what he said.';
      changed = true;
    }
    if (fillVerdicts(row.anticipated_wrong)) changed = true;
  }

  const assessment = root.assessment;
  if (Array.isArray(assessment)) {
    for (const task of assessment) {
      if (!task || typeof task !== 'object') continue;
      if (fillVerdicts((task as Record<string, unknown>).anticipated_wrong)) changed = true;
    }
  }

  return changed;
}
