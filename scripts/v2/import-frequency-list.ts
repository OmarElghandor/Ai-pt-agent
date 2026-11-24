/**
 * Import a pt-PT frequency list into v2_frequency_words (17 §10 / W1).
 *
 * Preferred source: content/v2/frequency/pt-PT-frequency-5000.json
 *   { lemma, rank, forms?, variant? } — only variant "pt" is imported by default.
 * Lemma + each form are stored under the same rank for lookup.
 *
 * Also accepts:
 *   - JSON array: [{ "word"|"lemma": "ser", "rank": 1 }, ...]
 *   - Plain text: one word per line, or "rank\\tword"
 *
 *   npx tsx --env-file=.env.local scripts/v2/import-frequency-list.ts \\
 *     --lang=pt-PT --file=content/v2/frequency/pt-PT-frequency-5000.json
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { connectMongo, mongoConfigured } from '../../lib/mongo';
import { V2FrequencyWordModel } from '../../lib/v2/mongo/models';
import { normalizeFreqWord } from '../../lib/v2/weights/freq';

type Row = { word: string; rank: number; pos?: string };

type SourceEntry = {
  word?: string;
  lemma?: string;
  rank?: number;
  pos?: string;
  forms?: string[];
  variant?: string;
};

function parseArgs(argv: string[]): {
  lang: string;
  file: string | null;
  allVariants: boolean;
} {
  let lang = 'pt-PT';
  let file: string | null = null;
  let allVariants = false;
  for (const a of argv) {
    if (a.startsWith('--lang=')) lang = a.slice('--lang='.length);
    else if (a.startsWith('--file=')) file = a.slice('--file='.length);
    else if (a === '--all-variants') allVariants = true;
    else if (!a.startsWith('-') && !file) file = a;
  }
  return { lang, file, allVariants };
}

function parseFile(raw: string, allVariants: boolean): Row[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    const data = JSON.parse(trimmed) as
      | SourceEntry[]
      | { words?: SourceEntry[]; entries?: SourceEntry[] };
    const list = Array.isArray(data)
      ? data
      : (data.words ?? data.entries ?? []);
    const rows: Row[] = [];
    for (const r of list) {
      if (!allVariants && r.variant && r.variant !== 'pt') continue;
      const rank = Number(r.rank);
      if (!Number.isFinite(rank) || rank < 1) continue;
      const lemma = normalizeFreqWord(String(r.lemma ?? r.word ?? ''));
      if (!lemma) continue;
      rows.push({ word: lemma, rank, pos: r.pos ? String(r.pos) : undefined });
      for (const form of r.forms ?? []) {
        const f = normalizeFreqWord(form);
        if (f && f !== lemma) rows.push({ word: f, rank });
      }
    }
    return rows;
  }

  const rows: Row[] = [];
  let lineNo = 0;
  for (const line of trimmed.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    lineNo += 1;
    const tab = t.split(/\t+/);
    if (tab.length >= 2 && /^\d+$/.test(tab[0]!.trim())) {
      rows.push({
        word: normalizeFreqWord(tab.slice(1).join(' ')),
        rank: Number(tab[0]),
      });
    } else {
      rows.push({ word: normalizeFreqWord(t), rank: lineNo });
    }
  }
  return rows.filter((r) => r.word && r.rank >= 1);
}

async function main() {
  const { lang, file, allVariants } = parseArgs(process.argv.slice(2));
  if (!file) {
    console.error(
      'Usage: npx tsx scripts/v2/import-frequency-list.ts --lang=pt-PT --file=<path> [--all-variants]',
    );
    process.exit(1);
  }
  if (!mongoConfigured()) {
    console.error('Mongo is not configured (MONGODB_URI)');
    process.exit(1);
  }

  const abs = path.isAbsolute(file) ? file : path.join(process.cwd(), file);
  const rows = parseFile(readFileSync(abs, 'utf8'), allVariants);
  if (!rows.length) {
    console.error(`No rows parsed from ${abs}`);
    process.exit(1);
  }

  // Keep best (lowest) rank per word if lemma+forms collide.
  const best = new Map<string, Row>();
  for (const r of rows) {
    const prev = best.get(r.word);
    if (!prev || r.rank < prev.rank) best.set(r.word, r);
  }
  const unique = [...best.values()];

  await connectMongo();
  const ops = unique.map((r) => ({
    updateOne: {
      filter: { lang, word: r.word },
      update: {
        $set: {
          lang,
          word: r.word,
          rank: r.rank,
          ...(r.pos ? { pos: r.pos } : {}),
        },
      },
      upsert: true,
    },
  }));
  const result = await V2FrequencyWordModel().bulkWrite(ops, { ordered: false });
  console.log(
    JSON.stringify(
      {
        lang,
        file: abs,
        rows_raw: rows.length,
        rows_unique: unique.length,
        upserted: result.upsertedCount,
        modified: result.modifiedCount,
        matched: result.matchedCount,
      },
      null,
      2,
    ),
  );
  console.log(
    'Next: npm run v2:recompute-item-weights  (fills freq_rank and recomputes weights)',
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
