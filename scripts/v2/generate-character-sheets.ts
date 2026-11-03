/**
 * Generate / refresh character reference sheets (high quality).
 * Usage: npx tsx scripts/v2/generate-character-sheets.ts [--only=tiago,graca,nour]
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { CHARACTER_IDS } from '../../lib/v2/characters/registry';
import { connectMongo, mongoConfigured } from '../../lib/mongo';
import {
  generateCharacterSheet,
  localImagePath,
} from '../../lib/v2/images';
import { resolveLocalPathFromUrl } from '../../lib/v2/images/storage';
import { V2ImageModel } from '../../lib/v2/mongo/models';

function loadEnvFile(name: string) {
  const path = resolve(process.cwd(), name);
  if (!existsSync(path)) return;
  for (const raw of readFileSync(path, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (!key || process.env[key] !== undefined) continue;
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}

loadEnvFile('.env.local');
loadEnvFile('.env');

function parseOnly(argv: string[]): string[] | null {
  for (const a of argv) {
    if (a.startsWith('--only=')) {
      return a
        .slice('--only='.length)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }
  return null;
}

async function main() {
  if (!mongoConfigured()) throw new Error('MongoDB not configured');
  await connectMongo();

  const only = parseOnly(process.argv.slice(2));
  const ids = only?.length ? only : [...CHARACTER_IDS];
  const outDir = resolve(process.cwd(), 'tmp', 'character-sheets');
  mkdirSync(outDir, { recursive: true });

  const results: Record<string, { status: string; url?: string | null; path?: string }> =
    {};

  for (const id of ids) {
    const key = `character.${id}`;
    const existing = await V2ImageModel().findOne({ key }).lean();
    if (existing?.status === 'ready' && existing.url && !only) {
      console.log('skip ready', id);
    } else {
      if (existing) {
        await V2ImageModel().updateOne(
          { key },
          {
            $set: { status: 'flagged', reason: 'force regen sheet' },
            $unset: { generating_started_at: 1 },
          },
        );
      }
      console.log('— generate', id);
      const result = await generateCharacterSheet(id);
      console.log(result.doc.status, result.doc.url, result.reason ?? '');
    }

    const doc = await V2ImageModel().findOne({ key }).lean();
    let localPath: string | undefined;
    if (doc?.url) {
      localPath =
        resolveLocalPathFromUrl(String(doc.url)) ??
        (existsSync(localImagePath(key)) ? localImagePath(key) : undefined);
      if (localPath) {
        const dest = join(outDir, `${id}.png`);
        copyFileSync(localPath, dest);
        localPath = dest;
      }
    }
    results[id] = {
      status: String(doc?.status ?? 'missing'),
      url: doc?.url ? String(doc.url) : null,
      path: localPath,
    };
  }

  console.log('\n=== RESULT ===');
  console.log(JSON.stringify(results, null, 2));
  console.log('Copied under', outDir);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
