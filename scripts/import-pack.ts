#!/usr/bin/env npx tsx
/**
 * Import a hand-authored pack from content/packs/<key>.pack.json into practice_lessons.
 * Does not call Claude, the reviewer, or TTS.
 *
 * Usage: npm run import:pack -- pl-003
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { findSlot } from '../lib/generation/runPipeline';
import { validatePack } from '../lib/generation/validator';
import { adaptMongoPack } from '../lib/lessons/adaptMongoPack';
import { connectMongo, mongoConfigured } from '../lib/mongo';
import { PracticeLessonModel } from '../lib/mongo/models';

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

function cellFingerprint(cellIds: string[]): string {
  return createHash('sha1').update([...cellIds].sort().join('|')).digest('hex').slice(0, 16);
}

async function main() {
  const lessonKey = process.argv[2]?.trim();
  if (!lessonKey) {
    console.error('Usage: npm run import:pack -- <lessonKey>');
    process.exit(1);
  }

  if (!mongoConfigured()) {
    console.error('MONGODB_URI is not set (.env / .env.local)');
    process.exit(1);
  }

  const slot = findSlot(lessonKey);
  if (!slot) {
    console.error(`Unknown lesson_key ${lessonKey} — not in seed plan`);
    process.exit(1);
  }

  const packPath = resolve(process.cwd(), 'content/packs', `${lessonKey}.pack.json`);
  if (!existsSync(packPath)) {
    console.error(`Missing pack file: ${packPath}`);
    process.exit(1);
  }

  let pack: unknown;
  try {
    pack = JSON.parse(readFileSync(packPath, 'utf8'));
  } catch (err) {
    console.error(`Failed to parse ${packPath}:`, err instanceof Error ? err.message : err);
    process.exit(1);
  }

  const validation = validatePack(pack);
  if (!validation.ok) {
    console.error('validatePack failed:');
    for (const e of validation.errors) {
      console.error(`  - ${typeof e === 'string' ? e : (e?.message ?? JSON.stringify(e))}`);
    }
    process.exit(1);
  }
  if (validation.warnings?.length) {
    console.warn(`validatePack warnings: ${validation.warnings.length}`);
  }

  const adapted = adaptMongoPack({
    lesson_key: lessonKey,
    cefr_level: slot.cefr_level,
    topic: slot.topic,
    status: 'live',
    cell_ids: slot.cell_ids,
    requirements: { cells: slot.cell_ids, words: [] },
    spec: null,
    pack: pack as Record<string, unknown>,
  });
  if (!adapted) {
    console.error('adaptMongoPack returned null — pack is not playable');
    process.exit(1);
  }

  await connectMongo();
  const Model = PracticeLessonModel();

  const latest = await Model.findOne({ lesson_key: lessonKey }).sort({ version: -1 }).lean();
  const nextVersion = (latest?.version ?? 0) + 1;

  await Model.updateMany(
    { lesson_key: lessonKey, is_current: true },
    { $set: { is_current: false } },
  );

  await Model.create({
    lesson_key: lessonKey,
    version: nextVersion,
    is_current: true,
    topic: lessonKey,
    depth_tier: slot.depth_tier,
    cefr_level: slot.cefr_level || 'A0',
    curriculum_point: slot.curriculum_point,
    cell_fingerprint: cellFingerprint(slot.cell_ids),
    cell_ids: slot.cell_ids,
    status: 'live',
    generation_stage: 'done',
    spec: null,
    pack,
    source: 'hand',
    requirements: { cells: slot.cell_ids, words: [] },
    validator_warnings: validation.warnings ?? [],
    reviewer_issues: [],
    generation_log: { source: 'hand', imported_from: `content/packs/${lessonKey}.pack.json` },
  });

  console.log(
    `OK · ${lessonKey} v${nextVersion} · source=hand · ${adapted.beats.length} beats · ${adapted.assessmentTasks.length} assessment`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
