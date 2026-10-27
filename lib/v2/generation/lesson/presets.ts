import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import type { Preset } from '@/lib/v2/content/page';

const PRESET_DIR = path.join(process.cwd(), 'examples/presets');

export type PresetExampleFile = {
  preset: string;
  mode: string;
  source_day?: number;
  title_tl?: string;
  situation_eg?: string;
  note?: string;
  items: unknown[];
  page: unknown;
  questions?: unknown[];
};

export function loadPresetExample(preset: Preset): PresetExampleFile | null {
  const filePath = path.join(PRESET_DIR, `${preset}.json`);
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, 'utf8')) as PresetExampleFile;
  } catch {
    return null;
  }
}

export function formatPresetExampleForPrompt(preset: Preset): string {
  const ex = loadPresetExample(preset);
  if (!ex) return '';
  return `PRESET EXAMPLE (match this shape and field names; do not copy content)\n${JSON.stringify(ex)}`;
}

/** Approximate token count (~4 chars / token). */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

export function listPresetExampleFiles(): string[] {
  const names = [
    'phrases',
    'compare',
    'conjugation',
    'pattern',
    'dictionary',
    'scene',
    'story',
  ];
  return names
    .map((n) => path.join(PRESET_DIR, `${n}.json`))
    .filter((p) => existsSync(p));
}
