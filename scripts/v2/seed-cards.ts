#!/usr/bin/env tsx
/**
 * Dev seed: item states for days 1–7 so /cards can show every state.
 * Weak items are three v2_errors rows (same scope + tool_id). The weak-area
 * rule computes them. This script does not write weakToolIds.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getCurrentUserId } from '../../lib/auth/currentUser';
import { connectMongo, mongoConfigured } from '../../lib/mongo';
import { loadPublishedFlashcardsThrough } from '../../lib/v2/decks';
import {
  V2ErrorModel,
  V2ItemStateModel,
  V2SessionModel,
} from '../../lib/v2/mongo/models';
import { createItemState } from '../../lib/v2/progress';

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

type SeedItem = { id: string; day: number; tl: string };
type Bucket = 'new' | 'due' | 'weak' | 'graduated';

function daysAgo(n: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d;
}

function daysAhead(n: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}

function partition(items: SeedItem[]): Map<string, Bucket> {
  const out = new Map<string, Bucket>();
  const rest = items.filter((i) => i.id !== 'verb.dormir');
  const graduated: SeedItem[] = [];
  const weak: SeedItem[] = [];
  const due: SeedItem[] = [];
  if (rest.length >= 1) graduated.push(rest.pop()!);
  if (rest.length >= 4) graduated.push(rest.pop()!);
  if (rest.length >= 1) weak.push(rest.shift()!);
  if (rest.length >= 3) weak.push(rest.shift()!);
  const dueCount = Math.max(rest.length > 0 ? 1 : 0, Math.floor(rest.length / 2));
  due.push(...rest.splice(0, dueCount));
  for (const item of rest) out.set(item.id, 'new');
  for (const item of due) out.set(item.id, 'due');
  for (const item of weak) out.set(item.id, 'weak');
  for (const item of graduated) out.set(item.id, 'graduated');
  const dormir = items.find((i) => i.id === 'verb.dormir');
  if (dormir) out.set(dormir.id, 'due');
  return out;
}

async function main() {
  if (!mongoConfigured()) {
    console.error('MONGODB_URI required');
    process.exit(1);
  }
  const userId = getCurrentUserId();
  if (!userId) {
    console.error('DEV_LANGIFY_USER_ID must be a Langify user id');
    process.exit(1);
  }

  await connectMongo();
  const { byDay, byId } = await loadPublishedFlashcardsThrough(7);
  if (byDay.size === 0) {
    console.error(
      'No published lessons for days 1–7. Publish a lesson in that range, then run this again.',
    );
    process.exit(1);
  }

  const items: SeedItem[] = [];
  for (const [day, bank] of byDay) {
    if (day < 1 || day > 7) continue;
    for (const item of bank) {
      const tl = 'tl' in item && typeof item.tl === 'string' ? item.tl : item.id;
      items.push({ id: item.id, day, tl });
    }
  }
  if (!byId.has('verb.dormir') && !items.some((i) => i.id === 'verb.dormir')) {
    items.push({ id: 'verb.dormir', day: 7, tl: 'dormir' });
  }

  const buckets = partition(items);
  const State = V2ItemStateModel();
  const counts: Record<Bucket, number> = {
    new: 0,
    due: 0,
    weak: 0,
    graduated: 0,
  };

  for (const item of items) {
    const bucket = buckets.get(item.id) ?? 'new';
    counts[bucket] += 1;
    const state = createItemState({
      user_id: userId,
      item_id: item.id,
      introducedDay: item.day,
    });
    if (bucket === 'due' || bucket === 'weak') {
      state.card.interval = 1;
      state.card.dueAt = daysAgo(1).toISOString();
      state.levels.understood = 1;
    }
    if (bucket === 'graduated') {
      state.card.interval = 21;
      state.card.masteryLevel = 'mastered';
      state.card.consecutiveCorrect = 2;
      state.card.dueAt = daysAhead(30).toISOString();
      state.card.knowCheckDueAt = daysAhead(30).toISOString();
      state.usedCorrectlyIn = ['day:1', 'day:2'];
      state.levels.understood = 1;
      state.levels.said = 1;
    }
    const set: Partial<typeof state> = { ...state };
    delete set.weakToolIds;
    await State.updateOne(
      { user_id: userId, item_id: item.id },
      { $set: set, $unset: { weakToolIds: '' } },
      { upsert: true },
    );
  }

  const weakItems = items.filter((i) => buckets.get(i.id) === 'weak');
  await V2ErrorModel().deleteMany({
    user_id: userId,
    item_id: { $in: weakItems.map((i) => i.id) },
  });
  const now = Date.now();
  const errorDocs = weakItems.flatMap((item, itemIndex) =>
    [0, 1, 2].map((n) => ({
      user_id: userId,
      item_id: item.id,
      tool_id: `seed:${item.id}`,
      skill: 'reading',
      category: 'vocabulary',
      scope: 'forgot_word',
      wrong: '—',
      right: item.tl,
      at: new Date(now - (itemIndex * 3 + n) * 1000),
    })),
  );
  if (errorDocs.length) await V2ErrorModel().insertMany(errorDocs);

  await V2SessionModel().deleteMany({ user_id: userId, kind: 'cards' });

  console.log(
    `Seeded ${items.length} cards for ${userId}: ` +
      `${counts.new} new, ${counts.due} due, ${counts.weak} weak (${errorDocs.length} errors), ` +
      `${counts.graduated} graduated. Cleared today's cards session.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
