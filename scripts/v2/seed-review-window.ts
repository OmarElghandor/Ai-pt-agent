/**
 * Mark published days 1–3 completed for a learner so /review builds a window.
 * Usage:
 *   npx tsx scripts/v2/seed-review-window.ts --user=<v2_user_id>
 *   npx tsx scripts/v2/seed-review-window.ts --user=<id> --through=3
 *
 * Then open /review (current day becomes through+1) or /review?day=4
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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

import { connectMongo, mongoConfigured } from '../../lib/mongo';
import { listPublishedLessonSummaries } from '../../lib/v2/content/getPublishedLesson';
import { V2LessonProgressModel } from '../../lib/v2/mongo/models';
import { currentDayFromCompleted } from '../../lib/v2/progress/learnerDay';
import { PHASE1_STORY_DAYS } from '../../lib/v2/practice/window';

function arg(name: string): string | null {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
}

async function main() {
  const userId = arg('user');
  if (!userId) {
    console.error('Usage: npx tsx scripts/v2/seed-review-window.ts --user=<v2_user_id>');
    process.exit(1);
  }
  if (!mongoConfigured()) {
    console.error('MongoDB not configured');
    process.exit(1);
  }

  const through = Math.max(1, Number(arg('through') ?? 3));
  const targetLang = arg('lang') ?? 'pt-PT';

  await connectMongo();
  const published = await listPublishedLessonSummaries(targetLang);
  const publishedDays = new Set(published.map((p) => p.day));

  const toComplete: number[] = [];
  for (let d = 1; d <= through; d++) {
    if (PHASE1_STORY_DAYS.has(d)) continue;
    if (!publishedDays.has(d)) {
      console.warn(`skip day ${d}: not published`);
      continue;
    }
    toComplete.push(d);
  }

  if (toComplete.length === 0) {
    console.error('No published core days to mark completed');
    process.exit(1);
  }

  const now = new Date();
  for (const day of toComplete) {
    await V2LessonProgressModel().updateOne(
      { user_id: userId, target_lang: targetLang, day },
      {
        $set: {
          user_id: userId,
          target_lang: targetLang,
          day,
          status: 'completed',
          completed_at: now,
          last_opened_at: now,
        },
        $setOnInsert: {
          steps: [],
          day_questions: {
            total: 0,
            answered: 0,
            first_try_correct: 0,
            per_skill: {},
          },
          practice: { times: 0, said: 0, understood: 0, best_said: 0 },
          times_completed: 1,
          minutes: 0,
        },
      },
      { upsert: true },
    );
  }

  // Ensure next day is available so path/review agree
  const nextDay = through + 1;
  if (publishedDays.has(nextDay)) {
    await V2LessonProgressModel().updateOne(
      { user_id: userId, target_lang: targetLang, day: nextDay },
      {
        $setOnInsert: {
          user_id: userId,
          target_lang: targetLang,
          day: nextDay,
          status: 'available',
          steps: [],
          day_questions: {
            total: 0,
            answered: 0,
            first_try_correct: 0,
            per_skill: {},
          },
          practice: { times: 0, said: 0, understood: 0, best_said: 0 },
          times_completed: 0,
          minutes: 0,
        },
      },
      { upsert: true },
    );
  }

  const current = currentDayFromCompleted(toComplete);
  console.log(
    JSON.stringify(
      {
        ok: true,
        user_id: userId,
        completed_days: toComplete,
        current_day: current,
        open: `/review?day=${current}`,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
