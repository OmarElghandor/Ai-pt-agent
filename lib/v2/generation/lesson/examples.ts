import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const EXAMPLES_DIR = path.join(process.cwd(), 'examples');

/** Prefer one compact gold example for outline caching (speed). */
const GOLD_FILES = ['day01-example.json', 'day06-example.json'];

export function loadGoldExamples(): { name: string; json: string }[] {
  const out: { name: string; json: string }[] = [];
  for (const name of GOLD_FILES) {
    const full = path.join(EXAMPLES_DIR, name);
    if (!existsSync(full)) continue;
    out.push({ name, json: readFileSync(full, 'utf8') });
  }
  return out;
}

export function formatExamplesForPrompt(): string {
  const examples = loadGoldExamples();
  if (examples.length === 0) return '';
  // One example is enough for shape; keeps outline prompt cache smaller/faster.
  const primary = examples[0]!;
  const truncated =
    primary.json.length > 24_000
      ? `${primary.json.slice(0, 24_000)}\n…(truncated)`
      : primary.json;
  return `GOLD EXAMPLE (match this shape and field names; do not copy content)\n(${primary.name}):\n${truncated}`;
}
