// @ts-nocheck

const ALLOWED_SLOTS = new Set(['[NAME]', '[CITY]', '[NUMBER]', '[PLACE]']);
const ARABIC_RE = /[\u0600-\u06FF]/;
const LATIN_RE = /[A-Za-z]/;
const SLOT_RE = /\[[A-Z_]+\]/g;
const ENGLISH_HINT_RE =
  /\b(the|and|you|your|please|hello|what|where|when|how|with|for|this|that)\b/i;

class PracticeLessonValidationError extends Error {
  constructor(errors) {
    super(errors.map((e) => e.message).join('; '));
    this.name = 'PracticeLessonValidationError';
    this.errors = errors;
  }
}

function walkStrings(value, path, visit) {
  if (value == null) return;
  if (typeof value === 'string') {
    visit(value, path);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => walkStrings(v, `${path}[${i}]`, visit));
    return;
  }
  if (typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      walkStrings(v, path ? `${path}.${k}` : k, visit);
    }
  }
}

function isArabicFieldPath(path) {
  return (
    /(^|\.|_)(ar|arz|display_ar|pronunciation|situation_ar|title_ar|note|hint_note|why_note|nudge_note|criterion)(\.|$|\[)/i.test(
      path
    ) ||
    /\.ar$/i.test(path) ||
    /\.arz$/i.test(path) ||
    /_ar$/i.test(path)
  );
}

function isPortugueseFieldPath(path) {
  return (
    /(^|\.|_)(pt|accepted|frame|guard|form|prompt_pt|situation_en)(\.|$|\[)/i.test(
      path
    ) === false &&
    (/(^|\.|_)(pt|accepted|frame|guard)(\.|$|\[)/i.test(path) ||
      /\.pt$/i.test(path) ||
      path.includes('.accepted') ||
      path.endsWith('frame') ||
      path.includes('prompts') && path.includes('.pt'))
  );
}

function pathLooksPortuguese(path) {
  if (isArabicFieldPath(path)) return false;
  return (
    /\.pt(\.|$|\[)/i.test(path) ||
    /\.accepted(\.|$|\[)/i.test(path) ||
    /(^|\.)frame(\.|$|\[)/i.test(path) ||
    /(^|\.)guard(\.|$|\[)/i.test(path) ||
    /prompts\[[0-9]+\]\.pt/i.test(path)
  );
}

function pathLooksArabic(path) {
  // Arabic display / pronunciation fields.
  return (
    /\.ar(\.|$|\[)/i.test(path) ||
    /\.arz(\.|$|\[)/i.test(path) ||
    /title_ar|situation_ar/i.test(path)
  );
}

/** .arz and notes often mix Egyptian with Latin Portuguese words — warn only. */
function pathAllowsLatinInArabic(path) {
  return (
    /\.arz(\.|$|\[)/i.test(path) ||
    /(hint_note|why_note|nudge_note|mistake_note|criterion)(\.|$|\[)/i.test(path) ||
    /\.note(\.|$|\[)/i.test(path)
  );
}

function checkSlots(text, path, errors) {
  const matches = String(text).match(SLOT_RE) || [];
  for (const m of matches) {
    if (!ALLOWED_SLOTS.has(m)) {
      errors.push({
        code: 'malformed_slot',
        path,
        message: `Malformed slot ${m} at ${path}; only [NAME], [CITY], [NUMBER], [PLACE] allowed`,
      });
    }
  }
}

function getSegmentPairs(node) {
  // Support { ar, arz } or { display, pronunciation } or segments arrays
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node.segments)) {
    return node.segments
      .filter((s) => s && (s.lang === 'ar' || s.ar))
      .map((s) => ({
        ar: s.ar || s.text,
        arz: s.arz || s.pronunciation || s.pronunciation_ar,
        pathHint: 'segments',
      }));
  }
  const pairs = [];
  if (node.ar != null || node.arz != null) {
    pairs.push({ ar: node.ar, arz: node.arz || node.pronunciation, pathHint: 'ar' });
  }
  if (node.display != null || node.pronunciation != null) {
    pairs.push({
      ar: node.display,
      arz: node.pronunciation,
      pathHint: 'display',
    });
  }
  return pairs;
}

function validateArabicPronunciation(node, path, errors) {
  for (const pair of getSegmentPairs(node)) {
    if (pair.ar && ARABIC_RE.test(String(pair.ar)) && !pair.arz) {
      errors.push({
        code: 'missing_pronunciation',
        path: `${path}.${pair.pathHint}`,
        message: `Arabic segment missing pronunciation text at ${path}`,
      });
    }
  }
}

function displayArString(value) {
  if (typeof value === 'string') return value.trim();
  if (!value || typeof value !== 'object') return '';
  return (
    (typeof value.ar === 'string' && value.ar.trim()) ||
    (typeof value.display === 'string' && value.display.trim()) ||
    (typeof value.text === 'string' && value.text.trim()) ||
    (typeof value.ar_display === 'string' && value.ar_display.trim()) ||
    (typeof value.display_ar === 'string' && value.display_ar.trim()) ||
    ''
  );
}

function isTranslateLabel(text) {
  return String(text || '')
    .trim()
    .toLowerCase() === 'diz em português';
}

function promptEntryIsTranslate(p) {
  if (!p || typeof p !== 'object') return false;
  if (p.label_pt || p.label || p.shape === 'translate') return true;
  return isTranslateLabel(p.pt);
}

function arabicFromPromptEntry(p) {
  if (!p || typeof p !== 'object') return '';
  const candidates = [
    p.ar,
    p.ar_display,
    p.display_ar,
    p.arSentence,
    p.arHidden,
  ];
  for (const c of candidates) {
    const s = displayArString(c);
    if (s) return s;
  }
  for (const list of [p.sentences, p.ar_sentences]) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      const s = displayArString(item);
      if (s) return s;
    }
  }
  return '';
}

function validateItemPrompts(item, path, errors) {
  const prompts = Array.isArray(item?.prompts) ? item.prompts : [];
  if (prompts.length === 0) return;

  const translateLike = prompts.some(promptEntryIsTranslate);
  if (translateLike) {
    const hasAr = prompts.some((p) => Boolean(arabicFromPromptEntry(p)));
    if (!hasAr) {
      errors.push({
        code: 'translate_missing_ar',
        path: `${path}.prompts`,
        message: `Translate prompt missing Arabic display at ${path}.prompts`,
      });
    }
    return;
  }

  for (const [pi, p] of prompts.entries()) {
    if (!p || typeof p !== 'object') continue;
    const pt = String(p.pt || p.prompt_pt || '').trim();
    if (!pt) {
      errors.push({
        code: 'prompt_missing_pt',
        path: `${path}.prompts[${pi}]`,
        message: `Question prompt missing Portuguese pt at ${path}.prompts[${pi}]`,
      });
      continue;
    }
    if (!arabicFromPromptEntry(p)) {
      errors.push({
        code: 'prompt_missing_ar',
        path: `${path}.prompts[${pi}]`,
        message: `Question prompt missing Arabic display at ${path}.prompts[${pi}]`,
      });
    }
  }
}

const GENERIC_WHY_NOTES = new Set([
  'تحية',
  'تحيه',
  'olá',
  'ola',
  'bom dia',
  'ok',
  'صح',
]);

function notePlain(note) {
  if (typeof note === 'string') return note.trim();
  if (Array.isArray(note)) {
    return note
      .map((part) => (typeof part === 'string' ? part : part?.text || ''))
      .join(' ')
      .trim();
  }
  return '';
}

function isGenericWhyNote(note, accepted = []) {
  const text = notePlain(note);
  if (!text || text.length < 24) return true;
  const lower = text.toLowerCase().replace(/[!?.،"«»]/g, '').trim();
  if (GENERIC_WHY_NOTES.has(lower)) return true;
  return (accepted || []).some((answer) => {
    const bare = String(answer || '')
      .toLowerCase()
      .replace(/[!?.]/g, '')
      .trim();
    return bare && lower === bare;
  });
}

const PROMPT_STOPWORDS = new Set([
  'qual', 'que', 'para', 'como', 'uma', 'diz', 'em', 'portugues', 'português',
  'resposta', 'teu', 'tua', 'seu', 'sua', 'voce', 'você', 'o', 'a', 'os', 'as',
  'de', 'do', 'da', 'no', 'na', 'e', 'tu', 'te', 'se', 'me', 'lhe', 'ou', 'ao',
]);

function promptCanBeEchoed(item) {
  const prompts = Array.isArray(item?.prompts) ? item.prompts : [];
  const tokens = normalizeLoose(
    prompts.map((prompt) => prompt?.pt || prompt?.prompt_pt || '').join(' '),
  )
    .split(' ')
    .filter(Boolean);
  const accepted = (item?.accepted || []).map((answer) => normalizeLoose(answer));
  for (let i = 0; i < tokens.length - 1; i++) {
    if (PROMPT_STOPWORDS.has(tokens[i]) || PROMPT_STOPWORDS.has(tokens[i + 1])) continue;
    const phrase = `${tokens[i]} ${tokens[i + 1]}`;
    if (accepted.some((answer) => answer.includes(phrase))) continue;
    return true;
  }
  return false;
}

function normalizeLoose(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Accepted reply that is just the phrase already written in the prompt, when another reply exists. */
function acceptedAnswersInsidePrompt(item) {
  const prompt = normalizeLoose(
    (item?.prompts || [])
      .flatMap((entry) => [entry?.pt, entry?.prompt_pt, entry?.ar, entry?.text])
      .filter(Boolean)
      .join(' '),
  );
  const accepted = [...new Set((item?.accepted || []).map((answer) => normalizeLoose(answer)).filter((answer) => answer.length > 2))];
  const inside = accepted.filter((answer) => prompt.includes(answer));
  const outside = accepted.filter((answer) => !prompt.includes(answer));
  return inside.length && outside.length ? inside : [];
}

function hasEchoPlusAnswer(item) {
  const accepted = (item?.accepted || []).map((answer) =>
    String(answer || '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, '')
      .replace(/\s+/g, ' ')
      .trim(),
  );
  return (item?.anticipated_wrong || []).some((wrong) => {
    const answer = String(wrong?.answer || '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return accepted.some((expected) => expected && answer.includes(expected) && answer.length > expected.length + 1);
  });
}

const DIFFICULTY_ORDER = { guided: 0, supported: 1, open: 2 };
const VISIBLE_SLOT_RE = /\[(?:NAME|CITY|NUMBER|PLACE)\]/;

function textOf(value) {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '';
  return [value.pt, value.ar, value.arz, value.alt_pt, value.alt_ar, value.alt_arz, value.text]
    .filter((part) => typeof part === 'string')
    .join(' ');
}

function linePt(line) {
  if (!line || typeof line !== 'object') return '';
  return String(line.pt || line.alt_pt || '').trim();
}

function requireText(errors, value, path, code = 'missing_field') {
  const text = typeof value === 'string' ? value.trim() : textOf(value).trim();
  if (!text) {
    errors.push({ code, path, message: `Missing ${path}` });
  }
  return text;
}

function visibleSlot(errors, text, path) {
  if (text && VISIBLE_SLOT_RE.test(String(text))) {
    errors.push({
      code: 'visible_slot',
      path,
      message: `Slot visible to the learner at ${path}`,
    });
  }
}

function wordBankCount(raw) {
  return Array.isArray(raw) ? raw.filter(Boolean).length : 0;
}

/**
 * Structure-only validator for a story pack.
 * @returns {{ ok: boolean, errors: object[], warnings: object[] }}
 */
function validatePack(pack, { allowedWords = [], nucleus = [], spec = null } = {}) {
  const errors = [];
  const warnings = [];

  if (!pack || typeof pack !== 'object') {
    throw new PracticeLessonValidationError([
      { code: 'missing_field', path: 'pack', message: 'pack is required' },
    ]);
  }

  for (const field of ['intro_ar', 'character', 'scenes', 'beats', 'closing_hook', 'assessment']) {
    if (pack[field] == null) {
      errors.push({
        code: 'missing_field',
        path: field,
        message: `Missing required field: ${field}`,
      });
    }
  }

  requireText(errors, pack.intro_ar, 'intro_ar');
  visibleSlot(errors, pack.intro_ar, 'intro_ar');
  if (pack.intro_ar && !pack.intro_arz) {
    errors.push({
      code: 'missing_pronunciation',
      path: 'intro_arz',
      message: 'intro_ar is spoken and needs intro_arz',
    });
  }

  if (!pack.character?.name) {
    errors.push({
      code: 'missing_field',
      path: 'character.name',
      message: 'Missing character.name',
    });
  }

  const scenes = Array.isArray(pack.scenes) ? pack.scenes : [];
  if (scenes.length < 3 || scenes.length > 4) {
    errors.push({
      code: 'scene_count',
      path: 'scenes',
      message: `Scene count ${scenes.length} outside 3 to 4`,
    });
  }
  const sceneIds = new Set();
  scenes.forEach((scene, idx) => {
    const id = scene?.id;
    if (!id) {
      errors.push({
        code: 'missing_field',
        path: `scenes[${idx}].id`,
        message: `Missing scene id at scenes[${idx}]`,
      });
    } else sceneIds.add(id);
    requireText(errors, scene?.title_ar, `scenes[${idx}].title_ar`);
  });

  const beats = Array.isArray(pack.beats) ? pack.beats : [];
  if (beats.length < 8 || beats.length > 14) {
    errors.push({
      code: 'beat_count',
      path: 'beats',
      message: `Beat count ${beats.length} outside 8 to 14`,
    });
  }

  beats.forEach((beat, idx) => {
    const path = `beats[${idx}]`;
    if (!beat || typeof beat !== 'object') {
      errors.push({ code: 'missing_field', path, message: `Missing beat at ${path}` });
      return;
    }
    if (!beat.id) {
      errors.push({
        code: 'missing_field',
        path: `${path}.id`,
        message: `Missing beat id at ${path}`,
      });
    }
    if (!beat.scene || !sceneIds.has(beat.scene)) {
      errors.push({
        code: 'missing_scene',
        path: `${path}.scene`,
        message: `Beat scene does not match a scene id at ${path}`,
      });
    }
    requireText(errors, beat.speaker, `${path}.speaker`);
    const line = beat.line || {};
    requireText(errors, line.pt, `${path}.line.pt`);
    requireText(errors, line.ar, `${path}.line.ar`);
    requireText(errors, line.alt_pt, `${path}.line.alt_pt`);
    requireText(errors, line.alt_ar, `${path}.line.alt_ar`);
    if ((line.ar && !line.arz) || (line.alt_ar && !line.alt_arz)) {
      errors.push({
        code: 'missing_pronunciation',
        path: `${path}.line.arz`,
        message: `Spoken line translation needs arz at ${path}.line`,
      });
    }
    visibleSlot(errors, textOf(line), `${path}.line`);
    visibleSlot(errors, beat.narration_ar, `${path}.narration_ar`);
    visibleSlot(errors, textOf(beat.coach_tip), `${path}.coach_tip`);
    visibleSlot(errors, beat.frame, `${path}.frame`);
    if (Array.isArray(beat.word_bank)) {
      beat.word_bank.forEach((entry, wi) => visibleSlot(errors, textOf(entry), `${path}.word_bank[${wi}]`));
    }

    const difficulty = beat.difficulty;
    if (DIFFICULTY_ORDER[difficulty] == null) {
      errors.push({
        code: 'difficulty_order',
        path: `${path}.difficulty`,
        message: `Unknown difficulty ${difficulty} at ${path}`,
      });
    }

    const kind = beat.kind || (difficulty === 'open' ? 'open' : 'known');
    if (kind === 'known') {
      if (!Array.isArray(beat.accepted) || beat.accepted.length === 0) {
        errors.push({
          code: 'empty_accepted',
          path: `${path}.accepted`,
          message: `Known beat with no accepted answers at ${path}`,
        });
      }
    }
  });

  const hook = pack.closing_hook;
  const hookPt = hook?.pt || hook?.line?.pt;
  if (!hookPt) {
    errors.push({
      code: 'missing_field',
      path: 'closing_hook',
      message: 'Missing closing_hook',
    });
  }
  visibleSlot(errors, textOf(hook), 'closing_hook');

  const assessment = Array.isArray(pack.assessment) ? pack.assessment : [];
  assessment.forEach((task, idx) => {
    const path = `assessment[${idx}]`;
    if (!task?.target) {
      errors.push({
        code: 'assessment_target',
        path,
        message: `Assessment task with no target at ${path}`,
      });
    }
    const kind = task?.kind || (task?.criterion ? 'open' : 'known');
    if (kind === 'known') {
      if (!Array.isArray(task?.accepted) || task.accepted.length === 0) {
        errors.push({
          code: 'empty_accepted',
          path: `${path}.accepted`,
          message: `Known assessment with no accepted answers at ${path}`,
        });
      }
    }
    visibleSlot(errors, textOf(task?.line), `${path}.line`);
    visibleSlot(errors, task?.frame, `${path}.frame`);
  });

  // Script / slot checks across pack
  walkStrings(pack, '', (text, path) => {
    checkSlots(text, path, errors);

    if (pathLooksPortuguese(path) && ARABIC_RE.test(text)) {
      errors.push({
        code: 'arabic_in_pt',
        path,
        message: `Arabic letters in Portuguese field at ${path}`,
      });
    }

    if (pathLooksArabic(path) && LATIN_RE.test(text)) {
      // Allow if marked Portuguese segments inside mixed strings — strip [PT]... or <pt>...</pt>
      const withoutPt = text
        .replace(/<pt>[\s\S]*?<\/pt>/gi, '')
        .replace(/\[pt\][\s\S]*?\[\/pt\]/gi, '');
      if (LATIN_RE.test(withoutPt) && !SLOT_RE.test(text)) {
        // Latin-only Arabic display (no Arabic letters) — warn on arz/notes, reject on .ar titles.
        if (!ARABIC_RE.test(text) && LATIN_RE.test(withoutPt)) {
          const issue = {
            code: 'latin_in_ar',
            path,
            message: `Latin letters in Arabic field outside marked Portuguese at ${path}`,
          };
          if (pathAllowsLatinInArabic(path)) {
            warnings.push(issue);
          } else {
            errors.push(issue);
          }
        }
      }
    }

    if (pathLooksPortuguese(path) && ENGLISH_HINT_RE.test(text)) {
      warnings.push({
        code: 'english_in_pt',
        path,
        message: `Possible English in Portuguese field at ${path}`,
      });
    }
  });

  // Word-scope warning
  const allow = new Set(
    [...allowedWords.map((w) => (w.text || w).toLowerCase()), ...nucleus.map((w) => String(w).toLowerCase())]
  );
  if (spec?.clusters) {
    for (const phrases of Object.values(spec.clusters)) {
      for (const p of phrases || []) allow.add(String(p).toLowerCase());
    }
  }
  for (const w of spec?.support_words || []) allow.add(String(w).toLowerCase());

  walkStrings(pack, '', (text, path) => {
    if (!pathLooksPortuguese(path)) return;
    // Soft heuristic: skip long sentences
    if (text.split(/\s+/).length > 8) return;
    const key = text.trim().toLowerCase();
    if (key && allow.size && !allow.has(key) && !SLOT_RE.test(text)) {
      // only warn for short phrase-like accepted answers
      if (path.includes('accepted') || path.includes('word_bank')) {
        warnings.push({
          code: 'word_scope',
          path,
          message: `Possible out-of-allowlist phrase at ${path}: ${text}`,
        });
      }
    }
  });

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  };
}

function assertValidPack(pack, ctx) {
  const result = validatePack(pack, ctx);
  if (!result.ok) {
    throw new PracticeLessonValidationError(result.errors);
  }
  return result;
}

export {
  ALLOWED_SLOTS,
  PracticeLessonValidationError,
  validatePack,
  assertValidPack,
};
