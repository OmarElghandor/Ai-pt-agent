/**
 * Backfill main images for a micro series (default: demonstratives).
 * Usage: npx tsx scripts/v2/backfill-micro-mains.ts [seriesSlug]
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function loadEnv(name: string) {
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

loadEnv('.env.local');
loadEnv('.env');

async function main() {
  const seriesSlug = process.argv[2]?.trim() || 'demonstratives';
  const { connectMongo, mongoConfigured } = await import('../../lib/mongo');
  const { V2MicroSeriesModel, V2MicroClipModel } = await import(
    '../../lib/v2/mongo/microModels'
  );
  const { enqueueMicroSeriesImages } = await import(
    '../../lib/v2/micro/images/enqueue'
  );
  const { generateMicroSeriesMainImages } = await import(
    '../../lib/v2/micro/images/generateMains'
  );
  const { getImageByKey } = await import('../../lib/v2/images/generateOne');

  if (!mongoConfigured()) {
    console.error('MongoDB not configured');
    process.exit(1);
  }
  await connectMongo();
  const series = await V2MicroSeriesModel()
    .findOne({ slug: seriesSlug, target_lang: 'pt-PT' })
    .lean();
  if (!series) {
    console.error('series not found', seriesSlug);
    process.exit(1);
  }
  const seriesId = String(series._id);
  console.log('series', seriesSlug, seriesId);

  const enq = await enqueueMicroSeriesImages({
    seriesId,
    seriesSlug,
    targetLang: 'pt-PT',
  });
  console.log('enqueue', enq);

  const mains = await generateMicroSeriesMainImages({
    seriesId,
    seriesSlug,
    targetLang: 'pt-PT',
  });
  console.log('mains', mains);

  const clips = await V2MicroClipModel()
    .find({ series_id: seriesId })
    .sort({ order: 1 })
    .select({ slug: 1, layout: 1, main_image_key: 1 })
    .lean();
  for (const c of clips) {
    const key = c.main_image_key;
    const img = key ? await getImageByKey(key) : null;
    console.log(
      JSON.stringify({
        slug: c.slug,
        layout: c.layout,
        key,
        status: img?.status ?? null,
        hasUrl: Boolean(img?.url),
      }),
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
