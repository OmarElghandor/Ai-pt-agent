/**
 * §3.2b: translate AR for authored demonstratives lines, persist three clips
 * with shared scene_key, force-generate the shared main picture, STOP before vision.
 *
 * Usage: npx tsx scripts/v2/apply-demonstratives-scene-32b.ts
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
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

const SLUGS = ['este-esta', 'esse-essa', 'aquele-aquela'] as const;

async function translateAr(tls: string[]): Promise<string[]> {
  const { callClaudeJson, zodToolSchema } = await import(
    '../../lib/generation/claudeClient'
  );
  const { z } = await import('zod');
  const schema = z.object({
    lines: z.array(
      z.object({
        tl: z.string(),
        ar: z.string().min(1),
      }),
    ),
  });
  const model =
    process.env.MICRO_CLIP_MODEL?.trim() ||
    process.env.CLAUDE_MODEL?.trim() ||
    'claude-sonnet-5-5';
  const res = await callClaudeJson(
    `You translate European Portuguese learner sentences into simple Modern Standard Arabic meanings for Egyptian Arabic speakers learning Portuguese.
Return only JSON via the tool. Keep meanings short and natural. Do not change the Portuguese.`,
    `Translate each tl to ar (simple MSA):\n${tls.map((t, i) => `${i + 1}. ${t}`).join('\n')}`,
    {
      label: 'micro-scene-32b-ar',
      model,
      maxTokens: 2048,
      skipProviderFork: true,
      tool: {
        name: 'submit_translations',
        description: 'Submit Portuguese→Arabic translations',
        inputSchema: zodToolSchema(schema),
      },
    },
  );
  const parsed = schema.parse(res.data);
  const byTl = new Map(parsed.lines.map((l) => [l.tl.trim(), l.ar.trim()]));
  return tls.map((tl) => {
    const ar = byTl.get(tl.trim());
    if (!ar) throw new Error(`missing AR for: ${tl}`);
    return ar;
  });
}

async function main() {
  const { connectMongo, mongoConfigured } = await import('../../lib/mongo');
  const { loadMicroOutline } = await import('../../lib/v2/micro/outline');
  const { generateMicroClip } = await import('../../lib/v2/micro/generate');
  const { ensureMicroSeries, persistGeneratedClip } = await import(
    '../../lib/v2/micro/persist'
  );
  const { publishMicroClip } = await import('../../lib/v2/micro/publish');
  const { generateContentImage } = await import(
    '../../lib/v2/images/generateOne'
  );
  const { buildMicroMainImageSpec, microSceneImageKey } = await import(
    '../../lib/v2/micro/images/main'
  );
  const { getImageByKey } = await import('../../lib/v2/images/generateOne');

  if (!mongoConfigured()) {
    console.error('MongoDB not configured');
    process.exit(1);
  }
  await connectMongo();

  let outline = loadMicroOutline();
  const series = outline.series.find((s) => s.slug === 'demonstratives');
  if (!series) throw new Error('demonstratives series missing');

  // Fill PENDING Arabic in outline via model, then rewrite file.
  const outlinePath = resolve(
    process.cwd(),
    'content/v2/micro/pt-PT.outline.json',
  );
  const raw = JSON.parse(readFileSync(outlinePath, 'utf8')) as {
    series: Array<{
      slug: string;
      clips: Array<{
        slug: string;
        authored_lines?: Array<{ tl: string; ar: string }>;
      }>;
    }>;
  };
  const demo = raw.series.find((s) => s.slug === 'demonstratives');
  if (!demo) throw new Error('outline demonstratives missing');

  const pendingTls: string[] = [];
  for (const slug of SLUGS) {
    const clip = demo.clips.find((c) => c.slug === slug);
    for (const line of clip?.authored_lines ?? []) {
      if (line.ar === 'PENDING') pendingTls.push(line.tl);
    }
  }
  if (pendingTls.length) {
    console.log('translating', pendingTls.length, 'lines…');
    const ars = await translateAr(pendingTls);
    let i = 0;
    for (const slug of SLUGS) {
      const clip = demo.clips.find((c) => c.slug === slug);
      for (const line of clip?.authored_lines ?? []) {
        if (line.ar === 'PENDING') {
          line.ar = ars[i++]!;
        }
      }
    }
    writeFileSync(outlinePath, `${JSON.stringify(raw, null, 2)}\n`, 'utf8');
    outline = loadMicroOutline();
  }

  const seriesOutline = outline.series.find((s) => s.slug === 'demonstratives')!;
  const seriesId = await ensureMicroSeries(seriesOutline, outline.target_lang);
  const sceneKey = 'demonstratives.pastelaria-pov';
  const imageKey = microSceneImageKey(outline.target_lang, sceneKey);

  for (const slug of SLUGS) {
    const clip = seriesOutline.clips.find((c) => c.slug === slug);
    if (!clip?.authored_lines?.length) {
      throw new Error(`missing authored lines for ${slug}`);
    }
    console.log('persist', slug);
    const result = await generateMicroClip({
      series: seriesOutline,
      clip,
      targetLang: outline.target_lang,
    });
    if (!result.ok) {
      console.error(slug, result);
      process.exit(1);
    }
    const id = await persistGeneratedClip({
      seriesId,
      seriesSlug: seriesOutline.slug,
      clip,
      targetLang: outline.target_lang,
      result,
    });
    const pub = await publishMicroClip(id);
    console.log('published', slug, pub);
  }

  const imageSpecText =
    seriesOutline.clips.find((c) => c.slug === 'este-esta')?.image_spec ?? '';
  const spec = buildMicroMainImageSpec({
    title_tl: 'este · esse · aquele',
    layout: 'scene',
    image_spec: imageSpecText,
    region_objects: [
      'chocolate cake on white plate',
      'plastic water bottle',
      'round loaf of bread',
      'white coffee cup on saucer',
      'cardboard box of custard tarts',
      'tall glass jar of biscuits',
      'viewer right hand pointing in foreground',
    ],
  });

  console.log('generating shared main', imageKey);
  const gen = await generateContentImage({
    key: imageKey,
    spec,
    usedBy: [`micro:demonstratives`, `scene:${sceneKey}`],
    force: true,
    quality: 'medium',
    ratio: '4:3',
  });
  const img = await getImageByKey(imageKey);
  const url = img?.url ?? gen.doc.url ?? null;
  console.log(
    JSON.stringify(
      {
        key: imageKey,
        status: img?.status ?? gen.doc.status,
        url,
        skipped: gen.skipped,
        reason: gen.reason ?? null,
      },
      null,
      2,
    ),
  );
  console.log('STOP_BEFORE_VISION');
  if (!url) process.exit(2);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
