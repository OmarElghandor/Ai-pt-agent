import { readFileSync } from 'node:fs';
import path from 'node:path';
import { applyRegisterMap } from './registerMap';

const WORD_PATH = path.join(process.cwd(), 'content', 'practice', 'word-priority.json');
const NUCLEO_PATH = path.join(process.cwd(), 'content', 'practice', 'nucleo-gramatical.json');
const GRID_PATH = path.join(process.cwd(), 'content', 'practice', 'grammar-grid.json');

type WordEntry = { text: string; priority: number; note: string | null };
type TopicBlock = { topic: string; words: Array<{ text: string; priority?: number; note?: string }> };

let wordCache: { topics: TopicBlock[] } | null = null;
let nucleoCache: string[] | null = null;
let gridCache: Array<{
  cell_id: string;
  verb: string;
  tense: string;
  person: string;
  form: string;
}> | null = null;

export function loadWordPriority(): { topics: TopicBlock[] } {
  if (wordCache) return wordCache;
  wordCache = JSON.parse(readFileSync(WORD_PATH, 'utf8')) as { topics: TopicBlock[] };
  return wordCache;
}

export function loadNucleo(): string[] {
  if (nucleoCache) return nucleoCache;
  const raw = JSON.parse(readFileSync(NUCLEO_PATH, 'utf8')) as { words?: string[] };
  nucleoCache = (raw.words || []).map((w) => String(w).trim()).filter(Boolean);
  return nucleoCache;
}

export function loadGrammarGrid(): Array<{
  cell_id: string;
  verb: string;
  tense: string;
  person: string;
  form: string;
}> {
  if (gridCache) return gridCache;
  const raw = JSON.parse(readFileSync(GRID_PATH, 'utf8')) as unknown;
  const cells = Array.isArray(raw)
    ? raw
    : ((raw as { cells?: unknown[] }).cells ?? []);
  gridCache = (cells as Array<Record<string, string>>).map((c) => ({
    cell_id: String(c.cell_id),
    verb: String(c.verb ?? ''),
    tense: String(c.tense ?? ''),
    person: String(c.person ?? ''),
    form: String(c.form ?? ''),
  }));
  return gridCache;
}

function cleanWordEntry(raw: string, priority = 1): WordEntry | null {
  const s = String(raw || '').trim();
  if (!s) return null;
  const m = s.match(/^(.*?)\s*\(([^)]*)\)\s*$/);
  const text = applyRegisterMap(m ? m[1].trim() : s);
  const note = m ? m[2].trim() : null;
  return { text, priority: Number(priority) || 1, note: note || null };
}

export function wordsForTopic(
  topic: string,
  { maxPriority = 3 }: { maxPriority?: number } = {},
): WordEntry[] {
  const data = loadWordPriority();
  const block = (data.topics || []).find((t) => t.topic === topic);
  if (!block) return [];
  const seen = new Set<string>();
  const out: WordEntry[] = [];
  for (const w of block.words || []) {
    if ((w.priority || 1) > maxPriority) continue;
    const entry = cleanWordEntry(w.text, w.priority);
    if (!entry) continue;
    const key = entry.text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    if (w.note && !entry.note) entry.note = w.note;
    out.push(entry);
  }
  return out;
}

export function isNucleoWord(word: string): boolean {
  const set = new Set(loadNucleo().map((w) => w.toLowerCase()));
  return set.has(String(word || '').trim().toLowerCase());
}

export function topicPriorityOrder(): string[] {
  return (loadWordPriority().topics || []).map((t) => t.topic);
}

/** Test helper */
export function _resetWordCachesForTests(): void {
  wordCache = null;
  nucleoCache = null;
  gridCache = null;
}
