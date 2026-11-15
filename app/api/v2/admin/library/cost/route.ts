import { NextResponse } from 'next/server';
import { denyUnlessV2Admin } from '@/lib/v2/generation/adminGate';
import { mongoConfigured, connectMongo } from '@/lib/mongo';
import {
  V2LibraryEpisodeModel,
  V2LibraryJobModel,
  V2LibrarySettingsModel,
  V2LibraryTtsUsageModel,
} from '@/lib/v2/mongo/libraryModels';
import { LIBRARY_LANG } from '@/lib/v2/library/types';

export const runtime = 'nodejs';

export async function GET() {
  const denied = await denyUnlessV2Admin();
  if (denied) return denied;
  if (!mongoConfigured()) {
    return NextResponse.json({ error: 'MongoDB not configured' }, { status: 503 });
  }
  await connectMongo();
  const jobs = await V2LibraryJobModel()
    .find({ target_lang: LIBRARY_LANG, status: 'done' })
    .lean();
  let claudeUsd = 0;
  let elevenChars = 0;
  let imageUsd = 0;
  const perEpisode: Record<string, number> = {};
  for (const j of jobs) {
    const usd = Number((j.cost as { usd?: number } | undefined)?.usd ?? 0);
    const slug = j.episode_slug;
    perEpisode[slug] = (perEpisode[slug] ?? 0) + usd;
    if (
      j.kind === 'library_script' ||
      j.kind === 'library_line_rewrite' ||
      j.kind === 'library_tokens'
    ) {
      claudeUsd += usd;
    }
    if (j.kind === 'library_image') imageUsd += usd;
  }
  const tts = await V2LibraryTtsUsageModel().find({ target_lang: LIBRARY_LANG }).lean();
  for (const row of tts) elevenChars += row.chars ?? 0;

  const settings = await V2LibrarySettingsModel()
    .findOne({ target_lang: LIBRARY_LANG })
    .lean();
  const episodes = await V2LibraryEpisodeModel()
    .find({ target_lang: LIBRARY_LANG })
    .select('slug costs')
    .lean();

  return NextResponse.json({
    claude_usd: Math.round(claudeUsd * 10000) / 10000,
    elevenlabs_chars: elevenChars,
    image_usd: Math.round(imageUsd * 10000) / 10000,
    per_episode: perEpisode,
    episode_costs: episodes.map((e) => ({
      slug: e.slug,
      costs: e.costs ?? {},
    })),
    monthly_cap: settings?.monthly_char_limit ?? null,
    jobs_total_usd: Math.round(
      Object.values(perEpisode).reduce((a, b) => a + b, 0) * 10000,
    ) / 10000,
  });
}
