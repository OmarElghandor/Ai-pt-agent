#!/usr/bin/env node
/**
 * Import the Langify 90-day curriculum into the practice-lesson inputs the app already reads.
 *
 * Usage: node scripts/import-curriculum.mjs <path/to/langify_pt_pt_90_day_curriculum_v2.json>
 *
 * Writes (replacing the old inputs, same file names, same shapes):
 *   content/lessons/lesson-plan-seed-v1.json   one practice slot per curriculum day
 *   content/practice/word-priority.json        one "topic" per curriculum day = that day's vocabulary,
 *                                              patterns, question words and connectors
 *   content/practice/curriculum-import-report.json   what was mapped and what needs review
 *
 * Nothing else changes: allowed words become cumulative by day through the existing
 * buildCumulativeAllowedWords (earlier slots' topics + this slot's topic).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const src = process.argv[2];
if (!src) {
  console.error('Usage: node scripts/import-curriculum.mjs <curriculum.json>');
  process.exit(1);
}

const curriculum = JSON.parse(readFileSync(src, 'utf8'));
const grid = JSON.parse(
  readFileSync(path.join(ROOT, 'content/practice/grammar-grid.json'), 'utf8'),
).cells;

const PRIORITY = { P0: 1, P1: 1, P2: 2, P3: 3, P4: 3 };
const ARABIC = /[؀-ۿ]/;
const LATIN = /[A-Za-zÀ-ÿ]/;

/** "quem/onde/como" → ["quem","onde","como"]; keeps single items and "a / b" phrases intact. */
function splitBundle(text) {
  const t = String(text || '').trim();
  if (!t) return [];
  if (t.includes('/') && !t.includes(' / ')) {
    return t.split('/').map((s) => s.trim()).filter(Boolean);
  }
  return [t];
}

