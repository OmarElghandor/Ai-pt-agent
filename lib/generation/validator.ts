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

/** Normalize open-beat guard to a flat list of non-empty words. */
function normalizeGuardWords(guard) {
  if (guard == null) return [];
  if (typeof guard === 'string') {
    return guard
      .split(/[,|]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (Array.isArray(guard)) {
    return guard.map((w) => String(w || '').trim()).filter(Boolean);
  }
  if (typeof guard === 'object') {
    const words = guard.requiredWords || guard.required_words || guard.words || [];
    if (Array.isArray(words)) {
      return words.map((w) => String(w || '').trim()).filter(Boolean);
    }
  }
  return [];
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
/**
 * @param {any} pack
 * @param {{ allowedWords?: any[], nucleus?: any[], spec?: any }} [ctx]
 * @returns {{ ok: boolean, errors: any[], warnings: any[] }}
 */
function validatePack(pack, ctx = {}) {
  const allowedWords = /** @type {any[]} */ (ctx.allowedWords ?? []);
  const nucleus = /** @type {any[]} */ (ctx.nucleus ?? []);
  const spec = ctx.spec ?? null;
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

  const grammarCard = pack.grammar_card || pack.grammarCard;
  if (!grammarCard || typeof grammarCard !== 'object') {
    warnings.push({
      code: 'missing_grammar_card',
      path: 'grammar_card',
      message: 'Pack is missing grammar_card (ليـه؟ / tool-why)',
    });
  } else {
    const card = /** @type {Record<string, unknown>} */ (grammarCard);
    if (!String(card.rule_ar || card.ruleAr || '').trim()) {
      warnings.push({
        code: 'missing_grammar_card',
        path: 'grammar_card.rule_ar',
        message: 'grammar_card needs rule_ar',
      });
    }
    const examples = Array.isArray(card.examples) ? card.examples : [];
    if (examples.length < 2) {
      warnings.push({
        code: 'missing_grammar_card',
        path: 'grammar_card.examples',
        message: 'grammar_card needs two examples',
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
  const seenSceneWordPt = new Map();
  const isReviewSpec =
    typeof spec?.pattern === 'string' &&
    /بدون قواعد|review/i.test(String(spec.pattern));

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

    const words = Array.isArray(scene?.words) ? scene.words : null;
    const sceneId = String(id || '').toLowerCase();
    const isS03 = sceneId === 's03' || idx === 2;
    const isEarly = sceneId === 's01' || sceneId === 's02' || idx === 0 || idx === 1;

    if (isReviewSpec && words && words.length > 0) {
      warnings.push({
        code: 'scene_words_review',
        path: `scenes[${idx}].words`,
        message: `Review lesson scene should have empty words at scenes[${idx}]`,
      });
    }

    if (isS03 && words && words.length > 0) {
      warnings.push({
        code: 'scene_words_on_s03',
        path: `scenes[${idx}].words`,
        message: `s03 scene should have empty words at scenes[${idx}]`,
      });
    } else if (isEarly && !isS03 && !isReviewSpec) {
      const count = words ? words.filter(Boolean).length : 0;
      if (count < 3 || count > 5) {
        warnings.push({
          code: 'missing_scene_words',
          path: `scenes[${idx}].words`,
          message: `s01/s02 scene words should have 3 to 5 items at scenes[${idx}]`,
        });
      }
    }

    if (words) {
      words.forEach((entry, wi) => {
        const path = `scenes[${idx}].words[${wi}]`;
        const pt = String(entry?.pt || '').trim();
        const ar = textOf(entry?.ar || entry?.meaning || entry);
        const arz = String(entry?.arz || entry?.pronunciation || '').trim();
        if (!pt) {
          warnings.push({
            code: 'missing_scene_words',
            path: `${path}.pt`,
            message: `Scene word missing pt at ${path}`,
          });
          return;
        }
        if (!ar) {
          warnings.push({
            code: 'missing_scene_words',
            path: `${path}.ar`,
            message: `Scene word missing ar at ${path}`,
          });
        }
        if (ar && !arz) {
          warnings.push({
            code: 'missing_scene_word_arz',
            path: `${path}.arz`,
            message: `Scene word needs arz at ${path}`,
          });
        }
        visibleSlot(errors, pt, `${path}.pt`);
        visibleSlot(errors, ar, `${path}.ar`);
        const key = pt.toLowerCase().normalize('NFC');
        if (seenSceneWordPt.has(key)) {
          warnings.push({
            code: 'scene_word_duplicate',
            path: `${path}.pt`,
            message: `Scene word "${pt}" already listed at ${seenSceneWordPt.get(key)}`,
          });
        } else {
          seenSceneWordPt.set(key, path);
        }
      });
    }
  });

  const beats = Array.isArray(pack.beats) ? pack.beats : [];
  if (!Array.isArray(pack.beats) || beats.length === 0) {
    errors.push({
      code: 'no_beats',
      path: 'beats',
      message: 'Pack has no beats',
    });
  }

  const cueForbidden = /\b(asks|invites|offers|suggests|then)\b/i;
  const SLOT_IN_ACCEPTED = /\[(?:NAME|CITY|NUMBER|PLACE)\]/i;
  const questionFingerprints = new Map(); // key: speaker|fingerprint → beat path

  function normalizeQuestionPt(pt) {
    return String(pt || '')
      .normalize('NFC')
      .toLowerCase()
      .replace(/[.,!?;:…¿¡'"«»""''()[\]{}]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /** Question-word + first content verb, for duplicate-ask detection. */
  function questionFingerprint(pt) {
    const norm = normalizeQuestionPt(pt);
    if (!norm) return '';
    if (/\boutra vez\b/.test(norm) || /\bmesmo\b/.test(norm)) {
      return `repeat:${norm}`;
    }
    const qWords = [
      'como',
      'onde',
      'quando',
      'quanto',
      'quanta',
      'quantos',
      'quantas',
      'qual',
      'quais',
      'quem',
      'que',
      'o que',
      'por que',
      'porque',
    ];
    let qWord = '';
    for (const w of qWords) {
      if (norm === w || norm.startsWith(`${w} `)) {
        qWord = w;
        break;
      }
    }
    if (!qWord && !norm.includes('?')) return '';
    const tokens = norm.split(' ').filter(Boolean);
    const skip = new Set([
      ...qWords,
      'o',
      'a',
      'os',
      'as',
      'um',
      'uma',
      'de',
      'do',
      'da',
      'dos',
      'das',
      'te',
      'se',
      'me',
      'lhe',
      'tu',
      'voce',
      'você',
      'é',
      'e',
      'está',
      'esta',
    ]);
    const verb = tokens.find((t) => !skip.has(t) && t !== qWord) || '';
    return `${qWord || '?'}|${verb}`;
  }

  function sameAsk(a, b) {
    const fa = questionFingerprint(a);
    const fb = questionFingerprint(b);
    if (!fa || !fb) return normalizeQuestionPt(a) === normalizeQuestionPt(b) && Boolean(normalizeQuestionPt(a));
    return fa === fb;
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

    const lineExplain = beat.line_explain ?? beat.lineExplain;
    if (!textOf(lineExplain)) {
      warnings.push({
        code: 'missing_line_explain',
        path: `${path}.line_explain`,
        message: `Beat needs line_explain at ${path}`,
      });
    }

    const bankCount = wordBankCount(beat.word_bank);
    const difficulty = beat.difficulty;
    if (difficulty === 'guided') {
      if (bankCount < 3 || bankCount > 5) {
        warnings.push({
          code: 'word_bank_count',
          path: `${path}.word_bank`,
          message: `Guided beat word_bank should have 3 to 5 pieces at ${path}`,
        });
      }
    } else if (difficulty === 'supported' || difficulty === 'open') {
      if (bankCount < 3 || bankCount > 6) {
        warnings.push({
          code: 'word_bank_count',
          path: `${path}.word_bank`,
          message: `${difficulty} beat word_bank should have 3 to 6 pieces at ${path}`,
        });
      }
    }
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

    // Guard/criterion only for kind open. Difficulty open + kind known is code-graded.
    if (kind === 'open') {
      const guard = beat.guard ?? beat.code_guard ?? beat.codeGuard;
      const guardWords = normalizeGuardWords(guard);
      if (guardWords.length === 0) {
        errors.push({
          code: 'empty_guard',
          path: `${path}.guard`,
          message: `Open beat with empty guard at ${path}`,
        });
      } else if (guardWords.length !== 1) {
        errors.push({
          code: 'bad_guard',
          path: `${path}.guard`,
          message: `Open beat guard must be a list with exactly one word at ${path}`,
        });
      } else {
        const frameText = String(beat.frame || beat.sentence_frame || beat.sentenceFrame || '')
          .toLowerCase()
          .normalize('NFC');
        const word = guardWords[0].toLowerCase().normalize('NFC');
        if (!frameText.includes(word)) {
          errors.push({
            code: 'bad_guard',
            path: `${path}.guard`,
            message: `Open beat guard word must appear in frame at ${path}`,
          });
        }
      }
      const hint = beat.hint_note ?? beat.hintNote;
      if (!String(hint || '').trim()) {
        errors.push({
          code: 'missing_hint_note',
          path: `${path}.hint_note`,
          message: `Open beat needs hint_note at ${path}`,
        });
      }
      const accepted = Array.isArray(beat.accepted) ? beat.accepted : [];
      if (accepted.some((a) => SLOT_IN_ACCEPTED.test(String(a)))) {
        errors.push({
          code: 'open_with_slot',
          path: `${path}.accepted`,
          message: `Open beat must not use personal slots; use kind known at ${path}`,
        });
      }
    } else if (difficulty === 'open') {
      const hint = beat.hint_note ?? beat.hintNote;
      if (!String(hint || '').trim()) {
        errors.push({
          code: 'missing_hint_note',
          path: `${path}.hint_note`,
          message: `Open-difficulty known beat needs hint_note at ${path}`,
        });
      }
    }

    const cue = String(beat.reaction_cue || beat.reactionCue || '');
    if (cue.includes('?') || cueForbidden.test(cue)) {
      errors.push({
        code: 'reaction_cue_shape',
        path: `${path}.reaction_cue`,
        message: `reaction_cue must be a statement (no ?, asks/invites/offers/suggests/then) at ${path}`,
      });
    }

    if (difficulty === 'supported' && Array.isArray(beat.accepted) && beat.accepted[0]) {
      const tipText = textOf(beat.coach_tip).toLowerCase();
      const firstAccepted = String(beat.accepted[0]).trim().toLowerCase();
      if (firstAccepted && tipText.includes(firstAccepted)) {
        errors.push({
          code: 'supported_tip_leak',
          path: `${path}.coach_tip`,
          message: `Supported coach_tip contains the full first accepted answer at ${path}`,
        });
      }
    }

    const speaker = String(beat.speaker || '').trim().toLowerCase();
    const fp = questionFingerprint(line.pt);
    if (speaker && fp) {
      const key = `${speaker}|${fp}`;
      if (questionFingerprints.has(key)) {
        errors.push({
          code: 'duplicate_question',
          path: `${path}.line.pt`,
          message: `Same speaker asks the same thing as ${questionFingerprints.get(key)} at ${path}`,
        });
      } else {
        questionFingerprints.set(key, path);
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

  if (hookPt) {
    beats.forEach((beat, idx) => {
      const pt = beat?.line?.pt;
      if (pt && sameAsk(hookPt, pt)) {
        errors.push({
          code: 'closing_matches_beat',
          path: 'closing_hook.pt',
          message: `closing_hook.pt matches beats[${idx}].line.pt`,
        });
      }
    });
  }

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

  // Word-scope warning: compare single words, not whole phrases.
  function tokenizeWords(text) {
    return String(text)
      .toLowerCase()
      .normalize('NFC')
      .replace(/\[[a-z_]+\]/gi, ' ')
      .replace(/[.,!?;:…¿¡'"«»""''()[\]{}]/g, ' ')
      .split(/\s+/)
      .map((w) => w.trim())
      .filter((w) => w.length > 1);
  }

  const allowWords = new Set();
  for (const entry of allowedWords) {
    for (const word of tokenizeWords(entry?.text || entry)) allowWords.add(word);
  }
  for (const entry of nucleus) {
    for (const word of tokenizeWords(entry)) allowWords.add(word);
  }
  if (spec?.clusters) {
    for (const phrases of Object.values(spec.clusters)) {
      for (const p of phrases || []) {
        for (const word of tokenizeWords(p)) allowWords.add(word);
      }
    }
  }
  for (const w of spec?.support_words || []) {
    for (const word of tokenizeWords(w)) allowWords.add(word);
  }
  for (const hear of spec?.hear || []) {
    for (const word of tokenizeWords(hear?.pt || hear)) allowWords.add(word);
  }

  walkStrings(pack, '', (text, path) => {
    if (!pathLooksPortuguese(path)) return;
    if (
      !(
        path.includes('accepted') ||
        path.includes('word_bank') ||
        /\.words\[\d+\]\.pt$/.test(path) ||
        path.includes('.words[')
      )
    ) {
      return;
    }
    if (!allowWords.size) return;
    for (const word of tokenizeWords(text)) {
      if (!allowWords.has(word)) {
        warnings.push({
          code: 'word_scope',
          path,
          message: `Out-of-allowlist word "${word}" at ${path}`,
        });
      }
    }
  });

  // Only crash-hard issues block generation. Everything else is stored as a warning.
  const HARD_CODES = new Set(['no_beats', 'empty_accepted', 'missing_scene']);
  const hardErrors = [];
  const softFromErrors = [];
  for (const issue of errors) {
    if (HARD_CODES.has(issue.code)) {
      hardErrors.push(issue);
    } else {
      softFromErrors.push(issue);
    }
  }

  return {
    ok: hardErrors.length === 0,
    errors: hardErrors,
    warnings: [...warnings, ...softFromErrors],
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
