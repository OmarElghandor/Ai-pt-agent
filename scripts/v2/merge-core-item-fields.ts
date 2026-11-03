/**
 * Field-by-field merge of named fields from a zip or JSON into
 * content/v2/plan/pt-PT.core-items.json. Never replaces the whole file.
 *
 * Usage:
 *   npx tsx scripts/v2/merge-core-item-fields.ts <zip-or-json> --fields image,story_image,note
 *   npx tsx scripts/v2/merge-core-item-fields.ts image-prompts-patch.json --fields image,story_image --patch
 *
 * --patch accepts { items: { [id]: image }, story_image: { [day]: image } }.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

type Json = Record<string, unknown>;

type CoreItem = Json & { id?: string; image?: unknown };
type CoreDay = Json & {
  day?: number;
  story_image?: unknown;
  core_items?: CoreItem[];
};
type CoreFile = Json & {
  note?: unknown;
  days?: CoreDay[];
};

type ImagePatch = {
  items?: Record<string, unknown>;
  story_image?: Record<string, unknown>;
  merge_rule?: string;
};

const DEFAULT_TARGET = resolve(
  process.cwd(),
  'content/v2/plan/pt-PT.core-items.json',
);

function usage(): never {
  console.error(
    'Usage: npx tsx scripts/v2/merge-core-item-fields.ts <zip-or-json> --fields a,b,c [--target path] [--patch]',
  );
  process.exit(1);
}

function parseArgs(argv: string[]) {
  const positional: string[] = [];
  let fields: string[] = [];
  let target = DEFAULT_TARGET;
  let patch = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--fields') {
      fields = (argv[++i] ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (a === '--target') {
      target = resolve(process.cwd(), argv[++i] ?? '');
    } else if (a === '--patch') {
      patch = true;
    } else if (a.startsWith('-')) {
      usage();
    } else {
      positional.push(a);
    }
  }
  if (!positional[0] || !fields.length) usage();
  return { source: resolve(positional[0]), fields, target, patch };
}

function loadRawJson(source: string): unknown {
  if (!existsSync(source)) {
    throw new Error(`Source not found: ${source}`);
  }
  if (source.endsWith('.zip')) {
    const listing = execFileSync('unzip', ['-Z1', source], {
      encoding: 'utf8',
    });
    const names = listing
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    const entry =
      names.find((l) => l.endsWith('pt-PT.core-items.json')) ??
      names.find((l) => l.endsWith('image-prompts-patch.json')) ??
      null;
    if (!entry) {
      throw new Error('zip has no core-items or image-prompts-patch JSON');
    }
    const raw = execFileSync('unzip', ['-p', source, entry], {
      encoding: 'utf8',
      maxBuffer: 20 * 1024 * 1024,
    });
    return JSON.parse(raw);
  }
  return JSON.parse(readFileSync(source, 'utf8'));
}

function mergeFields(
  target: CoreFile,
  source: CoreFile,
  fields: string[],
): { updates: string[] } {
  const updates: string[] = [];
  const wantNote = fields.includes('note');
  const wantStory = fields.includes('story_image');
  const wantImage = fields.includes('image');

  if (wantNote && source.note !== undefined) {
    if (target.note !== source.note) {
      target.note = source.note;
      updates.push('note');
    }
  }

  const srcDays = new Map(
    (source.days ?? [])
      .filter((d) => typeof d.day === 'number')
      .map((d) => [d.day as number, d]),
  );

  for (const day of target.days ?? []) {
    if (typeof day.day !== 'number') continue;
    const src = srcDays.get(day.day);
    if (!src) continue;

    if (wantStory && Object.prototype.hasOwnProperty.call(src, 'story_image')) {
      day.story_image = src.story_image;
      updates.push(`day ${day.day}.story_image`);
    }

    if (wantImage) {
      const byId = new Map(
        (src.core_items ?? [])
          .filter((c) => typeof c.id === 'string')
          .map((c) => [c.id as string, c]),
      );
      for (const item of day.core_items ?? []) {
        if (!item.id) continue;
        const srcItem = byId.get(item.id);
        if (
          srcItem &&
          Object.prototype.hasOwnProperty.call(srcItem, 'image')
        ) {
          item.image = srcItem.image;
          updates.push(`day ${day.day}.${item.id}.image`);
        }
      }
    }
  }

  return { updates };
}

/** Patch format: items[id] = image, story_image[day] = image. */
function mergePatch(
  target: CoreFile,
  patch: ImagePatch,
  fields: string[],
): { updates: string[] } {
  const updates: string[] = [];
  const wantStory = fields.includes('story_image');
  const wantImage = fields.includes('image');

  if (wantStory && patch.story_image) {
    for (const [dayKey, image] of Object.entries(patch.story_image)) {
      const dayNum = Number(dayKey);
      const day = (target.days ?? []).find((d) => d.day === dayNum);
      if (!day) {
        updates.push(`skip story_image day ${dayKey} (missing)`);
        continue;
      }
      day.story_image = image;
      updates.push(`day ${dayNum}.story_image`);
    }
  }

  if (wantImage && patch.items) {
    const byId = new Map(Object.entries(patch.items));
    for (const day of target.days ?? []) {
      for (const item of day.core_items ?? []) {
        if (!item.id || !byId.has(item.id)) continue;
        item.image = byId.get(item.id);
        updates.push(`day ${day.day}.${item.id}.image`);
      }
    }
  }

  return { updates };
}

function main() {
  const { source, fields, target, patch } = parseArgs(process.argv.slice(2));
  const targetDoc = JSON.parse(readFileSync(target, 'utf8')) as CoreFile;
  const raw = loadRawJson(source);
  const { updates } = patch
    ? mergePatch(targetDoc, raw as ImagePatch, fields)
    : mergeFields(targetDoc, raw as CoreFile, fields);
  writeFileSync(target, `${JSON.stringify(targetDoc, null, 2)}\n`, 'utf8');
  console.log(`Merged fields [${fields.join(', ')}] into ${target}`);
  console.log(`Updates: ${updates.length}`);
  for (const u of updates.slice(0, 40)) console.log(`  ${u}`);
  if (updates.length > 40) console.log(`  … +${updates.length - 40} more`);
}

main();
