import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { connectMongo, mongoConfigured } from '@/lib/mongo';
import { V2ConvoPackModel } from '@/lib/v2/mongo/models';
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
  /** Prefer published Mongo pack; fall back to latest draft, then file. */
  preferMongo?: boolean;
};

export type LoadConvoPackResult = ValidateConvoPackResult & {
  filePath?: string;
  source: 'mongo' | 'file';
  version?: number;
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

export function packIdToDay(packId: string): number | null {
  const m = /day-(\d+)/i.exec(packId) || /\.d(\d+)/i.exec(packId);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isInteger(n) ? n : null;
}

export function packIdToLang(packId: string): string {
  const m = /^(pt-PT|en-GB|de-DE)/i.exec(packId);
  return m?.[1] ?? 'pt-PT';
}

/** True when a content file exists for this pack id. */
export function convoPackFileExists(packId: string): boolean {
  return existsSync(convoPackPath(packId));
}

/**
 * True when the pack can be loaded now: content file OR Mongo published /
 * text_ready draft.
 */
export async function convoPackExistsAsync(packId: string): Promise<boolean> {
  if (convoPackFileExists(packId)) return true;
  if (!mongoConfigured()) return false;
  const day = packIdToDay(packId);
  if (day == null) return false;
  const target_lang = packIdToLang(packId);
  try {
    await connectMongo();
    const doc = await V2ConvoPackModel()
      .findOne({
        day,
        target_lang,
        $or: [{ status: 'published' }, { 'meta.text_ready': true }],
      })
      .select({ _id: 1 })
      .lean();
    return Boolean(doc);
  } catch {
    return false;
  }
}

async function loadFromMongo(
  packId: string,
  opts: ValidateConvoPackOpts,
): Promise<LoadConvoPackResult | null> {
  if (!mongoConfigured()) return null;
  await connectMongo();
  const day = packIdToDay(packId);
  const target_lang = packIdToLang(packId);
  if (day == null) return null;

  let doc = await V2ConvoPackModel()
    .findOne({ day, target_lang, status: 'published' })
    .sort({ version: -1 })
    .lean();
  if (!doc) {
    doc = await V2ConvoPackModel()
      .findOne({
        day,
        target_lang,
        'meta.text_ready': true,
      })
      .sort({ version: -1 })
      .lean();
  }
  if (!doc?.data) return null;

  const result = validateConvoPack(doc.data, {
    itemSurfaces: opts.itemSurfaces,
  });
  return {
    ...result,
    source: 'mongo',
    version: doc.version,
  };
}

/**
 * Load a conversation pack: Mongo first (published / text_ready), then content file.
 */
export async function loadConvoPackAsync(
  packId: string,
  opts: LoadConvoPackOpts,
): Promise<LoadConvoPackResult> {
  if (opts.preferMongo !== false) {
    try {
      const fromMongo = await loadFromMongo(packId, opts);
      if (fromMongo?.ok && fromMongo.pack) return fromMongo;
      if (fromMongo && !fromMongo.ok) {
        // Fall through to file if Mongo pack fails validation.
      }
    } catch (err) {
      console.warn(
        '[convo-load] mongo lookup failed',
        err instanceof Error ? err.message : err,
      );
    }
  }
  return loadConvoPackFromFileSync(packId, opts);
}

/**
 * Sync loader for tests / fixtures — content file only.
 * Prefer loadConvoPackAsync in app routes.
 */
export function loadConvoPack(
  packId: string,
  opts: LoadConvoPackOpts,
): LoadConvoPackResult {
  return loadConvoPackFromFileSync(packId, opts);
}

function loadConvoPackFromFileSync(
  packId: string,
  opts: LoadConvoPackOpts,
): LoadConvoPackResult {
  const filePath = convoPackPath(packId, opts.baseDir ?? DEFAULT_DIR);
  if (!existsSync(filePath)) {
    return {
      ok: false,
      issues: [
        {
          path: '(root)',
          rule: 'missing',
          message: `pack file not found: ${filePath}`,
          severity: 'error',
        },
      ],
      source: 'file',
      filePath,
    };
  }
  const raw = readConvoPackFile(filePath);
  const result = validateConvoPack(raw, { itemSurfaces: opts.itemSurfaces });
  return { ...result, filePath, source: 'file' };
}

/** Load + validate from an explicit file path (tests / fixtures). */
export function loadConvoPackFromFile(
  filePath: string,
  opts: ValidateConvoPackOpts,
): LoadConvoPackResult {
  const raw = readConvoPackFile(filePath);
  const result = validateConvoPack(raw, opts);
  return { ...result, filePath, source: 'file' };
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

export async function requireConvoPackAsync(
  packId: string,
  opts: LoadConvoPackOpts,
): Promise<ConvoPackData> {
  const result = await loadConvoPackAsync(packId, opts);
  if (!result.ok || !result.pack) {
    const msg = result.issues
      .filter((i) => i.severity === 'error')
      .map((i) => `${i.path}: [${i.rule}] ${i.message}`)
      .join('; ');
    throw new Error(`convo pack "${packId}" invalid: ${msg || 'unknown'}`);
  }
  return result.pack;
}
