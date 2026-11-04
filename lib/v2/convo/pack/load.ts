import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  validateConvoPack,
  type ValidateConvoPackOpts,
  type ValidateConvoPackResult,
} from './validate';
import type { ConvoPackData } from './schema';

const DEFAULT_DIR = path.join(process.cwd(), 'content/v2/convo');

export type LoadConvoPackOpts = ValidateConvoPackOpts & {
  /** Override content directory (default: content/v2/convo). */
  baseDir?: string;
};

export type LoadConvoPackResult = ValidateConvoPackResult & {
  filePath: string;
};

/** Absolute path for a pack id under a content directory. */
export function convoPackPath(
  packId: string,
  baseDir: string = DEFAULT_DIR,
): string {
  const safe = packId.replace(/\.json$/i, '');
  return path.join(baseDir, `${safe}.json`);
}

/** Read and parse a pack JSON file (no validation). */
export function readConvoPackFile(filePath: string): unknown {
  const raw = readFileSync(filePath, 'utf8');
  return JSON.parse(raw) as unknown;
}

/**
 * Load a conversation pack from a content file and validate it.
 * Mongo lookup comes later (T5.3).
 */
export function loadConvoPack(
  packId: string,
  opts: LoadConvoPackOpts,
): LoadConvoPackResult {
  const filePath = convoPackPath(packId, opts.baseDir ?? DEFAULT_DIR);
  const raw = readConvoPackFile(filePath);
  const result = validateConvoPack(raw, { itemSurfaces: opts.itemSurfaces });
  return { ...result, filePath };
}

/** Load + validate from an explicit file path (tests / fixtures). */
export function loadConvoPackFromFile(
  filePath: string,
  opts: ValidateConvoPackOpts,
): LoadConvoPackResult {
  const raw = readConvoPackFile(filePath);
  const result = validateConvoPack(raw, opts);
  return { ...result, filePath };
}

export function requireConvoPack(
  packId: string,
  opts: LoadConvoPackOpts,
): ConvoPackData {
  const result = loadConvoPack(packId, opts);
  if (!result.ok || !result.pack) {
    const msg = result.issues
      .filter((i) => i.severity === 'error')
      .map((i) => `${i.path}: [${i.rule}] ${i.message}`)
      .join('; ');
    throw new Error(`convo pack "${packId}" invalid: ${msg || 'unknown'}`);
  }
  return result.pack;
}