function clean(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

/** Word entry in the existing format: "text (note)" puts the Arabic gloss in the note field. */
function entry(pt, ar, priority) {
  const text = clean(pt).replace(/[()]/g, '');
  const gloss = clean(ar).replace(/[()]/g, '');
  return { text: gloss ? `${text} (${gloss})` : text, priority };
}

function normalise(s) {
  return ` ${String(s || '')
    .toLowerCase()
    .replace(/[.,!?;:…"«»()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()} `;
}

/**
 * Grammar-grid cells used by a lesson, read from its patterns, vocabulary and examples.
 * Multi-word forms (vou fazer, vais trabalhar) are matched first and removed; then single forms.
 * Bare "vou"/"vais" only count as ir.presente when followed by a place preposition.
 */
function inferCells(lesson) {
  let text = normalise(
    [
      ...(lesson.patterns || []).map((p) => p.pt),
      ...(lesson.vocabulary || []).map((v) => v.pt),
      ...(lesson.sentence_examples || []).map((e) => e.pt),
    ].join(' | '),
  );
  const found = [];
  const multi = grid.filter((c) => c.form.includes(' '));
  const single = grid.filter((c) => !c.form.includes(' '));
  for (const c of multi) {
    const f = ` ${c.form} `;
    if (text.includes(f)) {
      found.push(c.cell_id);
      text = text.split(f).join(' ');
    }
  }
  for (const c of single) {
    const f = ` ${c.form} `;
    if (!text.includes(f)) continue;
    if (c.verb === 'ir' && c.tense === 'presente') {
      const re = new RegExp(` ${c.form} (a|ao|à|aos|às|para) `);
      if (!re.test(text)) continue;
    }
    found.push(c.cell_id);
  }
  // keep grid order, drop the excluded ir.futuro_proximo cells, at most 3
  const order = grid.map((c) => c.cell_id);
  return [...new Set(found)]
    .filter((id) => !id.startsWith('ir.futuro_proximo'))
    .sort((a, b) => order.indexOf(a) - order.indexOf(b))
    .slice(0, 3);
}

const seed = [];
const topics = [];
/** Words already introduced on an earlier day; later days reach them through the cumulative list. */
const introducedBefore = new Set();
const review = {
  ids_with_empty_slug: [],
  title_not_arabic: [],
  setting_not_arabic: [],
  vocabulary_without_gloss: [],
  grammar_descriptors_in_vocabulary: [],
  lessons_without_cells: [],
};

for (const lesson of curriculum.lessons) {
  const id = lesson.id;
  if (/-$/.test(id)) review.ids_with_empty_slug.push(id);
  if (!ARABIC.test(lesson.title || '')) review.title_not_arabic.push(`${id}: ${lesson.title}`);
  const setting = lesson.scenario?.setting || '';
  if (LATIN.test(setting) && !ARABIC.test(setting)) review.setting_not_arabic.push(`${id}: ${setting}`);

  const cells = inferCells(lesson);
  if (!cells.length) review.lessons_without_cells.push(id);

  seed.push({
    slot_id: id,
    order: lesson.day,
    title_ar: lesson.title,
    topic: id,
    tier: 3,
    cefr_level: lesson.cefr,
    pattern: (lesson.patterns || []).map((p) => p.pt).join(' / '),
    cells,
    situation_ar: setting,
  });

  const words = [];
  const seen = new Set();
  const add = (pt, ar, priority, { always = false } = {}) => {
    const key = clean(pt).toLowerCase();
    if (!key || seen.has(key)) return;
    if (!always && introducedBefore.has(key)) return;
    seen.add(key);
    words.push(entry(pt, ar, priority));
  };
  for (const v of lesson.vocabulary || []) {
    if (v.pt.includes('+')) review.grammar_descriptors_in_vocabulary.push(`${id}: ${v.pt}`);
    if (!clean(v.ar)) review.vocabulary_without_gloss.push(`${id}: ${v.pt}`);
    const parts = splitBundle(v.pt);
    const glosses = splitBundle(v.ar);
    parts.forEach((p, i) =>
      add(p, glosses.length === parts.length ? glosses[i] : v.ar, PRIORITY[v.priority_class] ?? 2),
    );
  }
  for (const p of lesson.patterns || []) add(p.pt, p.ar, 1, { always: true });
  for (const q of lesson.question_words || []) splitBundle(q).forEach((x) => add(x, '', 1));
  for (const c of lesson.connectors || []) splitBundle(c).forEach((x) => add(x, '', 1));

  for (const k of seen) introducedBefore.add(k);
  topics.push({ topic: id, day: lesson.day, title: lesson.title, words });
}

const seedPath = path.join(ROOT, 'content/lessons/lesson-plan-seed-v1.json');
const wordsPath = path.join(ROOT, 'content/practice/word-priority.json');
const reportPath = path.join(ROOT, 'content/practice/curriculum-import-report.json');

writeFileSync(seedPath, `${JSON.stringify(seed, null, 2)}\n`);
writeFileSync(
  wordsPath,
  `${JSON.stringify(
    {
      _meta: {
        source: curriculum.curriculum_id,
        note: 'Generated by scripts/import-curriculum.mjs. One topic per curriculum day; priority 1 = P0/P1, 2 = P2, 3 = P3/P4. Text in parentheses is the Arabic gloss (stored as note).',
      },
      topics,
    },
    null,
    2,
  )}\n`,
);
writeFileSync(
  reportPath,
  `${JSON.stringify(
    {
      curriculum_id: curriculum.curriculum_id,
      lessons: seed.length,
      cells_by_lesson: Object.fromEntries(seed.map((s) => [s.slot_id, s.cells])),
      needs_review: review,
    },
    null,
    2,
  )}\n`,
);

console.log(`seed slots: ${seed.length}`);
console.log(`word topics: ${topics.length}, words: ${topics.reduce((n, t) => n + t.words.length, 0)}`);
for (const [k, v] of Object.entries(review)) console.log(`${k}: ${v.length}`);
